-- Videotron screen switcher (spec 2026-11-13), part 2: admin settings and uploads, suggested screen per rundown segment,
-- the screens report, and rehearsal reset / go-live putting the arrival loop back.

-- Every screen row for the admin page, in catalogue order.
create function public.admin_screen_list(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  select jsonb_build_object('status', 'OK', 'screens', coalesce(jsonb_agg(jsonb_build_object(
      'key', sc.key, 'kind', public.screen_kind(sc.key), 'video_path', sc.video_path, 'video_version', sc.video_version,
      'video_bytes', sc.video_bytes, 'duration_s', sc.duration_s, 'end_action', sc.end_action, 'end_target', sc.end_target,
      'card_text', sc.card_text, 'updated_at', sc.updated_at)
      order by array_position(public.screen_keys(), sc.key)), '[]'::jsonb))
    from public.screens sc
   where sc.event_id = p_event
$$;

-- Settings: end_action + end_target (one-off videos only; the door prize intro always holds) and card_text (closing only).
-- card_text is { "id": [line1, line2], "en": [line1, line2] }, each line 0–60 characters.
create function public.admin_save_screen(p_event uuid, p_key text, p_data jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  sc public.screens%rowtype;
  v_action text;
  v_target text;
  v_lang text;
begin
  if jsonb_typeof(p_data) is distinct from 'object' then
    return jsonb_build_object('status', 'INVALID');
  end if;
  select * into sc from public.screens where event_id = p_event and key = p_key for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;

  if jsonb_exists(p_data, 'end_action') then
    if public.screen_kind(p_key) <> 'once' then
      return jsonb_build_object('status', 'INVALID');
    end if;
    v_action := p_data ->> 'end_action';
    v_target := nullif(p_data ->> 'end_target', '');
    if v_action = 'hold' then
      v_target := null;
    elsif v_action = 'goto' then
      if p_key = 'doorprize_intro' or v_target is null or not (v_target = any (public.screen_keys()))
         or v_target in ('draw', p_key) then
        return jsonb_build_object('status', 'INVALID');
      end if;
    else
      return jsonb_build_object('status', 'INVALID');
    end if;
  end if;

  if jsonb_exists(p_data, 'card_text') then
    if p_key <> 'closing' or jsonb_typeof(p_data -> 'card_text') is distinct from 'object' then
      return jsonb_build_object('status', 'INVALID');
    end if;
    foreach v_lang in array array['id', 'en'] loop
      if jsonb_typeof(p_data #> array['card_text', v_lang]) is distinct from 'array'
         or jsonb_array_length(p_data #> array['card_text', v_lang]) <> 2
         or exists (select 1 from jsonb_array_elements(p_data #> array['card_text', v_lang]) l
                     where jsonb_typeof(l) <> 'string' or length(l #>> '{}') > 60) then
        return jsonb_build_object('status', 'INVALID');
      end if;
    end loop;
  end if;

  update public.screens set
    end_action = case when jsonb_exists(p_data, 'end_action') then v_action else end_action end,
    end_target = case when jsonb_exists(p_data, 'end_action') then v_target else end_target end,
    card_text  = case when jsonb_exists(p_data, 'card_text')
                      then jsonb_build_object('id', p_data #> '{card_text,id}', 'en', p_data #> '{card_text,en}') else card_text end,
    updated_at = now()
   where event_id = p_event and key = p_key;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'screen_settings', 'screen', p_key,
                       jsonb_build_object('fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_data) k)));
  return jsonb_build_object('status', 'OK');
end $$;

-- Records a finished upload. The path is '<key>/v<n>.mp4' where n must be newer than the stored version, so an old
-- upload finishing late never replaces a newer file. Size ≤ 300 MB, duration ≤ 1 hour.
create function public.admin_set_screen_video(p_event uuid, p_key text, p_path text, p_bytes bigint, p_duration numeric,
                                              p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  sc public.screens%rowtype;
  v_version int;
begin
  select * into sc from public.screens where event_id = p_event and key = p_key for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  if public.screen_kind(p_key) not in ('loop', 'once')
     or p_path is null or p_path !~ ('^' || p_key || '/v[0-9]{1,6}\.mp4$')
     or p_bytes is null or p_bytes not between 1 and 314572800
     or p_duration is null or p_duration <= 0 or p_duration > 3600 then
    return jsonb_build_object('status', 'INVALID');
  end if;
  v_version := substring(p_path from '/v([0-9]+)\.mp4$')::int;
  if v_version <= sc.video_version then
    return jsonb_build_object('status', 'STALE');
  end if;
  update public.screens
     set video_path = p_path, video_version = v_version, video_bytes = p_bytes, duration_s = round(p_duration, 2), updated_at = now()
   where event_id = p_event and key = p_key;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'screen_video', 'screen', p_key,
                       jsonb_build_object('path', p_path, 'bytes', p_bytes, 'duration_s', round(p_duration, 2)));
  return jsonb_build_object('status', 'OK', 'version', v_version);
end $$;

-- The suggested screen of a rundown segment (null clears it). Shown as "Up next" on the Screen Control panel.
create function public.admin_set_segment_screen(p_event uuid, p_segment uuid, p_screen text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if p_screen is not null and not (p_screen = any (public.screen_keys())) then
    return jsonb_build_object('status', 'INVALID');
  end if;
  update public.rundown_segments set suggested_screen = p_screen, updated_at = now()
   where id = p_segment and event_id = p_event;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'segment_screen', 'segment', p_segment::text,
                       jsonb_build_object('screen', p_screen));
  return jsonb_build_object('status', 'OK');
end $$;

-- mc_state (migration 17) gains each segment's suggested_screen; everything else is unchanged.
create or replace function public.mc_state(p_event uuid) returns jsonb
language sql stable security definer set search_path = public, extensions
as $$
  with cur as (
    select segment_id, started_at from public.rundown_runs where event_id = p_event and ended_at is null
  ), last_run as (
    select distinct on (segment_id) segment_id, started_at, ended_at
      from public.rundown_runs where event_id = p_event
     order by segment_id, started_at desc
  ), seg as (
    select s.id, s.sort_order, s.title, s.planned_start, s.duration_min, s.pic, s.script, s.kind, s.suggested_screen,
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
        'suggested_screen', seg.suggested_screen,
        'started_at', seg.run_started_at, 'ended_at', seg.run_ended_at, 'prizes', seg.prizes)
        order by seg.sort_order, seg.planned_start, seg.id) from seg), '[]'::jsonb))
$$;

-- Report list gains 'screens': every switch from the audit log, oldest first.
-- The previous report_rows keeps its body under report_rows_mc, which still calls report_rows_merch → report_rows_core.
-- A later migration that redefines report_rows must keep calling report_rows_mc (or fold it in).
alter function public.report_rows(uuid, text) rename to report_rows_mc;

create function public.report_rows(p_event uuid, p_report text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v jsonb;
begin
  if p_report <> 'screens' then
    return public.report_rows_mc(p_event, p_report);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'at', a.at, 'screen', a.entity_id, 'from', a.details ->> 'from', 'by', a.actor,
      'how', case a.action when 'screen_set' then 'manual' when 'screen_takeover' then 'draw takeover' else 'end of video' end)
      order by a.at, a.id), '[]'::jsonb) into v
    from public.audit_log a
   where a.event_id = p_event and a.action in ('screen_set', 'screen_takeover', 'screen_auto_end');
  return jsonb_build_object('status', 'OK', 'rows', v);
end $$;

-- Rehearsal reset also puts the arrival loop back on the videotron. Videos and screen settings stay.
create or replace function public.reset_rehearsal_data(p_event uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  if not exists (select 1 from public.events where id = p_event and mode = 'rehearsal') then
    return jsonb_build_object('status', 'NOT_REHEARSAL');
  end if;
  delete from public.rundown_runs where event_id = p_event;
  delete from public.draws where event_id = p_event;
  delete from public.merchandise_redemptions where event_id = p_event;
  delete from public.beverage_redemptions where event_id = p_event;
  delete from public.check_ins where event_id = p_event;
  delete from public.attempt_log where event_id = p_event;
  delete from public.auth_attempts where true; -- PostgREST safeupdate needs a WHERE
  delete from public.stage_heartbeat where event_id = p_event;
  delete from public.audit_log where event_id = p_event;
  update public.stage_state
     set rev = rev + 1, phase = 'idle', payload = '{}'::jsonb, updated_at = now(),
         screen = jsonb_build_object('key', 'ambient_arrival', 'started_at', now(), 'by', 'admin', 'auto', false),
         screen_rev = screen_rev + 1
   where event_id = p_event;
  update public.events set next_prize_number = 1 where id = p_event;
  perform public.audit(p_event, 'admin', p_actor, 'rehearsal_reset', 'event', p_event::text, '{}'::jsonb);
  return jsonb_build_object('status', 'OK');
end $$;

-- Going live also starts from the arrival loop.
create or replace function public.go_live(p_event uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
begin
  update public.events set mode = 'live' where id = p_event and mode = 'rehearsal';
  if not found then
    return jsonb_build_object('status', 'NOT_REHEARSAL');
  end if;
  update public.stage_state
     set rev = rev + 1, updated_at = now(),
         screen = jsonb_build_object('key', 'ambient_arrival', 'started_at', now(), 'by', 'admin', 'auto', false),
         screen_rev = screen_rev + 1
   where event_id = p_event;
  perform public.audit(p_event, 'admin', p_actor, 'go_live', 'event', p_event::text, '{}'::jsonb);
  return jsonb_build_object('status', 'OK');
end $$;

select public.lock_down_public();
