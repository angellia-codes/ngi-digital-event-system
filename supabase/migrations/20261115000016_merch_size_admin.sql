-- Merchandise T-shirt size (spec 2026-11-08), part 3: admin corrections, stock entry, guest list, dashboard and reports.

-- Wrong size picked: admin sets or changes it, with a reason. Blocked while a redemption is active.
create function public.admin_set_merch_size(p_event uuid, p_guest_id uuid, p_size text, p_reason text, p_actor text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_reason text := trim(coalesce(p_reason, ''));
  g public.guests%rowtype;
begin
  if length(v_reason) < 5 then
    return jsonb_build_object('status', 'REASON_REQUIRED');
  end if;
  if p_size is null or p_size not in ('S', 'M', 'L', 'XL', 'XXL') then
    return jsonb_build_object('status', 'INVALID');
  end if;
  select * into g from public.guests where id = p_guest_id and event_id = p_event;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(g.id::text, 0));

  if exists (select 1 from public.merchandise_redemptions where guest_id = g.id and status = 'redeemed') then
    return jsonb_build_object('status', 'ALREADY_REDEEMED');
  end if;
  update public.guests
     set merch_size = p_size, merch_size_source = 'admin', merch_size_chosen_at = now()
   where id = g.id;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'merch_size_set', 'guest', g.id::text,
                       jsonb_build_object('from', g.merch_size, 'to', p_size, 'reason', v_reason));
  return jsonb_build_object('status', 'OK');
end $$;

-- Stock received per size, e.g. {"S": 40, "M": 60}. Sizes left out keep their number. Overwrites, so a second
-- delivery is entered as the new total.
create function public.set_merch_stock(p_event uuid, p_stock jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  k text;
  v jsonb;
begin
  if jsonb_typeof(p_stock) is distinct from 'object' or p_stock = '{}'::jsonb then
    return jsonb_build_object('status', 'INVALID');
  end if;
  for k, v in select key, value from jsonb_each(p_stock) loop
    if k not in ('S', 'M', 'L', 'XL', 'XXL') or jsonb_typeof(v) <> 'number' then
      return jsonb_build_object('status', 'INVALID');
    end if;
    if (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > 10000
       or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) then
      return jsonb_build_object('status', 'INVALID');
    end if;
  end loop;
  if not exists (select 1 from public.events where id = p_event) then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;

  insert into public.merch_stock (event_id, size, received, updated_at)
  select p_event, s.key, (s.value #>> '{}')::int, now() from jsonb_each(p_stock) s
  on conflict (event_id, size) do update set received = excluded.received, updated_at = now();

  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'merch_stock_set', 'event', p_event::text, p_stock);
  return jsonb_build_object('status', 'OK');
end $$;

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
      'merch', case when m.id is not null then 'redeemed' else 'none' end,
      'beverage', coalesce(b.beverage, public.effective_beverage(g.beverage_choice, g.beverage_source, ev.beverage_deadline) ->> 'choice'),
      'beverage_source', coalesce(b.source, public.effective_beverage(g.beverage_choice, g.beverage_source, ev.beverage_deadline) ->> 'source'),
      'beverage_redeemed', b.id is not null,
      'merch_size', case when m.id is not null then m.reserved_size else sz.v ->> 'size' end,
      'merch_size_source', case when m.id is not null then m.reserved_source else sz.v ->> 'source' end,
      'merch_given_size', m.given_size) as x
    from public.guests g
    join public.events ev on ev.id = g.event_id
    cross join lateral (
      select public.effective_merch_size(g.merch_size, g.merch_size_source, ev.merch_size_deadline, ev.merch_default_size) as v) sz
    left join public.check_ins c on c.guest_id = g.id
    left join public.merchandise_redemptions m on m.guest_id = g.id and m.status = 'redeemed'
    left join public.beverage_redemptions b on b.guest_id = g.id and b.status = 'redeemed'
    where g.event_id = p_event
      and (p_outlet is null or p_outlet = '' or g.outlet = p_outlet)
      and (coalesce(trim(p_q), '') = ''
           or position(lower(trim(p_q)) in lower(g.full_name)) > 0
           or position(lower(trim(p_q)) in lower(g.employee_id)) > 0)
    order by g.full_name
    limit 500
  ) s
$$;

-- The dashboard and the report list keep their existing body under a *_core name and gain the size parts here.
-- A later migration that redefines admin_dashboard or report_rows must keep calling the _core function (or fold it in).
alter function public.admin_dashboard(uuid) rename to admin_dashboard_core;

create function public.admin_dashboard(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select public.admin_dashboard_core(p_event) || jsonb_build_object('merch_size', public.merch_size_summary(p_event))
$$;

alter function public.report_rows(uuid, text) rename to report_rows_core;

create function public.report_rows(p_event uuid, p_report text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v jsonb;
  e public.events%rowtype;
begin
  if p_report not in ('merch_sizes', 'merch_size_pending') then
    return public.report_rows_core(p_event, p_report);
  end if;
  select * into e from public.events where id = p_event;

  if p_report = 'merch_sizes' then
    -- One row per redemption (voided ones included), plus one row for each active guest not yet redeemed.
    select coalesce(jsonb_agg(jsonb_build_object(
        'employee_id', s.employee_id, 'full_name', s.full_name, 'outlet', s.outlet, 'department', s.department,
        'reserved_size', s.reserved_size, 'source', s.source, 'chosen_at', s.chosen_at, 'given_size', s.given_size,
        'substituted', s.reserved_size is not null and s.given_size is not null and s.reserved_size <> s.given_size,
        'redeemed_at', s.redeemed_at, 'station', s.station, 'actor', s.actor, 'status', s.status, 'void_reason', s.void_reason)
        order by s.outlet, s.full_name, s.redeemed_at), '[]'::jsonb) into v
      from (
        select g.employee_id, g.full_name, g.outlet, g.department, m.reserved_size, m.reserved_source as source,
               g.merch_size_chosen_at as chosen_at, m.given_size, m.redeemed_at, m.station_label as station, m.actor,
               m.status, m.void_reason
          from public.merchandise_redemptions m join public.guests g on g.id = m.guest_id
         where m.event_id = p_event
        union all
        select g.employee_id, g.full_name, g.outlet, g.department, sz.v ->> 'size', sz.v ->> 'source',
               g.merch_size_chosen_at, null, null, null, null, 'not redeemed', null
          from public.guests g
          cross join lateral (
            select public.effective_merch_size(g.merch_size, g.merch_size_source, e.merch_size_deadline, e.merch_default_size) as v) sz
         where g.event_id = p_event and g.active
           and not exists (select 1 from public.merchandise_redemptions m where m.guest_id = g.id and m.status = 'redeemed')
      ) s;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
        'employee_id', g.employee_id, 'full_name', g.full_name, 'outlet', g.outlet, 'department', g.department,
        'phone', g.phone) order by g.outlet, g.full_name), '[]'::jsonb) into v
      from public.guests g
     where g.event_id = p_event and g.active
       and public.effective_merch_size(g.merch_size, g.merch_size_source, e.merch_size_deadline, e.merch_default_size) ->> 'size' is null
       and not exists (select 1 from public.merchandise_redemptions m where m.guest_id = g.id and m.status = 'redeemed');
  end if;
  return jsonb_build_object('status', 'OK', 'rows', v);
end $$;

select public.lock_down_public();
