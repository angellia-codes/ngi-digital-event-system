-- pgTAP: stage videos (set_stage_video). Run with `supabase test db`.
begin;
select plan(18);

insert into public.events (id, name, event_date, mode, doors_at)
values ('00000000-0000-0000-0000-0000000000ee', 'T', '2026-12-08', 'rehearsal', now() + interval '30 days');
insert into public.guests (id, event_id, employee_id, full_name, outlet) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000ee', 'E1', 'Ayu', 'A');
insert into public.check_ins (event_id, guest_id, method, prize_number) values
  ('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000011', 'scan', 1);
insert into public.prizes (id, event_id, name, sort_order) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000ee', 'Voucher', 10);

-- play
select is(public.set_stage_video('00000000-0000-0000-0000-0000000000ee', 'karaoke', 'admin') ->> 'status', 'INVALID_VIDEO', 'unknown video refused');
select is((select phase from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'idle', 'refusal leaves the stage alone');
select is(public.set_stage_video('00000000-0000-0000-0000-0000000000ee', 'neon_city', 'admin') ->> 'status', 'OK', 'play neon city');
select is((select phase from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'video', 'phase is video');
select is((select payload from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), '{"video":"neon_city"}'::jsonb, 'payload names the video only');
select is(public.set_stage_video('00000000-0000-0000-0000-0000000000ee', 'retro_tv', 'admin') ->> 'status', 'OK', 'switch straight to another loop');
select is((select payload ->> 'video' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'retro_tv', 'new loop on screen');
select is((select count(*)::int from public.audit_log where event_id = '00000000-0000-0000-0000-0000000000ee' and action = 'stage_video'), 2, 'each play is audited');

-- stop
select is(public.set_stage_video('00000000-0000-0000-0000-0000000000ee', null, 'admin') ->> 'status', 'OK', 'stop');
select is((select phase from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'idle', 'stop returns to the idle board');
select is(public.set_stage_video('00000000-0000-0000-0000-0000000000ee', null, 'admin') ->> 'status', 'NOT_PLAYING', 'stop when nothing plays');
select is((select count(*)::int from public.audit_log where event_id = '00000000-0000-0000-0000-0000000000ee' and action = 'stage_video_stop'), 1, 'stop is audited once');

-- the draw takes over, and Stop never blanks a prize
select is(public.set_stage_video('00000000-0000-0000-0000-0000000000ee', 'welcome', 'admin') ->> 'status', 'OK', 'play welcome');
select is(public.set_stage('00000000-0000-0000-0000-0000000000ee', 'intro', '00000000-0000-0000-0000-0000000000b1', 'mc') ->> 'status', 'OK', 'MC shows a prize over the video');
select is((select phase from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'intro', 'prize banner replaced the video');
select is(public.set_stage_video('00000000-0000-0000-0000-0000000000ee', null, 'admin') ->> 'status', 'NOT_PLAYING', 'a late Stop does not touch the prize');

-- no video while a number is waiting for the MC
insert into public.draws (event_id, prize_id, slot, winner_guest_id, status, request_id, request_group, round_id) values
  ('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-0000000000b1', 1,
   '00000000-0000-0000-0000-000000000011', 'drawn', gen_random_uuid(), gen_random_uuid(), gen_random_uuid());
select is(public.set_stage_video('00000000-0000-0000-0000-0000000000ee', 'welcome', 'admin') ->> 'status', 'DRAW_IN_PROGRESS', 'refused during a draw');
select is((select phase from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'intro', 'stage unchanged');

select * from finish();
rollback;
