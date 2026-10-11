-- PINs are 4 digits (set_station_pin already enforces it since 20261115000007); verify_pin still required 6.
create or replace function public.verify_pin(p_event uuid, p_pin text, p_device_key text, p_ip_key text)
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

  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
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

select public.lock_down_public();
