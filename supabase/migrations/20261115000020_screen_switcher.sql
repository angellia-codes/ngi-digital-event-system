-- Videotron screen switcher (spec 2026-11-13), part 1: screens, the live screen on stage_state, role 'screen',
-- the draw takeover in stage_write, switching, end-of-video, the panel read, the stage manifest and the cache heartbeat.
-- The screen keys are fixed: screen_keys() here and SCREENS in src/lib/screens.ts must list the same 12 keys.

create function public.screen_keys() returns text[]
language sql immutable
as $$ select array['ambient_arrival', 'ambient_dinner', 'ambient_afterparty', 'candid_cam', 'welcome', 'director_gm',
                   'award_intro', 'nominees', 'doorprize_intro', 'draw', 'closing', 'blackout'] $$;

-- loop: silent looping video · once: plays once with sound · draw: the live draw board · card: in-app card · black.
create function public.screen_kind(p_key text) returns text
language sql immutable
as $$
  select case
    when p_key in ('ambient_arrival', 'ambient_dinner', 'ambient_afterparty', 'candid_cam') then 'loop'
    when p_key in ('welcome', 'director_gm', 'award_intro', 'nominees', 'doorprize_intro') then 'once'
    when p_key = 'draw' then 'draw'
    when p_key = 'closing' then 'card'
    when p_key = 'blackout' then 'black'
  end
$$;

create table public.screens (
  event_id uuid not null references public.events (id),
  key text not null check (key = any (public.screen_keys())),
  video_path text check (video_path ~ '^[a-z_]+/v[0-9]+\.mp4$'),
  video_version int not null default 0 check (video_version >= 0),
  video_bytes bigint check (video_bytes > 0),
  duration_s numeric(8, 2) check (duration_s > 0),
  end_action text not null default 'hold' check (end_action in ('hold', 'goto')),
  end_target text check (end_target = any (public.screen_keys())),
  card_text jsonb,
  updated_at timestamptz not null default now(),
  primary key (event_id, key)
);

insert into public.screens (event_id, key)
select e.id, k from public.events e cross join unnest(public.screen_keys()) k
on conflict do nothing;

create function public.create_screen_rows() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.screens (event_id, key) select new.id, k from unnest(public.screen_keys()) k on conflict do nothing;
  return new;
end $$;
create trigger events_create_screen_rows after insert on public.events
for each row execute function public.create_screen_rows();

-- The live screen. screen_rev moves only when the screen changes; rev also moves on draw phases and options,
-- so screen_rev is what "the operator saw the latest screen" is checked against.
alter table public.stage_state
  add column screen jsonb not null default '{"key": "ambient_arrival", "started_at": null, "by": null, "auto": false}'::jsonb,
  add column screen_rev bigint not null default 0;

-- What the stage laptop last reported about its video cache and sound unlock.
alter table public.stage_heartbeat add column cache jsonb not null default '{}'::jsonb;

alter table public.rundown_segments
  add column suggested_screen text check (suggested_screen = any (public.screen_keys()));

-- New role 'screen'.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.station_pins'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%checkin%' loop
    execute format('alter table public.station_pins drop constraint %I', c);
  end loop;
end $$;
alter table public.station_pins
  add constraint station_pins_role_check check (role in ('checkin', 'merchandise', 'draw', 'prizes', 'admin', 'bar', 'mc', 'screen'));

create or replace function public.set_station_pin(p_event uuid, p_role text, p_pin text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if p_role not in ('checkin', 'merchandise', 'draw', 'prizes', 'admin', 'bar', 'mc', 'screen') then
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

-- Draw takeover. stage_write is the only writer of draw phases, so this is the one place it can happen:
-- any phase other than 'idle' puts the draw board on the videotron in the same statement. 'idle' leaves the screen alone.
create or replace function public.stage_write(p_event uuid, p_phase text, p_payload jsonb) returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_old text;
  v_take boolean;
begin
  select screen ->> 'key' into v_old from public.stage_state where event_id = p_event for update;
  v_take := p_phase <> 'idle' and coalesce(v_old, '') <> 'draw';
  insert into public.stage_state (event_id, rev, phase, payload)
  values (p_event, 1, p_phase, coalesce(p_payload, '{}'::jsonb))
  on conflict (event_id) do update
    set rev = public.stage_state.rev + 1, phase = excluded.phase, payload = excluded.payload, updated_at = now(),
        screen = case when v_take then jsonb_build_object('key', 'draw', 'started_at', now(), 'by', 'draw', 'auto', true)
                      else public.stage_state.screen end,
        screen_rev = public.stage_state.screen_rev + case when v_take then 1 else 0 end;
  if v_take then
    perform public.audit(p_event, 'system', 'draw', 'screen_takeover', 'screen', 'draw', jsonb_build_object('from', v_old));
  end if;
end $$;

-- The projector read gains the live screen.
create or replace function public.get_stage(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'status', 'OK',
    'rev', coalesce(s.rev, 0),
    'phase', coalesce(s.phase, 'idle'),
    'payload', coalesce(s.payload, '{}'::jsonb),
    'options', coalesce(s.options, '{"safe_mode": false, "reduce_effects": false, "language": "en"}'::jsonb),
    'screen', coalesce(s.screen, '{"key": "ambient_arrival", "started_at": null, "by": null, "auto": false}'::jsonb),
    'screen_rev', coalesce(s.screen_rev, 0),
    'server_now', now(),
    'updated_at', s.updated_at)
  from (select 1) one
  left join public.stage_state s on s.event_id = p_event
$$;

-- Everything the Screen Control panel shows, in one read.
create function public.screen_state(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'status', 'OK',
    'server_now', now(),
    'screen', s.screen,
    'screen_rev', s.screen_rev,
    'draw_phase', s.phase,
    'draw_pending', exists (select 1 from public.draws d where d.event_id = p_event and d.status = 'drawn'),
    'heartbeat_age', (select extract(epoch from (now() - h.seen_at))::int from public.stage_heartbeat h where h.event_id = p_event),
    'cache', coalesce((select h.cache from public.stage_heartbeat h where h.event_id = p_event), '{}'::jsonb),
    'screens', (select coalesce(jsonb_agg(jsonb_build_object(
                    'key', sc.key, 'has_video', sc.video_path is not null, 'duration_s', sc.duration_s, 'version', sc.video_version)
                  order by array_position(public.screen_keys(), sc.key)), '[]'::jsonb)
                  from public.screens sc where sc.event_id = p_event),
    'up_next', (select jsonb_build_object('segment_id', rs.id, 'title', rs.title, 'screen', rs.suggested_screen)
                  from public.rundown_runs r join public.rundown_segments rs on rs.id = r.segment_id
                 where r.event_id = p_event and r.ended_at is null and rs.suggested_screen is not null))
  from public.stage_state s
  where s.event_id = p_event
$$;

-- The operator puts a screen live. p_from_screen_rev is the screen_rev the panel last showed: if anything changed
-- the screen since (another operator, a draw takeover, the end of a video), nothing happens and the caller gets CHANGED.
-- Picking the screen that is already live replays it from the start.
create function public.set_screen(p_event uuid, p_key text, p_from_screen_rev bigint, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  st public.stage_state%rowtype;
begin
  if p_key is null or not (p_key = any (public.screen_keys())) or p_from_screen_rev is null then
    return jsonb_build_object('status', 'INVALID');
  end if;
  select * into st from public.stage_state where event_id = p_event for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  if st.screen_rev <> p_from_screen_rev then
    return jsonb_build_object('status', 'CHANGED', 'state', public.screen_state(p_event));
  end if;
  if public.screen_kind(p_key) in ('loop', 'once')
     and (select video_path from public.screens where event_id = p_event and key = p_key) is null then
    return jsonb_build_object('status', 'NO_VIDEO');
  end if;
  update public.stage_state
     set screen = jsonb_build_object('key', p_key, 'started_at', now(), 'by', p_actor, 'auto', false),
         screen_rev = screen_rev + 1, rev = rev + 1, updated_at = now()
   where event_id = p_event;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'screen_set', 'screen', p_key,
                       jsonb_build_object('from', st.screen ->> 'key'));
  return jsonb_build_object('status', 'OK', 'state', public.screen_state(p_event));
end $$;

-- The stage laptop reports that a one-off video reached its end. Only a 'goto' end action does anything, and only
-- if the screen has not changed since the laptop started that video.
create function public.stage_screen_ended(p_event uuid, p_screen_rev bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  st public.stage_state%rowtype;
  sc public.screens%rowtype;
  v_key text;
begin
  select * into st from public.stage_state where event_id = p_event for update;
  if not found or st.screen_rev <> p_screen_rev then
    return jsonb_build_object('status', 'IGNORED');
  end if;
  v_key := st.screen ->> 'key';
  if public.screen_kind(v_key) <> 'once' or v_key = 'doorprize_intro' then
    return jsonb_build_object('status', 'IGNORED');
  end if;
  select * into sc from public.screens where event_id = p_event and key = v_key;
  if sc.end_action <> 'goto' or sc.end_target is null then
    return jsonb_build_object('status', 'IGNORED');
  end if;
  if public.screen_kind(sc.end_target) in ('loop', 'once')
     and (select video_path from public.screens where event_id = p_event and key = sc.end_target) is null then
    return jsonb_build_object('status', 'NO_VIDEO');
  end if;
  update public.stage_state
     set screen = jsonb_build_object('key', sc.end_target, 'started_at', now(), 'by', 'stage', 'auto', true),
         screen_rev = screen_rev + 1, rev = rev + 1, updated_at = now()
   where event_id = p_event;
  perform public.audit(p_event, 'system', 'stage', 'screen_auto_end', 'screen', sc.end_target, jsonb_build_object('from', v_key));
  return jsonb_build_object('status', 'OK');
end $$;

-- What the stage laptop downloads: every screen that has a video, plus the closing card text.
create function public.stage_screens(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object(
    'status', 'OK',
    'videos', coalesce((select jsonb_agg(jsonb_build_object(
                  'key', sc.key, 'path', sc.video_path, 'version', sc.video_version, 'bytes', sc.video_bytes, 'duration_s', sc.duration_s)
                order by array_position(public.screen_keys(), sc.key))
                from public.screens sc where sc.event_id = p_event and sc.video_path is not null), '[]'::jsonb),
    'closing', (select sc.card_text from public.screens sc where sc.event_id = p_event and sc.key = 'closing'))
$$;

-- Heartbeat with the cache report: { ready, total, failed: [key], sound_on }. A malformed report is stored as {}.
create function public.stage_heartbeat_report(p_event uuid, p_cache jsonb) returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(p_cache) = 'object'
     and jsonb_typeof(p_cache -> 'ready') = 'number' and jsonb_typeof(p_cache -> 'total') = 'number'
     and jsonb_typeof(p_cache -> 'failed') = 'array' and jsonb_typeof(p_cache -> 'sound_on') = 'boolean'
     and not exists (select 1 from jsonb_array_elements(p_cache -> 'failed') f
                      where jsonb_typeof(f) <> 'string' or not ((f #>> '{}') = any (public.screen_keys()))) then
    v := jsonb_build_object('ready', p_cache -> 'ready', 'total', p_cache -> 'total',
                            'failed', p_cache -> 'failed', 'sound_on', p_cache -> 'sound_on');
  end if;
  insert into public.stage_heartbeat (event_id, seen_at, cache) values (p_event, now(), v)
  on conflict (event_id) do update set seen_at = now(), cache = v;
end $$;

select public.lock_down_public();
