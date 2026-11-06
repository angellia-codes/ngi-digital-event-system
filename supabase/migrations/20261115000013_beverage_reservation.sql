-- Beverage reservation (spec 2026-11-06): each guest picks Beer or Soft Drink once, redeems it once at the Bar.
-- No job runs at the deadline: effective_beverage() works the drink out on every read.

alter table public.guests
  add column beverage_token text not null unique default public.new_token(),
  add column beverage_choice text check (beverage_choice in ('beer', 'soft_drink')),
  add column beverage_chosen_at timestamptz,
  add column beverage_source text check (beverage_source in ('guest', 'admin'));

alter table public.events add column beverage_deadline timestamptz;

create table public.beverage_redemptions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  guest_id uuid not null references public.check_ins (guest_id),
  beverage text not null check (beverage in ('beer', 'soft_drink')),
  source text not null check (source in ('guest', 'admin', 'auto')),
  status text not null default 'redeemed' check (status in ('redeemed', 'voided')),
  redeemed_at timestamptz not null default now(),
  station_label text,
  actor text,
  void_reason text
);
create unique index one_active_beverage on public.beverage_redemptions (guest_id) where status = 'redeemed';

-- New role 'bar'.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.station_pins'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%checkin%' loop
    execute format('alter table public.station_pins drop constraint %I', c);
  end loop;
end $$;
alter table public.station_pins
  add constraint station_pins_role_check check (role in ('checkin', 'merchandise', 'draw', 'prizes', 'admin', 'bar'));

create or replace function public.set_station_pin(p_event uuid, p_role text, p_pin text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if p_role not in ('checkin', 'merchandise', 'draw', 'prizes', 'admin', 'bar') then
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

-- Stored choice, else Soft Drink once the deadline has passed, else none.
create function public.effective_beverage(p_choice text, p_source text, p_deadline timestamptz) returns jsonb
language sql stable set search_path = public
as $$
  select case
    when p_choice is not null then jsonb_build_object('choice', p_choice, 'source', coalesce(p_source, 'guest'))
    when p_deadline is not null and now() >= p_deadline then jsonb_build_object('choice', 'soft_drink', 'source', 'auto')
    else jsonb_build_object('choice', null, 'source', null)
  end
$$;

-- Guest picks a drink. First saved choice wins; identical repeat is OK.
create function public.set_beverage(p_token text, p_choice text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype;
  e public.events%rowtype;
  br public.beverage_redemptions%rowtype;
  v_saved text;
begin
  if p_choice is null or p_choice not in ('beer', 'soft_drink') then
    return jsonb_build_object('status', 'INVALID');
  end if;
  select * into g from public.guests where invite_token = p_token and active;
  if not found then
    return jsonb_build_object('status', 'INVALID');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(g.id::text, 0));

  select * into br from public.beverage_redemptions where guest_id = g.id and status = 'redeemed';
  if found then
    return jsonb_build_object('status', 'ALREADY_CHOSEN', 'choice', br.beverage);
  end if;

  select * into e from public.events where id = g.event_id;
  update public.guests
     set beverage_choice = p_choice, beverage_chosen_at = now(), beverage_source = 'guest'
   where id = g.id and beverage_choice is null
     and (e.beverage_deadline is null or now() < e.beverage_deadline);
  if found then
    perform public.audit(g.event_id, 'guest', g.employee_id, 'beverage_chosen', 'guest', g.id::text,
                         jsonb_build_object('choice', p_choice));
    return jsonb_build_object('status', 'OK', 'choice', p_choice);
  end if;

  select beverage_choice into v_saved from public.guests where id = g.id;
  if v_saved is null then
    return jsonb_build_object('status', 'CLOSED');
  end if;
  if v_saved = p_choice then
    return jsonb_build_object('status', 'OK', 'choice', v_saved);
  end if;
  return jsonb_build_object('status', 'ALREADY_CHOSEN', 'choice', v_saved);
end $$;

-- Bar scan or manual search. Records nothing except rejected attempts.
create function public.beverage_lookup(p_event uuid, p_token text, p_guest_id uuid, p_actor text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype;
  e public.events%rowtype;
  br public.beverage_redemptions%rowtype;
  v_eff jsonb;
begin
  if p_token is not null then
    select * into g from public.guests where event_id = p_event and beverage_token = p_token;
  else
    select * into g from public.guests where event_id = p_event and id = p_guest_id;
  end if;

  if not found then
    perform public.log_attempt(p_event, 'beverage', coalesce(p_token, p_guest_id::text), 'INVALID', p_actor);
    return jsonb_build_object('status', 'INVALID');
  end if;
  if not g.active then
    perform public.log_attempt(p_event, 'beverage', p_token, 'NOT_ELIGIBLE', p_actor);
    return jsonb_build_object('status', 'NOT_ELIGIBLE');
  end if;
  if not exists (select 1 from public.check_ins where guest_id = g.id) then
    perform public.log_attempt(p_event, 'beverage', p_token, 'NOT_CHECKED_IN', p_actor);
    return jsonb_build_object('status', 'NOT_CHECKED_IN', 'guest', public.guest_brief(g));
  end if;

  select * into br from public.beverage_redemptions where guest_id = g.id and status = 'redeemed';
  if found then
    perform public.log_attempt(p_event, 'beverage', p_token, 'ALREADY_REDEEMED', p_actor);
    return jsonb_build_object('status', 'ALREADY_REDEEMED', 'guest', public.guest_brief(g), 'beverage', br.beverage,
                              'redeemed_at', br.redeemed_at, 'station_label', br.station_label);
  end if;

  select * into e from public.events where id = p_event;
  v_eff := public.effective_beverage(g.beverage_choice, g.beverage_source, e.beverage_deadline);
  if v_eff ->> 'choice' is null then
    perform public.log_attempt(p_event, 'beverage', p_token, 'NO_CHOICE', p_actor);
    return jsonb_build_object('status', 'NO_CHOICE', 'guest', public.guest_brief(g));
  end if;
  return jsonb_build_object('status', 'READY', 'guest', public.guest_brief(g),
                            'beverage', v_eff ->> 'choice', 'source', v_eff ->> 'source');
end $$;

create function public.redeem_beverage(
  p_event uuid, p_token text, p_guest_id uuid, p_station_label text, p_actor text
) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype;
  e public.events%rowtype;
  br public.beverage_redemptions%rowtype;
  v_eff jsonb;
begin
  if p_token is not null then
    select * into g from public.guests where event_id = p_event and beverage_token = p_token;
  else
    select * into g from public.guests where event_id = p_event and id = p_guest_id;
  end if;

  if not found then
    perform public.log_attempt(p_event, 'beverage', coalesce(p_token, p_guest_id::text), 'INVALID', p_actor);
    return jsonb_build_object('status', 'INVALID');
  end if;
  if not g.active then
    return jsonb_build_object('status', 'NOT_ELIGIBLE');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(g.id::text, 0));

  if not exists (select 1 from public.check_ins where guest_id = g.id) then
    perform public.log_attempt(p_event, 'beverage', p_token, 'NOT_CHECKED_IN', p_actor);
    return jsonb_build_object('status', 'NOT_CHECKED_IN', 'guest', public.guest_brief(g));
  end if;

  select * into br from public.beverage_redemptions where guest_id = g.id and status = 'redeemed';
  if found then
    -- double-tap guard: same bar within 10 seconds is the same hand-over
    if br.station_label is not distinct from p_station_label and br.redeemed_at > now() - interval '10 seconds' then
      return jsonb_build_object('status', 'REDEEMED', 'guest', public.guest_brief(g), 'beverage', br.beverage,
                                'redeemed_at', br.redeemed_at, 'replay', true);
    end if;
    perform public.log_attempt(p_event, 'beverage', p_token, 'ALREADY_REDEEMED', p_actor);
    return jsonb_build_object('status', 'ALREADY_REDEEMED', 'guest', public.guest_brief(g), 'beverage', br.beverage,
                              'redeemed_at', br.redeemed_at, 'station_label', br.station_label);
  end if;

  -- Re-read under the lock so a choice saved a moment ago counts.
  select * into g from public.guests where id = g.id;
  select * into e from public.events where id = p_event;
  v_eff := public.effective_beverage(g.beverage_choice, g.beverage_source, e.beverage_deadline);
  if v_eff ->> 'choice' is null then
    perform public.log_attempt(p_event, 'beverage', p_token, 'NO_CHOICE', p_actor);
    return jsonb_build_object('status', 'NO_CHOICE', 'guest', public.guest_brief(g));
  end if;

  insert into public.beverage_redemptions (event_id, guest_id, beverage, source, status, station_label, actor)
  values (p_event, g.id, v_eff ->> 'choice', v_eff ->> 'source', 'redeemed', p_station_label, p_actor)
  returning * into br;

  perform public.audit(p_event, 'station', coalesce(p_actor, 'unknown'), 'beverage_redeemed', 'guest', g.id::text,
                       jsonb_build_object('station', p_station_label, 'beverage', br.beverage, 'source', br.source));

  return jsonb_build_object('status', 'REDEEMED', 'guest', public.guest_brief(g), 'beverage', br.beverage,
                            'redeemed_at', br.redeemed_at, 'replay', false);
end $$;

create function public.void_beverage(p_event uuid, p_redemption_id uuid, p_reason text, p_actor text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_reason text := trim(coalesce(p_reason, ''));
  br public.beverage_redemptions%rowtype;
begin
  if length(v_reason) < 5 then
    return jsonb_build_object('status', 'REASON_REQUIRED');
  end if;
  select * into br from public.beverage_redemptions
   where id = p_redemption_id and event_id = p_event and status = 'redeemed'
   for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  update public.beverage_redemptions set status = 'voided', void_reason = v_reason where id = br.id;
  perform public.audit(p_event, 'admin', p_actor, 'beverage_voided', 'guest', br.guest_id::text,
                       jsonb_build_object('reason', v_reason, 'beverage', br.beverage));
  return jsonb_build_object('status', 'OK');
end $$;

create function public.admin_set_beverage(p_event uuid, p_guest_id uuid, p_choice text, p_reason text, p_actor text)
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
  if p_choice is null or p_choice not in ('beer', 'soft_drink') then
    return jsonb_build_object('status', 'INVALID');
  end if;
  select * into g from public.guests where id = p_guest_id and event_id = p_event;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(g.id::text, 0));

  if exists (select 1 from public.beverage_redemptions where guest_id = g.id and status = 'redeemed') then
    return jsonb_build_object('status', 'ALREADY_REDEEMED');
  end if;
  update public.guests
     set beverage_choice = p_choice, beverage_source = 'admin', beverage_chosen_at = now()
   where id = g.id;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'beverage_set', 'guest', g.id::text,
                       jsonb_build_object('from', g.beverage_choice, 'to', p_choice, 'reason', v_reason));
  return jsonb_build_object('status', 'OK');
end $$;

-- Purchase count for active guests. A redeemed drink counts as what was handed over.
create function public.beverage_summary(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  with ev as (select beverage_deadline as d from public.events where id = p_event),
  x as (
    select coalesce(br.beverage,
                    public.effective_beverage(g.beverage_choice, g.beverage_source, (select d from ev)) ->> 'choice') as drink,
           br.id is not null as redeemed
      from public.guests g
      left join public.beverage_redemptions br on br.guest_id = g.id and br.status = 'redeemed'
     where g.event_id = p_event and g.active)
  select jsonb_build_object(
    'status', 'OK',
    'beer', count(*) filter (where drink = 'beer'),
    'soft_drink', count(*) filter (where drink = 'soft_drink'),
    'no_choice', count(*) filter (where drink is null),
    'total', count(*),
    'redeemed_beer', count(*) filter (where redeemed and drink = 'beer'),
    'redeemed_soft_drink', count(*) filter (where redeemed and drink = 'soft_drink'),
    'deadline', (select d from ev),
    'final', coalesce((select d from ev) <= now(), false))
  from x
$$;

-- Pass payload gains event.beverage_deadline and a top-level beverage object.
create or replace function public.get_pass(p_token text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g public.guests%rowtype; e public.events%rowtype; ci public.check_ins%rowtype;
  mr public.merchandise_redemptions%rowtype; br public.beverage_redemptions%rowtype;
  v_merch jsonb; v_eff jsonb;
begin
  select * into g from public.guests where invite_token = p_token and active;
  if not found then return jsonb_build_object('status', 'INVALID'); end if;
  if g.first_opened_at is null then update public.guests set first_opened_at = now() where id = g.id; end if;
  select * into e from public.events where id = g.event_id;
  select * into ci from public.check_ins where guest_id = g.id;
  if ci.id is not null then
    select * into mr from public.merchandise_redemptions where guest_id = g.id and status = 'redeemed';
    v_merch := jsonb_build_object('token', g.merch_token, 'claimed', mr.id is not null, 'redeemed_at', mr.redeemed_at);
  end if;
  select * into br from public.beverage_redemptions where guest_id = g.id and status = 'redeemed';
  v_eff := public.effective_beverage(g.beverage_choice, g.beverage_source, e.beverage_deadline);
  return jsonb_build_object(
    'status', 'OK',
    'server_now', now(),
    'event', jsonb_build_object('name', e.name, 'date', e.event_date, 'doors_at', e.doors_at,
      'starts_at', e.starts_at, 'ends_at', e.ends_at, 'venue', e.venue, 'maps_url', e.maps_url,
      'beverage_deadline', e.beverage_deadline),
    'guest', jsonb_build_object('full_name', g.full_name, 'nickname', g.nickname, 'outlet', g.outlet,
      'department', g.department, 'position', g.position),
    'invite_token', g.invite_token, 'checked_in', ci.id is not null, 'checked_in_at', ci.checked_in_at,
    'prize_number', ci.prize_number, 'merchandise', v_merch,
    'beverage', jsonb_build_object(
      'choice', coalesce(br.beverage, v_eff ->> 'choice'),
      'source', coalesce(br.source, v_eff ->> 'source'),
      'token', case when br.id is not null or v_eff ->> 'choice' is not null then g.beverage_token end,
      'redeemed', br.id is not null,
      'redeemed_at', br.redeemed_at));
end $$;

-- Partial update: absent key = unchanged, JSON null = clear (event_date cannot be cleared).
create or replace function public.set_event_details(p_event uuid, p_details jsonb, p_actor text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  e public.events%rowtype;
  v_date date; v_doors timestamptz; v_starts timestamptz; v_ends timestamptz; v_venue text; v_maps text; v_bev timestamptz;
begin
  select * into e from public.events where id = p_event;
  if not found then return jsonb_build_object('status', 'NOT_FOUND'); end if;
  if jsonb_typeof(p_details) is distinct from 'object' then return jsonb_build_object('status', 'INVALID'); end if;

  v_date   := e.event_date; v_doors := e.doors_at; v_starts := e.starts_at;
  v_ends   := e.ends_at;    v_venue := e.venue;    v_maps   := e.maps_url;
  v_bev    := e.beverage_deadline;

  if p_details ? 'event_date' then
    if jsonb_typeof(p_details -> 'event_date') <> 'string' then return jsonb_build_object('status', 'INVALID'); end if;
    v_date := (p_details ->> 'event_date')::date;
  end if;
  if p_details ? 'doors_at'  then v_doors  := (p_details ->> 'doors_at')::timestamptz;  end if;
  if p_details ? 'starts_at' then v_starts := (p_details ->> 'starts_at')::timestamptz; end if;
  if p_details ? 'ends_at'   then v_ends   := (p_details ->> 'ends_at')::timestamptz;   end if;
  if p_details ? 'venue'     then v_venue  := nullif(trim(p_details ->> 'venue'), '');   end if;
  if p_details ? 'maps_url'  then v_maps   := nullif(trim(p_details ->> 'maps_url'), ''); end if;
  if p_details ? 'beverage_deadline' then v_bev := (p_details ->> 'beverage_deadline')::timestamptz; end if;

  if v_maps is not null and v_maps !~* '^https://(www\.google\.com/maps|google\.com/maps|maps\.google\.com|maps\.app\.goo\.gl|goo\.gl/maps)([/?#].*)?$' then
    return jsonb_build_object('status', 'INVALID_MAPS_URL');
  end if;
  if v_doors is not null and ((v_starts is not null and v_starts < v_doors) or (v_ends is not null and v_ends <= v_doors)
                              or (v_bev is not null and v_bev >= v_doors)) then
    return jsonb_build_object('status', 'INVALID_TIMES');
  end if;

  update public.events
     set event_date = v_date, doors_at = v_doors, starts_at = v_starts, ends_at = v_ends, venue = v_venue, maps_url = v_maps,
         beverage_deadline = v_bev
   where id = p_event;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'event_details_updated', 'event', p_event::text,
    jsonb_build_object('keys', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from jsonb_object_keys(p_details) k)));
  return jsonb_build_object('status', 'OK');
end $$;

-- Rehearsal reset clears bar redemptions too. Drink choices stay: invitations go out before rehearsal.
create or replace function public.reset_rehearsal_data(p_event uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from public.events where id = p_event and mode = 'rehearsal') then
    return jsonb_build_object('status', 'NOT_REHEARSAL');
  end if;
  delete from public.draws where event_id = p_event;
  delete from public.merchandise_redemptions where event_id = p_event;
  delete from public.beverage_redemptions where event_id = p_event;
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
      'beverage_redeemed', b.id is not null) as x
    from public.guests g
    join public.events ev on ev.id = g.event_id
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
    'beverage', public.beverage_summary(p_event),
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
  v_deadline timestamptz := (select beverage_deadline from public.events where id = p_event);
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
  elsif p_report = 'beverages' then
    -- One row per redemption (voided ones included), plus one row for each guest with a drink not yet redeemed.
    select coalesce(jsonb_agg(jsonb_build_object(
        'employee_id', s.employee_id, 'full_name', s.full_name, 'outlet', s.outlet, 'department', s.department,
        'beverage', s.beverage, 'source', s.source, 'chosen_at', s.chosen_at, 'redeemed_at', s.redeemed_at,
        'station', s.station, 'actor', s.actor, 'status', s.status, 'void_reason', s.void_reason)
        order by s.outlet, s.full_name, s.redeemed_at), '[]'::jsonb) into v
      from (
        select g.employee_id, g.full_name, g.outlet, g.department, b.beverage, b.source, g.beverage_chosen_at as chosen_at,
               b.redeemed_at, b.station_label as station, b.actor, b.status, b.void_reason
          from public.beverage_redemptions b join public.guests g on g.id = b.guest_id
         where b.event_id = p_event
        union all
        select g.employee_id, g.full_name, g.outlet, g.department,
               public.effective_beverage(g.beverage_choice, g.beverage_source, v_deadline) ->> 'choice',
               public.effective_beverage(g.beverage_choice, g.beverage_source, v_deadline) ->> 'source',
               g.beverage_chosen_at, null, null, null, 'not redeemed', null
          from public.guests g
         where g.event_id = p_event and g.active
           and public.effective_beverage(g.beverage_choice, g.beverage_source, v_deadline) ->> 'choice' is not null
           and not exists (select 1 from public.beverage_redemptions b where b.guest_id = g.id and b.status = 'redeemed')
      ) s;
  elsif p_report = 'beverage_pending' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'employee_id', g.employee_id, 'full_name', g.full_name, 'outlet', g.outlet, 'department', g.department,
        'phone', g.phone) order by g.outlet, g.full_name), '[]'::jsonb) into v
      from public.guests g
     where g.event_id = p_event and g.active
       and public.effective_beverage(g.beverage_choice, g.beverage_source, v_deadline) ->> 'choice' is null
       and not exists (select 1 from public.beverage_redemptions b where b.guest_id = g.id and b.status = 'redeemed');
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

select public.lock_down_public();
