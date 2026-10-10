create function public.set_station_pin(p_event uuid, p_role text, p_pin text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if p_role not in ('checkin', 'merchandise', 'draw', 'prizes') then
    return jsonb_build_object('status', 'INVALID_ROLE');
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
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

create function public.set_station_active(p_event uuid, p_role text, p_active boolean, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  update public.station_pins set active = p_active, session_version = session_version + 1, updated_at = now()
   where event_id = p_event and role = p_role;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  perform public.audit(p_event, 'admin', p_actor, 'set_pin_active', 'station_pin', p_role, jsonb_build_object('active', p_active));
  return jsonb_build_object('status', 'OK');
end $$;

create function public.set_station_labels(p_event uuid, p_labels jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if jsonb_typeof(p_labels) is distinct from 'array' then
    return jsonb_build_object('status', 'INVALID');
  end if;
  if jsonb_array_length(p_labels) not between 1 and 20
     or exists (select 1 from jsonb_array_elements(p_labels) l
                 where jsonb_typeof(l) <> 'string' or length(trim(l #>> '{}')) not between 1 and 30)
     or (select count(distinct trim(l #>> '{}')) from jsonb_array_elements(p_labels) l) <> jsonb_array_length(p_labels) then
    return jsonb_build_object('status', 'INVALID');
  end if;
  update public.events
     set config = jsonb_set(config, '{station_labels}',
           (select jsonb_agg(trim(l #>> '{}') order by ord) from jsonb_array_elements(p_labels) with ordinality as t(l, ord)))
   where id = p_event;
  perform public.audit(p_event, 'admin', p_actor, 'set_station_labels', 'event', p_event::text, '{}'::jsonb);
  return jsonb_build_object('status', 'OK');
end $$;

create function public.add_walk_in(
  p_event uuid, p_full_name text, p_outlet text, p_department text, p_position text, p_actor text
) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_n int;
  g public.guests%rowtype;
begin
  if trim(coalesce(p_full_name, '')) = '' or trim(coalesce(p_outlet, '')) = '' then
    return jsonb_build_object('status', 'INVALID');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('walkin:' || p_event::text, 0));
  select coalesce(max(substring(employee_id from 8)::int), 0) + 1 into v_n
    from public.guests where event_id = p_event and employee_id ~ '^WALKIN-[0-9]+$';
  insert into public.guests (event_id, employee_id, full_name, outlet, department, position, is_walk_in)
  values (p_event, 'WALKIN-' || v_n, trim(p_full_name), trim(p_outlet),
          nullif(trim(coalesce(p_department, '')), ''), nullif(trim(coalesce(p_position, '')), ''), true)
  returning * into g;
  perform public.audit(p_event, 'admin', p_actor, 'walk_in_added', 'guest', g.id::text, '{}'::jsonb);
  return jsonb_build_object('status', 'OK', 'guest_id', g.id, 'employee_id', g.employee_id, 'invite_token', g.invite_token);
end $$;

create function public.admin_update_guest(p_event uuid, p_guest_id uuid, p_changes jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  update public.guests set
    full_name  = coalesce(nullif(trim(p_changes->>'full_name'), ''), full_name),
    outlet     = coalesce(nullif(trim(p_changes->>'outlet'), ''), outlet),
    department = case when jsonb_exists(p_changes, 'department') then nullif(trim(p_changes->>'department'), '') else department end,
    position   = case when jsonb_exists(p_changes, 'position') then nullif(trim(p_changes->>'position'), '') else position end,
    phone      = case when jsonb_exists(p_changes, 'phone') then nullif(trim(p_changes->>'phone'), '') else phone end,
    active     = case when jsonb_exists(p_changes, 'active') then (p_changes->>'active')::boolean else active end
   where id = p_guest_id and event_id = p_event;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  perform public.audit(p_event, 'admin', p_actor, 'guest_updated', 'guest', p_guest_id::text,
                       jsonb_build_object('fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_changes) k)));
  return jsonb_build_object('status', 'OK');
end $$;

create function public.event_counts(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'total',        count(*) filter (where g.active),
    'checked_in',   (select count(*) from public.check_ins c where c.event_id = p_event),
    'redeemed',     (select count(*) from public.merchandise_redemptions m where m.event_id = p_event and m.status = 'redeemed'),
    'rsvp_yes',     count(*) filter (where g.active and g.rsvp_status = 'yes'),
    'rsvp_no',      count(*) filter (where g.active and g.rsvp_status = 'no'),
    'rsvp_pending', count(*) filter (where g.active and g.rsvp_status = 'pending'),
    'opened',       count(*) filter (where g.active and g.first_opened_at is not null),
    'mode',         (select e.mode from public.events e where e.id = p_event))
  from public.guests g where g.event_id = p_event
$$;

create function public.admin_guest_list(p_event uuid, p_q text, p_outlet text) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK', 'guests', coalesce(jsonb_agg(x order by x->>'full_name'), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', g.id, 'employee_id', g.employee_id, 'full_name', g.full_name, 'outlet', g.outlet,
      'department', g.department, 'position', g.position, 'phone', g.phone, 'rsvp_status', g.rsvp_status,
      'opened', g.first_opened_at is not null, 'active', g.active, 'flagged_missing', g.flagged_missing,
      'is_walk_in', g.is_walk_in, 'checked_in_at', c.checked_in_at, 'prize_number', c.prize_number,
      'merch', case when m.id is not null then 'redeemed' else 'none' end) as x
    from public.guests g
    left join public.check_ins c on c.guest_id = g.id
    left join public.merchandise_redemptions m on m.guest_id = g.id and m.status = 'redeemed'
    where g.event_id = p_event
      and (p_outlet is null or p_outlet = '' or g.outlet = p_outlet)
      and (coalesce(trim(p_q), '') = ''
           or position(lower(trim(p_q)) in lower(g.full_name)) > 0
           or position(lower(trim(p_q)) in lower(g.employee_id)) > 0)
    order by g.full_name
    limit 500
  ) s
$$;

create function public.go_live(p_event uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  update public.events set mode = 'live' where id = p_event and mode = 'rehearsal';
  if not found then
    return jsonb_build_object('status', 'NOT_REHEARSAL');
  end if;
  perform public.audit(p_event, 'admin', p_actor, 'go_live', 'event', p_event::text, '{}'::jsonb);
  return jsonb_build_object('status', 'OK');
end $$;

-- Plan 2 replaces this function (create or replace) to also clear draws and reset the stage.
create function public.reset_rehearsal_data(p_event uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from public.events where id = p_event and mode = 'rehearsal') then
    return jsonb_build_object('status', 'NOT_REHEARSAL');
  end if;
  delete from public.merchandise_redemptions where event_id = p_event;
  delete from public.check_ins where event_id = p_event;
  delete from public.attempt_log where event_id = p_event;
  delete from public.auth_attempts;
  delete from public.audit_log where event_id = p_event;
  update public.events set next_prize_number = 1 where id = p_event;
  perform public.audit(p_event, 'admin', p_actor, 'rehearsal_reset', 'event', p_event::text, '{}'::jsonb);
  return jsonb_build_object('status', 'OK');
end $$;

select public.lock_down_public();
