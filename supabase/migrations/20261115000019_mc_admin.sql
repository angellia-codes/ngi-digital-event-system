-- MC cue card (spec 2026-11-09), part 3: rundown editor, rundown report, rehearsal reset.

-- Creates (p_id null) or updates a segment. Only the keys present in p_data change on update.
-- planned_time is 'HH:MM' WITA on the event date. prize_ids replaces the segment's prizes (door_prize segments only).
-- A finished segment (run and closed, not current) is read-only.
create function public.admin_save_segment(p_event uuid, p_id uuid, p_data jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  s public.rundown_segments%rowtype;
  e public.events%rowtype;
  v_title text;
  v_start timestamptz;
  v_dur int;
  v_sort int;
  v_pic text;
  v_script text;
  v_kind text;
  v_prizes uuid[];
  v_taken text;
begin
  if jsonb_typeof(p_data) is distinct from 'object' then
    return jsonb_build_object('status', 'INVALID');
  end if;
  select * into e from public.events where id = p_event;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;

  if jsonb_exists(p_data, 'title') then
    v_title := nullif(trim(coalesce(p_data ->> 'title', '')), '');
    if v_title is null or length(v_title) > 80 then
      return jsonb_build_object('status', 'INVALID');
    end if;
  end if;
  if jsonb_exists(p_data, 'planned_time') then
    if coalesce(p_data ->> 'planned_time', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return jsonb_build_object('status', 'INVALID');
    end if;
    v_start := ((e.event_date::text || ' ' || (p_data ->> 'planned_time'))::timestamp at time zone 'Asia/Makassar');
  end if;
  if jsonb_exists(p_data, 'duration_min') then
    if coalesce(p_data ->> 'duration_min', '') !~ '^[0-9]{1,3}$' or (p_data ->> 'duration_min')::int not between 1 and 600 then
      return jsonb_build_object('status', 'INVALID');
    end if;
    v_dur := (p_data ->> 'duration_min')::int;
  end if;
  if jsonb_exists(p_data, 'sort_order') then
    if coalesce(p_data ->> 'sort_order', '') !~ '^[0-9]{1,6}$' then
      return jsonb_build_object('status', 'INVALID');
    end if;
    v_sort := (p_data ->> 'sort_order')::int;
  end if;
  if jsonb_exists(p_data, 'pic') then
    v_pic := nullif(trim(coalesce(p_data ->> 'pic', '')), '');
    if length(coalesce(v_pic, '')) > 80 then
      return jsonb_build_object('status', 'INVALID');
    end if;
  end if;
  if jsonb_exists(p_data, 'script') then
    v_script := nullif(trim(coalesce(p_data ->> 'script', '')), '');
    if length(coalesce(v_script, '')) > 4000 then
      return jsonb_build_object('status', 'INVALID');
    end if;
  end if;
  if jsonb_exists(p_data, 'kind') then
    v_kind := p_data ->> 'kind';
    if v_kind is null or v_kind not in ('normal', 'door_prize') then
      return jsonb_build_object('status', 'INVALID');
    end if;
  end if;
  if jsonb_exists(p_data, 'prize_ids') then
    if jsonb_typeof(p_data -> 'prize_ids') is distinct from 'array'
       or exists (select 1 from jsonb_array_elements(p_data -> 'prize_ids') x
                   where jsonb_typeof(x) <> 'string'
                      or (x #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      return jsonb_build_object('status', 'INVALID');
    end if;
    select coalesce(array_agg(distinct (x #>> '{}')::uuid), '{}') into v_prizes
      from jsonb_array_elements(p_data -> 'prize_ids') x;
    if (select count(*) from public.prizes where event_id = p_event and id = any (v_prizes)) <> cardinality(v_prizes) then
      return jsonb_build_object('status', 'INVALID');
    end if;
  end if;

  if p_id is null then
    if v_title is null or v_start is null or v_dur is null then
      return jsonb_build_object('status', 'INVALID');
    end if;
    if cardinality(coalesce(v_prizes, '{}')) > 0 and coalesce(v_kind, 'normal') <> 'door_prize' then
      return jsonb_build_object('status', 'INVALID');
    end if;
    select sp_name into v_taken from (
      select p.name as sp_name from public.segment_prizes sp join public.prizes p on p.id = sp.prize_id
       where sp.prize_id = any (coalesce(v_prizes, '{}')) limit 1) t;
    if v_taken is not null then
      return jsonb_build_object('status', 'PRIZE_TAKEN', 'prize', v_taken);
    end if;
    insert into public.rundown_segments (event_id, sort_order, title, planned_start, duration_min, pic, script, kind)
    values (p_event,
            coalesce(v_sort, (select coalesce(max(sort_order), 0) + 10 from public.rundown_segments where event_id = p_event)),
            v_title, v_start, v_dur, v_pic, v_script, coalesce(v_kind, 'normal'))
    returning * into s;
    insert into public.segment_prizes (prize_id, segment_id, event_id)
    select unnest(coalesce(v_prizes, '{}')), s.id, p_event;
    perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'segment_created', 'segment', s.id::text,
                         jsonb_build_object('title', s.title));
    return jsonb_build_object('status', 'OK', 'id', s.id);
  end if;

  select * into s from public.rundown_segments where id = p_id and event_id = p_event for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  if exists (select 1 from public.rundown_runs r where r.segment_id = s.id and r.ended_at is not null)
     and not exists (select 1 from public.rundown_runs r where r.segment_id = s.id and r.ended_at is null) then
    return jsonb_build_object('status', 'LOCKED');
  end if;
  if coalesce(v_kind, s.kind) = 'normal' and cardinality(coalesce(v_prizes, '{}')) > 0 then
    return jsonb_build_object('status', 'INVALID');
  end if;
  select sp_name into v_taken from (
    select p.name as sp_name from public.segment_prizes sp join public.prizes p on p.id = sp.prize_id
     where sp.prize_id = any (coalesce(v_prizes, '{}')) and sp.segment_id <> s.id limit 1) t;
  if v_taken is not null then
    return jsonb_build_object('status', 'PRIZE_TAKEN', 'prize', v_taken);
  end if;

  update public.rundown_segments set
    title         = coalesce(v_title, title),
    planned_start = coalesce(v_start, planned_start),
    duration_min  = coalesce(v_dur, duration_min),
    sort_order    = coalesce(v_sort, sort_order),
    pic           = case when jsonb_exists(p_data, 'pic') then v_pic else pic end,
    script        = case when jsonb_exists(p_data, 'script') then v_script else script end,
    kind          = coalesce(v_kind, kind),
    updated_at    = now()
   where id = s.id;
  if coalesce(v_kind, s.kind) = 'normal' then
    delete from public.segment_prizes where segment_id = s.id;
  elsif v_prizes is not null then
    delete from public.segment_prizes where segment_id = s.id;
    insert into public.segment_prizes (prize_id, segment_id, event_id) select unnest(v_prizes), s.id, p_event;
  end if;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'segment_updated', 'segment', s.id::text,
                       jsonb_build_object('fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_data) k)));
  return jsonb_build_object('status', 'OK', 'id', s.id);
end $$;

-- A segment that has ever run (current or finished) cannot be deleted.
create function public.admin_delete_segment(p_event uuid, p_id uuid, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  s public.rundown_segments%rowtype;
begin
  select * into s from public.rundown_segments where id = p_id and event_id = p_event for update;
  if not found then
    return jsonb_build_object('status', 'NOT_FOUND');
  end if;
  if exists (select 1 from public.rundown_runs where segment_id = s.id) then
    return jsonb_build_object('status', 'HAS_RUNS');
  end if;
  delete from public.rundown_segments where id = s.id;
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'segment_deleted', 'segment', s.id::text,
                       jsonb_build_object('title', s.title));
  return jsonb_build_object('status', 'OK');
end $$;

-- Report list gains 'rundown' (one row per run; a segment never run gets one row with empty actual times).
-- The previous report_rows keeps its body under report_rows_merch, which still calls report_rows_core.
-- A later migration that redefines report_rows must keep calling report_rows_merch (or fold it in).
alter function public.report_rows(uuid, text) rename to report_rows_merch;

create function public.report_rows(p_event uuid, p_report text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v jsonb;
begin
  if p_report <> 'rundown' then
    return public.report_rows_merch(p_event, p_report);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'segment', s.title, 'kind', s.kind, 'planned_start', s.planned_start, 'planned_min', s.duration_min,
      'actual_start', r.started_at, 'actual_end', r.ended_at,
      'actual_min', case when r.ended_at is not null
                         then round(extract(epoch from r.ended_at - r.started_at) / 60)::int end,
      'drift_min', case when r.started_at is not null
                        then round(extract(epoch from r.started_at - s.planned_start) / 60)::int end,
      'started_by', r.started_by, 'reason', r.reason)
      order by s.sort_order, s.planned_start, s.id, r.started_at), '[]'::jsonb) into v
    from public.rundown_segments s
    left join public.rundown_runs r on r.segment_id = s.id
   where s.event_id = p_event;
  return jsonb_build_object('status', 'OK', 'rows', v);
end $$;

-- Rehearsal reset also clears the show log. Segments, prize assignments, VIP tags and scripts stay.
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
     set rev = rev + 1, phase = 'idle', payload = '{}'::jsonb, updated_at = now()
   where event_id = p_event;
  update public.events set next_prize_number = 1 where id = p_event;
  perform public.audit(p_event, 'admin', p_actor, 'rehearsal_reset', 'event', p_event::text, '{}'::jsonb);
  return jsonb_build_object('status', 'OK');
end $$;

select public.lock_down_public();
