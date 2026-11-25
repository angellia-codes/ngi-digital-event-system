-- pgTAP: the opening film key and the start stamp on every Play. Run with `supabase test db`.
begin;
select plan(5);

insert into public.events (id, name, event_date, mode, doors_at)
values ('00000000-0000-0000-0000-0000000000ef', 'T', '2026-12-08', 'rehearsal', now() + interval '30 days');

select is(public.set_stage_video('00000000-0000-0000-0000-0000000000ef', 'opening', 'admin') ->> 'status', 'OK', 'play the opening film');
select is((select payload ->> 'video' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ef'), 'opening', 'opening on screen');
select ok((select abs((payload ->> 'started_at')::bigint - (extract(epoch from clock_timestamp()) * 1000)::bigint) < 60000
           from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ef'), 'start time stamped in ms');
select is((select count(*)::int from (select jsonb_object_keys(payload) from public.stage_state
           where event_id = '00000000-0000-0000-0000-0000000000ef') k), 2, 'payload holds only the video and its start');
select is((select file_size_limit from storage.buckets where id = 'stage-videos'), 104857600::bigint, 'bucket takes files up to 100 MB');

select * from finish();
rollback;
