-- Stage videos: two more loops, Sunset and Candid Cam (six in all). Same function as
-- 20261115000020_stage_video.sql with only the accepted list widened; the keys must match src/lib/stage-videos.ts.
create or replace function public.set_stage_video(p_event uuid, p_key text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_phase text;
begin
  if p_key is not null and p_key not in ('welcome', 'synthwave_sunset', 'retro_tv', 'neon_city', 'sunset', 'candid_cam') then
    return jsonb_build_object('status', 'INVALID_VIDEO');
  end if;
  -- Same lock as the draw functions, so a video and a draw cannot race each other.
  perform pg_advisory_xact_lock(hashtextextended('draw:' || p_event::text, 0));
  select phase into v_phase from public.stage_state where event_id = p_event;
  if p_key is null then
    if v_phase is distinct from 'video' then
      return jsonb_build_object('status', 'NOT_PLAYING');
    end if;
    perform public.stage_write(p_event, 'idle', '{}'::jsonb);
    perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'stage_video_stop', 'stage', p_event::text, '{}'::jsonb);
    return jsonb_build_object('status', 'OK');
  end if;
  if exists (select 1 from public.draws where event_id = p_event and status = 'drawn') then
    return jsonb_build_object('status', 'DRAW_IN_PROGRESS');
  end if;
  perform public.stage_write(p_event, 'video', jsonb_build_object('video', p_key));
  perform public.audit(p_event, public.actor_type_of(p_actor), p_actor, 'stage_video', 'stage', p_event::text,
                       jsonb_build_object('video', p_key));
  return jsonb_build_object('status', 'OK');
end $$;

select public.lock_down_public();
