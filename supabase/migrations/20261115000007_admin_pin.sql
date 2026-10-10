-- The admin signs in with a PIN like the stations do (role 'admin'); Google sign-in and the allowlist are gone.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.station_pins'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%checkin%' loop
    execute format('alter table public.station_pins drop constraint %I', c);
  end loop;
end $$;
alter table public.station_pins
  add constraint station_pins_role_check check (role in ('checkin', 'merchandise', 'draw', 'prizes', 'admin'));

drop function if exists public.is_admin(uuid, text);
drop table if exists public.admins;

-- The admin session is audited as 'admin' (the string), station roles as 'station'; an e-mail address still counts as admin.
create or replace function public.actor_type_of(p_actor text) returns text
language sql immutable
as $$ select case when p_actor = 'admin' or position('@' in coalesce(p_actor, '')) > 0 then 'admin' else 'station' end $$;

create or replace function public.set_station_pin(p_event uuid, p_role text, p_pin text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if p_role not in ('checkin', 'merchandise', 'draw', 'prizes', 'admin') then
    return jsonb_build_object('status', 'INVALID_ROLE');
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('status', 'INVALID_PIN');
  end if;
  if exists (select 1 from public.station_pins
              where event_id = p_event and role <> p_role and pin_hash = crypt(p_pin, pin_hash)) then
    return jsonb_build_object('status', 'PIN_IN_USE');
  end if;

  insert into public.station_pins (event_id, role, pin_hash, active)
  values (p_event, p_role, crypt(p_pin, gen_salt('bf')), true)
  on conflict (event_id, role) do update
    set pin_hash = excluded.pin_hash, active = true,
        session_version = public.station_pins.session_version + 1, updated_at = now();

  perform public.audit(p_event, 'admin', p_actor, 'set_pin', 'station_pin', p_role, '{}'::jsonb);
  return jsonb_build_object('status', 'OK');
end $$;

select public.lock_down_public();
