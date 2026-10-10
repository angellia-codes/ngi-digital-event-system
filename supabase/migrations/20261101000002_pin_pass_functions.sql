create function public.audit(
  p_event uuid, p_actor_type text, p_actor text, p_action text,
  p_entity text, p_entity_id text, p_details jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = public, extensions
as $$
  insert into public.audit_log (event_id, actor_type, actor, action, entity, entity_id, details)
  values (p_event, p_actor_type, p_actor, p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

create function public.verify_pin(p_event uuid, p_pin text, p_device_key text, p_ip_key text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_dev int;
  v_ip int;
  r record;
begin
  select count(*) into v_dev from public.auth_attempts
   where scope = 'pin_device' and key = p_device_key and not success and at > now() - interval '5 minutes';
  select count(*) into v_ip from public.auth_attempts
   where scope = 'pin_ip' and key = p_ip_key and not success and at > now() - interval '5 minutes';
  if v_dev >= 5 or v_ip >= 30 then
    return jsonb_build_object('status', 'LOCKED');
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    insert into public.auth_attempts (scope, key, success)
    values ('pin_device', p_device_key, false), ('pin_ip', p_ip_key, false);
    return jsonb_build_object('status', 'INVALID');
  end if;

  select sp.role, sp.session_version into r
    from public.station_pins sp
   where sp.event_id = p_event and sp.active and sp.pin_hash = crypt(p_pin, sp.pin_hash)
   limit 1;

  if not found then
    insert into public.auth_attempts (scope, key, success)
    values ('pin_device', p_device_key, false), ('pin_ip', p_ip_key, false);
    return jsonb_build_object('status', 'INVALID');
  end if;

  delete from public.auth_attempts where scope = 'pin_device' and key = p_device_key and not success;
  return jsonb_build_object('status', 'OK', 'role', r.role, 'session_version', r.session_version);
end $$;

create function public.station_session_valid(p_event uuid, p_role text, p_version int)
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (
    select 1 from public.station_pins
     where event_id = p_event and role = p_role and active and session_version = p_version
  );
$$;

create function public.is_admin(p_event uuid, p_email text)
returns boolean
language sql stable security definer set search_path = public, extensions
as $$
  select exists (select 1 from public.admins where event_id = p_event and email = lower(p_email));
$$;

create function public.get_pass(p_token text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype;
  e public.events%rowtype;
  ci public.check_ins%rowtype;
  mr public.merchandise_redemptions%rowtype;
  v_merch jsonb;
begin
  select * into g from public.guests where invite_token = p_token and active;
  if not found then
    return jsonb_build_object('status', 'INVALID');
  end if;

  if g.first_opened_at is null then
    update public.guests set first_opened_at = now() where id = g.id;
  end if;

  select * into e from public.events where id = g.event_id;
  select * into ci from public.check_ins where guest_id = g.id;

  if ci.id is not null then
    select * into mr from public.merchandise_redemptions where guest_id = g.id and status = 'redeemed';
    v_merch := jsonb_build_object('token', g.merch_token, 'claimed', mr.id is not null, 'redeemed_at', mr.redeemed_at);
  end if;

  return jsonb_build_object(
    'status', 'OK',
    'event', jsonb_build_object('name', e.name, 'date', e.event_date, 'starts_at', e.starts_at, 'venue', e.venue),
    'guest', jsonb_build_object('full_name', g.full_name, 'outlet', g.outlet, 'department', g.department,
                                'position', g.position, 'rsvp_status', g.rsvp_status),
    'invite_token', g.invite_token,
    'checked_in', ci.id is not null,
    'checked_in_at', ci.checked_in_at,
    'prize_number', ci.prize_number,
    'merchandise', v_merch
  );
end $$;

create function public.set_rsvp(p_token text, p_status text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare g public.guests%rowtype;
begin
  if p_status not in ('yes', 'no') then
    return jsonb_build_object('status', 'INVALID');
  end if;
  select * into g from public.guests where invite_token = p_token and active;
  if not found then
    return jsonb_build_object('status', 'INVALID');
  end if;
  update public.guests set rsvp_status = p_status, rsvp_at = now() where id = g.id;
  perform public.audit(g.event_id, 'guest', g.employee_id, 'rsvp', 'guest', g.id::text, jsonb_build_object('status', p_status));
  return jsonb_build_object('status', 'OK', 'rsvp_status', p_status);
end $$;

create function public.find_guests(p_event uuid, p_q text)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare v_q text := lower(trim(coalesce(p_q, '')));
begin
  if length(v_q) < 2 then
    return jsonb_build_object('status', 'OK', 'guests', '[]'::jsonb);
  end if;
  return jsonb_build_object('status', 'OK', 'guests', coalesce((
    select jsonb_agg(x) from (
      select jsonb_build_object(
               'id', g.id, 'full_name', g.full_name, 'outlet', g.outlet, 'employee_id', g.employee_id,
               'checked_in', exists (select 1 from public.check_ins c where c.guest_id = g.id)) as x
        from public.guests g
       where g.event_id = p_event and g.active
         and (position(v_q in lower(g.full_name)) > 0 or position(v_q in lower(g.employee_id)) > 0)
       order by g.full_name
       limit 20
    ) s
  ), '[]'::jsonb));
end $$;

select public.lock_down_public();
