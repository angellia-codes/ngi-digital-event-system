-- Stage videos: the admin can put one of four background loops on the stage display, and take it off again.
-- The loop plays until someone taps Stop, or until the MC shows a prize (the draw always takes the screen back).

alter table public.stage_state drop constraint stage_state_phase_check;
alter table public.stage_state add constraint stage_state_phase_check
  check (phase in ('idle', 'intro', 'rolling', 'revealed', 'void', 'video'));

-- p_key null = Stop. Stop only blanks the screen when a video is showing, so it can never wipe a prize or a winner.
-- The payload is built here from a fixed list; the caller cannot put anything else on the projector.
create function public.set_stage_video(p_event uuid, p_key text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_phase text;
begin
  if p_key is not null and p_key not in ('welcome', 'synthwave_sunset', 'retro_tv', 'neon_city') then
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

-- Where the loops live: a public, read-only bucket (no policies, so only the dashboard / service role can upload).
-- File names are fixed in src/lib/stage-videos.ts. Nothing private goes in here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stage-videos', 'stage-videos', true, 52428800, array['video/mp4'])
on conflict (id) do nothing;

select public.lock_down_public();
