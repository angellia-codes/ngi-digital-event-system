-- MC cue card (spec 2026-11-09), part 1: role 'mc', rundown tables, live run state and NEXT.
-- The current segment is the one open run (ended_at is null). No job runs on a timer: drift is worked out on read.

alter table public.guests
  add column vip_tier text check (vip_tier in ('BOD', 'HOD')),
  add column vip_title text check (length(vip_title) <= 30),
  add column protocol_order int check (protocol_order between 0 and 999),
  add column phonetic text check (length(phonetic) <= 80);

alter table public.prizes add column mc_script text check (length(mc_script) <= 500);

create table public.rundown_segments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  sort_order int not null default 0 check (sort_order >= 0),
  title text not null check (length(title) between 1 and 80),
  planned_start timestamptz not null,
  duration_min int not null check (duration_min between 1 and 600),
  pic text check (length(pic) <= 80),
  script text check (length(script) <= 4000),
  kind text not null default 'normal' check (kind in ('normal', 'door_prize')),
  updated_at timestamptz not null default now()
);
create index rundown_segments_order on public.rundown_segments (event_id, sort_order, planned_start, id);

-- A prize belongs to at most one door-prize segment (the primary key is the prize).
create table public.segment_prizes (
  prize_id uuid primary key references public.prizes (id) on delete cascade,
  segment_id uuid not null references public.rundown_segments (id) on delete cascade,
  event_id uuid not null references public.events (id)
);
create index segment_prizes_segment on public.segment_prizes (segment_id);

create table public.rundown_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  segment_id uuid not null references public.rundown_segments (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  started_by text,
  reason text
);
-- At most one open run per event: that run is the current segment.
create unique index one_open_run on public.rundown_runs (event_id) where ended_at is null;
create index rundown_runs_segment on public.rundown_runs (segment_id, started_at desc);

-- New role 'mc'.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.station_pins'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%checkin%' loop
    execute format('alter table public.station_pins drop constraint %I', c);
  end loop;
end $$;
alter table public.station_pins
  add constraint station_pins_role_check check (role in ('checkin', 'merchandise', 'draw', 'prizes', 'admin', 'bar', 'mc'));

create or replace function public.set_station_pin(p_event uuid, p_role text, p_pin text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if p_role not in ('checkin', 'merchandise', 'draw', 'prizes', 'admin', 'bar', 'mc') then
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

-- Everything the MC screen and the rundown editor need, in one read. Segments come in show order
-- (sort_order, planned_start, id); started_at/ended_at are the latest run of each segment.
create function public.mc_state(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  with cur as (
    select segment_id, started_at from public.rundown_runs where event_id = p_event and ended_at is null
  ), last_run as (
    select distinct on (segment_id) segment_id, started_at, ended_at
      from public.rundown_runs where event_id = p_event
     order by segment_id, started_at desc
  ), seg as (
    select s.id, s.sort_order, s.title, s.planned_start, s.duration_min, s.pic, s.script, s.kind,
           lr.started_at as run_started_at, lr.ended_at as run_ended_at,
           (select coalesce(jsonb_agg(jsonb_build_object(
                'id', p.id, 'name', p.name, 'tier', p.tier, 'quantity', p.quantity, 'mc_script', p.mc_script,
                'confirmed', (select count(*) from public.draws d where d.prize_id = p.id and d.status = 'confirmed'),
                'remaining', p.quantity - (select count(*) from public.draws d
                                            where d.prize_id = p.id and d.status in ('drawn', 'confirmed')),
                'winners', (select coalesce(jsonb_agg(g.full_name order by d.slot), '[]'::jsonb)
                              from public.draws d join public.guests g on g.id = d.winner_guest_id
                             where d.prize_id = p.id and d.status = 'confirmed'))
                order by p.sort_order, p.name), '[]'::jsonb)
              from public.segment_prizes sp join public.prizes p on p.id = sp.prize_id
             where sp.segment_id = s.id) as prizes
      from public.rundown_segments s
      left join last_run lr on lr.segment_id = s.id
     where s.event_id = p_event
  )
  select jsonb_build_object(
    'status', 'OK',
    'server_now', now(),
    'phase', case when exists (select 1 from cur) then 'running'
                  when exists (select 1 from public.rundown_runs where event_id = p_event) then 'ended'
                  else 'not_started' end,
    'current_segment_id', (select segment_id from cur),
    'current_started_at', (select started_at from cur),
    'segments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', seg.id, 'sort_order', seg.sort_order, 'title', seg.title, 'planned_start', seg.planned_start,
        'duration_min', seg.duration_min, 'pic', seg.pic, 'script', seg.script, 'kind', seg.kind,
        'started_at', seg.run_started_at, 'ended_at', seg.run_ended_at, 'prizes', seg.prizes)
        order by seg.sort_order, seg.planned_start, seg.id) from seg), '[]'::jsonb))
$$;

-- NEXT. p_from is the segment the device believes is current (null before the show).
-- If another device moved the show on first, nothing changes and the caller gets ALREADY_ADVANCED with the live state.
create function public.mc_next(p_event uuid, p_from uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_cur public.rundown_runs%rowtype;
  v_started boolean;
  v_next uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('mc_rundown:' || p_event::text, 0));
  select * into v_cur from public.rundown_runs where event_id = p_event and ended_at is null;
  v_started := exists (select 1 from public.rundown_runs where event_id = p_event);

  if v_cur.id is null and v_started then
    return jsonb_build_object('status', 'SHOW_ENDED', 'state', public.mc_state(p_event));
  end if;
  if v_cur.segment_id is distinct from p_from then
    return jsonb_build_object('status', 'ALREADY_ADVANCED', 'state', public.mc_state(p_event));
  end if;

  if v_cur.id is null then
    select id into v_next from public.rundown_segments where event_id = p_event
     order by sort_order, planned_start, id limit 1;
    if v_next is null then
      return jsonb_build_object('status', 'NO_SEGMENTS', 'state', public.mc_state(p_event));
    end if;
  else
    select s.id into v_next
      from public.rundown_segments s
      join public.rundown_segments c on c.id = v_cur.segment_id
     where s.event_id = p_event
       and (s.sort_order, s.planned_start, s.id) > (c.sort_order, c.planned_start, c.id)
     order by s.sort_order, s.planned_start, s.id
     limit 1;
    update public.rundown_runs set ended_at = now() where id = v_cur.id;
  end if;

  if v_next is not null then
    insert into public.rundown_runs (event_id, segment_id, started_by) values (p_event, v_next, p_actor);
  end if;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'mc_next', 'segment',
                       coalesce(v_next, v_cur.segment_id)::text, jsonb_build_object('from', p_from, 'to', v_next));
  return jsonb_build_object('status', case when v_next is null then 'SHOW_ENDED' else 'OK' end,
                            'state', public.mc_state(p_event));
end $$;

-- Admin correction: make any segment current (after a mistaken NEXT, or to jump). Reason required, audited.
create function public.mc_set_current(p_event uuid, p_segment uuid, p_reason text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if length(trim(coalesce(p_reason, ''))) < 5 then
    return jsonb_build_object('status', 'REASON_REQUIRED');
  end if;
  if not exists (select 1 from public.rundown_segments where id = p_segment and event_id = p_event) then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mc_rundown:' || p_event::text, 0));
  if exists (select 1 from public.rundown_runs where event_id = p_event and ended_at is null and segment_id = p_segment) then
    return jsonb_build_object('status', 'ALREADY_CURRENT', 'state', public.mc_state(p_event));
  end if;
  update public.rundown_runs set ended_at = now() where event_id = p_event and ended_at is null;
  insert into public.rundown_runs (event_id, segment_id, started_by, reason)
  values (p_event, p_segment, p_actor, trim(p_reason));
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'mc_set_current', 'segment', p_segment::text,
                       jsonb_build_object('reason', trim(p_reason)));
  return jsonb_build_object('status', 'OK', 'state', public.mc_state(p_event));
end $$;

select public.lock_down_public();
