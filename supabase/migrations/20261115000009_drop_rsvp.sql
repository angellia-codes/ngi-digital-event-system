-- Attendance is mandatory for every employee, so RSVP is gone: functions stop reading it, then the columns go.
-- Past 'rsvp' rows in audit_log stay as history.

create or replace function public.get_pass(p_token text)
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
                                'position', g.position),
    'invite_token', g.invite_token,
    'checked_in', ci.id is not null,
    'checked_in_at', ci.checked_in_at,
    'prize_number', ci.prize_number,
    'merchandise', v_merch
  );
end $$;

drop function public.set_rsvp(text, text);

create or replace function public.event_counts(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'total',        count(*) filter (where g.active),
    'checked_in',   (select count(*) from public.check_ins c where c.event_id = p_event),
    'redeemed',     (select count(*) from public.merchandise_redemptions m where m.event_id = p_event and m.status = 'redeemed'),
    'opened',       count(*) filter (where g.active and g.first_opened_at is not null),
    'mode',         (select e.mode from public.events e where e.id = p_event))
  from public.guests g where g.event_id = p_event
$$;

create or replace function public.admin_guest_list(p_event uuid, p_q text, p_outlet text) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK', 'guests', coalesce(jsonb_agg(x order by x->>'full_name'), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', g.id, 'employee_id', g.employee_id, 'full_name', g.full_name, 'outlet', g.outlet,
      'department', g.department, 'position', g.position, 'phone', g.phone,
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

create or replace function public.admin_dashboard(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'counts', public.event_counts(p_event),
    'outlets', (
      select coalesce(jsonb_agg(s.o order by s.o->>'outlet'), '[]'::jsonb)
      from (
        select jsonb_build_object('outlet', g.outlet, 'total', count(*),
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

-- Rows for the CSV exports. Column order is fixed in the application, not here.
create or replace function public.report_rows(p_event uuid, p_report text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v jsonb;
begin
  if p_report = 'guests' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'employee_id', g.employee_id, 'full_name', g.full_name, 'outlet', g.outlet, 'department', g.department,
        'position', g.position, 'category', g.category,
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
  else
    return jsonb_build_object('status', 'UNKNOWN_REPORT');
  end if;
  return jsonb_build_object('status', 'OK', 'rows', v);
end $$;

alter table public.guests drop column rsvp_status, drop column rsvp_at;

select public.lock_down_public();
