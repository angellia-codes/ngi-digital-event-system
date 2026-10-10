-- Rehearsal reset now also clears draws and returns the stage to idle. Guests, RSVPs, PINs, prizes, stage key and options stay.
create or replace function public.reset_rehearsal_data(p_event uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from public.events where id = p_event and mode = 'rehearsal') then
    return jsonb_build_object('status', 'NOT_REHEARSAL');
  end if;
  delete from public.draws where event_id = p_event;
  delete from public.merchandise_redemptions where event_id = p_event;
  delete from public.check_ins where event_id = p_event;
  delete from public.attempt_log where event_id = p_event;
  delete from public.auth_attempts where true; -- PostgREST safeupdate needs a WHERE
  delete from public.stage_heartbeat where event_id = p_event;
  delete from public.audit_log where event_id = p_event;
  update public.stage_state
     set rev = rev + 1, phase = 'idle', payload = '{}'::jsonb, updated_at = now()
   where event_id = p_event;
  update public.events set next_prize_number = 1 where id = p_event;
  perform public.audit(p_event, 'admin', p_actor, 'rehearsal_reset', 'event', p_event::text, '{}'::jsonb);
  return jsonb_build_object('status', 'OK');
end $$;

-- Everything the admin dashboard shows, in one call.
create function public.admin_dashboard(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'counts', public.event_counts(p_event),
    'outlets', (
      select coalesce(jsonb_agg(s.o order by s.o->>'outlet'), '[]'::jsonb)
      from (
        select jsonb_build_object('outlet', g.outlet, 'total', count(*),
                                  'rsvp_yes', count(*) filter (where g.rsvp_status = 'yes'),
                                  'checked_in', count(c.id), 'redeemed', count(m.id)) as o
          from public.guests g
          left join public.check_ins c on c.guest_id = g.id
          left join public.merchandise_redemptions m on m.guest_id = g.id and m.status = 'redeemed'
         where g.event_id = p_event and g.active
         group by g.outlet) s),
    'prizes', public.prize_list(p_event)->'prizes',
    'draw', jsonb_build_object(
      'confirmed',   (select count(*) from public.draws d where d.event_id = p_event and d.status = 'confirmed'),
      'pending',     (select count(*) from public.draws d where d.event_id = p_event and d.status = 'drawn'),
      'no_shows',    (select count(*) from public.draws d where d.event_id = p_event and d.status = 'void_no_show'),
      'admin_voids', (select count(*) from public.draws d where d.event_id = p_event and d.status = 'void_admin'),
      'eligible',    (select count(*) from public.check_ins c join public.guests g on g.id = c.guest_id
                       where c.event_id = p_event and g.active
                         and not exists (select 1 from public.draws d where d.winner_guest_id = c.guest_id and d.status in ('drawn', 'confirmed')))),
    'stage', jsonb_build_object(
      'phase', public.get_stage(p_event)->'phase',
      'rev', public.get_stage(p_event)->'rev',
      'heartbeat_age', public.stage_heartbeat_age(p_event)),
    'recent', (
      select coalesce(jsonb_agg(jsonb_build_object('at', r.at, 'actor', r.actor, 'action', r.action) order by r.id desc), '[]'::jsonb)
        from (select a.id, a.at, a.actor, a.action from public.audit_log a where a.event_id = p_event order by a.id desc limit 10) r))
$$;

create function public.admin_draw_list(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK', 'draws', coalesce(jsonb_agg(x.j order by x.seq desc), '[]'::jsonb))
  from (
    select d.sequence as seq,
           jsonb_build_object('id', d.id, 'prize', pr.name, 'slot', d.slot, 'quantity', pr.quantity, 'number', c.prize_number,
                              'name', g.full_name, 'outlet', g.outlet, 'department', g.department, 'status', d.status,
                              'drawn_at', d.drawn_at, 'resolved_at', d.resolved_at, 'resolved_by', d.resolved_by,
                              'void_reason', d.void_reason, 'redraw_of', d.redraw_of) as j
      from public.draws d
      join public.prizes pr on pr.id = d.prize_id
      join public.check_ins c on c.guest_id = d.winner_guest_id
      join public.guests g on g.id = d.winner_guest_id
     where d.event_id = p_event
     order by d.sequence desc
     limit 1000) x
$$;

create function public.admin_audit_list(p_event uuid, p_before bigint, p_limit int) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK',
    'rows', coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'at', r.at, 'actor_type', r.actor_type, 'actor', r.actor,
                                                  'action', r.action, 'entity', r.entity, 'entity_id', r.entity_id,
                                                  'details', r.details) order by r.id desc), '[]'::jsonb))
  from (
    select a.* from public.audit_log a
     where a.event_id = p_event and (p_before is null or a.id < p_before)
     order by a.id desc
     limit least(greatest(coalesce(p_limit, 100), 1), 200)) r
$$;

-- Rows for the CSV exports. Column order is fixed in the application, not here.
create function public.report_rows(p_event uuid, p_report text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v jsonb;
begin
  if p_report = 'guests' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'employee_id', g.employee_id, 'full_name', g.full_name, 'outlet', g.outlet, 'department', g.department,
        'position', g.position, 'category', g.category, 'rsvp_status', g.rsvp_status,
        'opened', g.first_opened_at is not null, 'checked_in_at', c.checked_in_at, 'prize_number', c.prize_number,
        'merchandise', case when m.id is not null then 'redeemed' else '' end,
        'walk_in', g.is_walk_in, 'active', g.active) order by g.outlet, g.full_name), '[]'::jsonb) into v
      from public.guests g
      left join public.check_ins c on c.guest_id = g.id
      left join public.merchandise_redemptions m on m.guest_id = g.id and m.status = 'redeemed'
     where g.event_id = p_event;
  elsif p_report = 'check_ins' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'checked_in_at', c.checked_in_at, 'prize_number', c.prize_number, 'employee_id', g.employee_id,
        'full_name', g.full_name, 'outlet', g.outlet, 'department', g.department,
        'method', c.method, 'station', c.station_label, 'actor', c.actor) order by c.prize_number), '[]'::jsonb) into v
      from public.check_ins c join public.guests g on g.id = c.guest_id
     where c.event_id = p_event;
  elsif p_report = 'merchandise' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'redeemed_at', m.redeemed_at, 'status', m.status, 'employee_id', g.employee_id, 'full_name', g.full_name,
        'outlet', g.outlet, 'station', m.station_label, 'actor', m.actor, 'void_reason', m.void_reason)
        order by m.redeemed_at), '[]'::jsonb) into v
      from public.merchandise_redemptions m join public.guests g on g.id = m.guest_id
     where m.event_id = p_event;
  elsif p_report = 'draws' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'drawn_at', d.drawn_at, 'prize', pr.name, 'slot', d.slot, 'prize_number', c.prize_number,
        'employee_id', g.employee_id, 'full_name', g.full_name, 'outlet', g.outlet, 'department', g.department,
        'status', d.status, 'drawn_by', d.drawn_by, 'resolved_at', d.resolved_at, 'resolved_by', d.resolved_by,
        'void_reason', d.void_reason) order by d.sequence), '[]'::jsonb) into v
      from public.draws d
      join public.prizes pr on pr.id = d.prize_id
      join public.check_ins c on c.guest_id = d.winner_guest_id
      join public.guests g on g.id = d.winner_guest_id
     where d.event_id = p_event;
  elsif p_report = 'audit' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'at', a.at, 'actor_type', a.actor_type, 'actor', a.actor, 'action', a.action,
        'entity', a.entity, 'entity_id', a.entity_id, 'details', a.details::text) order by a.id), '[]'::jsonb) into v
      from (select * from public.audit_log where event_id = p_event order by id desc limit 50000) a;
  elsif p_report = 'rsvp_pending' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'employee_id', g.employee_id, 'full_name', g.full_name, 'outlet', g.outlet, 'department', g.department,
        'phone', g.phone, 'opened', g.first_opened_at is not null) order by g.outlet, g.full_name), '[]'::jsonb) into v
      from public.guests g
     where g.event_id = p_event and g.active and g.rsvp_status = 'pending';
  else
    return jsonb_build_object('status', 'UNKNOWN_REPORT');
  end if;
  return jsonb_build_object('status', 'OK', 'rows', v);
end $$;

select public.lock_down_public();
