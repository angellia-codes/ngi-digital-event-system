-- pgTAP: screen switcher, part 2 (admin settings and uploads, suggested screen, report, reset, go-live).
-- Run with `supabase test db`.
begin;
select plan(43);

insert into public.events (id, name, event_date, mode, doors_at)
values ('00000000-0000-0000-0000-0000000000ef', 'T', '2026-12-08', 'rehearsal', now() + interval '30 days');
insert into public.rundown_segments (id, event_id, sort_order, title, planned_start, duration_min) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000ef', 10, 'Award', '2026-12-08 19:00+08', 20);

-- list
select is(jsonb_array_length(public.admin_screen_list('00000000-0000-0000-0000-0000000000ef') -> 'screens'), 12, 'all screens listed');
select is(public.admin_screen_list('00000000-0000-0000-0000-0000000000ef') #>> '{screens,4,key}', 'welcome', 'catalogue order');
select is(public.admin_screen_list('00000000-0000-0000-0000-0000000000ef') #>> '{screens,4,kind}', 'once', 'kind included');
select is(public.admin_screen_list('00000000-0000-0000-0000-0000000000ef') #>> '{screens,4,end_action}', 'hold', 'hold by default');

-- end action
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'welcome', '{"end_action": "goto", "end_target": "ambient_dinner"}', 'admin') ->> 'status',
          'OK', 'goto saved');
select is((select end_target from public.screens where event_id = '00000000-0000-0000-0000-0000000000ef' and key = 'welcome'), 'ambient_dinner', 'target stored');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'welcome', '{"end_action": "goto", "end_target": "draw"}', 'admin') ->> 'status',
          'INVALID', 'cannot end into the draw');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'welcome', '{"end_action": "goto", "end_target": "welcome"}', 'admin') ->> 'status',
          'INVALID', 'cannot end into itself');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'welcome', '{"end_action": "goto"}', 'admin') ->> 'status',
          'INVALID', 'goto needs a target');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'welcome', '{"end_action": "loop"}', 'admin') ->> 'status',
          'INVALID', 'unknown action');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'doorprize_intro', '{"end_action": "goto", "end_target": "closing"}', 'admin') ->> 'status',
          'INVALID', 'door prize intro always holds');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'ambient_dinner', '{"end_action": "hold"}', 'admin') ->> 'status',
          'INVALID', 'loops have no end action');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'welcome', '{"end_action": "hold", "end_target": "closing"}', 'admin') ->> 'status',
          'OK', 'back to hold');
select is((select end_target from public.screens where event_id = '00000000-0000-0000-0000-0000000000ef' and key = 'welcome'), null, 'hold clears the target');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'karaoke', '{}', 'admin') ->> 'status', 'NOT_FOUND', 'unknown screen');

-- closing text
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'closing',
          '{"card_text": {"id": ["TERIMA KASIH", "Sampai jumpa"], "en": ["THANK YOU", "See you"]}}', 'admin') ->> 'status', 'OK', 'closing text saved');
select is(public.stage_screens('00000000-0000-0000-0000-0000000000ef') #>> '{closing,en,0}', 'THANK YOU', 'manifest carries the closing text');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'closing',
          '{"card_text": {"id": ["TERIMA KASIH"], "en": ["THANK YOU", "See you"]}}', 'admin') ->> 'status', 'INVALID', 'two lines per language');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'closing',
          jsonb_build_object('card_text', jsonb_build_object('id', jsonb_build_array(repeat('x', 61), ''), 'en', jsonb_build_array('a', 'b'))), 'admin') ->> 'status',
          'INVALID', 'lines up to 60 characters');
select is(public.admin_save_screen('00000000-0000-0000-0000-0000000000ef', 'welcome',
          '{"card_text": {"id": ["a", "b"], "en": ["a", "b"]}}', 'admin') ->> 'status', 'INVALID', 'card text only on closing');

-- uploads
select is(public.admin_set_screen_video('00000000-0000-0000-0000-0000000000ef', 'welcome', 'welcome/v1.mp4', 50000000, 92.5, 'admin') ->> 'status',
          'OK', 'upload recorded');
select is((select video_version from public.screens where event_id = '00000000-0000-0000-0000-0000000000ef' and key = 'welcome'), 1, 'version 1');
select is(public.admin_set_screen_video('00000000-0000-0000-0000-0000000000ef', 'welcome', 'welcome/v1.mp4', 50000000, 92.5, 'admin') ->> 'status',
          'STALE', 'same version again is stale');
select is(public.admin_set_screen_video('00000000-0000-0000-0000-0000000000ef', 'welcome', 'nominees/v2.mp4', 50000000, 92.5, 'admin') ->> 'status',
          'INVALID', 'path must belong to the key');
select is(public.admin_set_screen_video('00000000-0000-0000-0000-0000000000ef', 'welcome', 'welcome/v2.mp4', 314572801, 92.5, 'admin') ->> 'status',
          'INVALID', 'over 300 MB refused');
select is(public.admin_set_screen_video('00000000-0000-0000-0000-0000000000ef', 'welcome', 'welcome/v2.mp4', 1000, 0, 'admin') ->> 'status',
          'INVALID', 'zero duration refused');
select is(public.admin_set_screen_video('00000000-0000-0000-0000-0000000000ef', 'closing', 'closing/v1.mp4', 1000, 5, 'admin') ->> 'status',
          'INVALID', 'no video on a card screen');
select is(public.admin_set_screen_video('00000000-0000-0000-0000-0000000000ef', 'welcome', 'welcome/v3.mp4', 60000000, 95, 'admin') ->> 'status',
          'OK', 'a newer upload replaces the file');
select is((select video_path from public.screens where event_id = '00000000-0000-0000-0000-0000000000ef' and key = 'welcome'), 'welcome/v3.mp4', 'new path');
select is(public.admin_set_screen_video('00000000-0000-0000-0000-0000000000ef', 'welcome', 'welcome/v2.mp4', 60000000, 95, 'admin') ->> 'status',
          'STALE', 'an older upload finishing late does not win');

-- suggested screen
select is(public.admin_set_segment_screen('00000000-0000-0000-0000-0000000000ef', '00000000-0000-0000-0000-0000000000c1', 'award_intro', 'admin') ->> 'status',
          'OK', 'suggested screen saved');
select is(public.mc_state('00000000-0000-0000-0000-0000000000ef') #>> '{segments,0,suggested_screen}', 'award_intro', 'mc_state carries it');
select is(public.admin_set_segment_screen('00000000-0000-0000-0000-0000000000ef', '00000000-0000-0000-0000-0000000000c1', 'karaoke', 'admin') ->> 'status',
          'INVALID', 'unknown screen refused');
select is(public.admin_set_segment_screen('00000000-0000-0000-0000-0000000000ef', gen_random_uuid(), null, 'admin') ->> 'status',
          'NOT_FOUND', 'unknown segment');

-- report
select is(public.set_screen('00000000-0000-0000-0000-0000000000ef', 'welcome', 0, 'screen') ->> 'status', 'OK', 'a switch to report');
select is(public.report_rows('00000000-0000-0000-0000-0000000000ef', 'screens') #>> '{rows,0,how}', 'manual', 'screens report row');
select is(public.report_rows('00000000-0000-0000-0000-0000000000ef', 'rundown') ->> 'status', 'OK', 'older reports still answer');

-- reset and go-live
select is(public.reset_rehearsal_data('00000000-0000-0000-0000-0000000000ef', 'admin') ->> 'status', 'OK', 'rehearsal reset');
select is((select screen ->> 'key' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ef'), 'ambient_arrival',
          'reset puts the arrival loop back');
select is((select video_path from public.screens where event_id = '00000000-0000-0000-0000-0000000000ef' and key = 'welcome'), 'welcome/v3.mp4',
          'reset keeps the videos');
select is(public.set_screen('00000000-0000-0000-0000-0000000000ef', 'closing',
          (select screen_rev from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ef'), 'screen') ->> 'status', 'OK', 'switch before going live');
select is(public.go_live('00000000-0000-0000-0000-0000000000ef', 'admin') ->> 'status', 'OK', 'go live');
select is((select screen ->> 'key' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ef'), 'ambient_arrival',
          'go-live starts from the arrival loop');

select * from finish();
rollback;
