-- pgTAP: screen switcher, part 1 (screens, role, takeover, set_screen, end of video, panel read, manifest, heartbeat).
-- Run with `supabase test db`.
begin;
select plan(57);

insert into public.events (id, name, event_date, mode, doors_at)
values ('00000000-0000-0000-0000-0000000000ee', 'T', '2026-12-08', 'rehearsal', now() + interval '30 days');
insert into public.prizes (id, event_id, name, sort_order, quantity) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000ee', 'Voucher', 10, 1);

-- rows and keys
select is((select count(*)::int from public.screens where event_id = '00000000-0000-0000-0000-0000000000ee'), 12,
          'a new event gets all 12 screen rows');
select is(public.screen_kind('ambient_dinner'), 'loop', 'ambient is a loop');
select is(public.screen_kind('welcome'), 'once', 'welcome plays once');
select is(public.screen_kind('draw'), 'draw', 'draw kind');
select is(public.screen_kind('closing'), 'card', 'closing is a card');
select is(public.screen_kind('blackout'), 'black', 'blackout kind');
select is((select screen ->> 'key' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'),
          'ambient_arrival', 'stage starts on the arrival loop');
select is((select screen_rev from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 0::bigint,
          'screen_rev starts at 0');
select throws_ok($$insert into public.screens (event_id, key) values ('00000000-0000-0000-0000-0000000000ee', 'karaoke')$$,
                 '23514', null, 'unknown screen key refused');
insert into public.rundown_segments (id, event_id, sort_order, title, planned_start, duration_min, suggested_screen) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000ee', 10, 'Welcome', '2026-12-08 17:00+08', 10, 'welcome');
select throws_ok($$update public.rundown_segments set suggested_screen = 'karaoke' where id = '00000000-0000-0000-0000-0000000000c1'$$,
                 '23514', null, 'suggested screen must be a known key');

-- role 'screen'
select is(public.set_station_pin('00000000-0000-0000-0000-0000000000ee', 'screen', '5678', 'admin') ->> 'status', 'OK',
          'screen PIN can be set');

-- set_screen
select is(public.set_screen('00000000-0000-0000-0000-0000000000ee', 'karaoke', 0, 'screen') ->> 'status', 'INVALID', 'unknown key');
select is(public.set_screen('00000000-0000-0000-0000-0000000000ee', 'welcome', 0, 'screen') ->> 'status', 'NO_VIDEO',
          'a video screen without a file cannot go live');
select is(public.set_screen('00000000-0000-0000-0000-0000000000ee', 'closing', 0, 'screen') ->> 'status', 'OK', 'closing card goes live');
select is((select screen ->> 'key' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'closing', 'screen is closing');
select is((select screen_rev from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 1::bigint, 'screen_rev moved');
select is((select (screen ->> 'auto')::boolean from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), false,
          'manual switch is not auto');
select is((select screen ->> 'by' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'screen', 'by the operator');
select is(public.set_screen('00000000-0000-0000-0000-0000000000ee', 'blackout', 0, 'screen') ->> 'status', 'CHANGED',
          'a stale screen_rev gets CHANGED');
select is(public.set_screen('00000000-0000-0000-0000-0000000000ee', 'blackout', 0, 'screen') #>> '{state,screen,key}', 'closing',
          'CHANGED carries the live state');
select is((select count(*)::int from public.audit_log where event_id = '00000000-0000-0000-0000-0000000000ee' and action = 'screen_set'), 1,
          'one switch audited');
select is((select details ->> 'from' from public.audit_log where event_id = '00000000-0000-0000-0000-0000000000ee' and action = 'screen_set'),
          'ambient_arrival', 'audit keeps the previous screen');

-- draw takeover in stage_write
select is(public.set_stage('00000000-0000-0000-0000-0000000000ee', 'idle', null, 'mc') ->> 'status', 'OK', 'idle phase written');
select is((select screen ->> 'key' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'closing',
          'idle does not take the screen');
select is(public.set_stage('00000000-0000-0000-0000-0000000000ee', 'intro', '00000000-0000-0000-0000-0000000000a1', 'mc') ->> 'status', 'OK',
          'MC picks a prize');
select is((select screen ->> 'key' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'draw',
          'the draw board takes over');
select is((select (screen ->> 'auto')::boolean from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), true,
          'takeover is marked auto');
select is((select screen_rev from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 2::bigint,
          'takeover moves screen_rev');
select is((select count(*)::int from public.audit_log where event_id = '00000000-0000-0000-0000-0000000000ee' and action = 'screen_takeover'), 1,
          'takeover audited');
-- a phase change on the draw board does not bump screen_rev
select lives_ok($$select public.stage_write('00000000-0000-0000-0000-0000000000ee', 'intro', '{}'::jsonb)$$, 'another phase write');
select is((select screen_rev from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 2::bigint,
          'screen_rev unchanged while already on draw');
insert into public.guests (id, event_id, employee_id, full_name, outlet) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000ee', 'E1', 'Ayu', 'A');
insert into public.check_ins (event_id, guest_id, method, prize_number) values
  ('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000001', 'scan', 1);
select is(public.draw_prize('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-0000000000a1', gen_random_uuid(), 'mc') ->> 'status',
          'DRAWN', 'a real draw still works through the new stage_write');
select is((select phase from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'rolling', 'stage is rolling');
select is(public.resolve_draw('00000000-0000-0000-0000-0000000000ee',
          (select id from public.draws where event_id = '00000000-0000-0000-0000-0000000000ee'), 'confirm', 'mc') ->> 'status', 'CONFIRMED', 'confirmed');
select is(public.set_stage('00000000-0000-0000-0000-0000000000ee', 'idle', null, 'mc') ->> 'status', 'OK', 'Layar kosong');
select is((select screen ->> 'key' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'draw',
          'the board stays until the operator moves on');

-- videos and end of video
update public.screens set video_path = 'welcome/v1.mp4', video_version = 1, video_bytes = 1000, duration_s = 30
 where event_id = '00000000-0000-0000-0000-0000000000ee' and key in ('welcome');
update public.screens set video_path = 'ambient_dinner/v1.mp4', video_version = 1, video_bytes = 1000, duration_s = 60
 where event_id = '00000000-0000-0000-0000-0000000000ee' and key = 'ambient_dinner';
select is(public.set_screen('00000000-0000-0000-0000-0000000000ee', 'welcome', 2, 'screen') ->> 'status', 'OK', 'welcome goes live');
select is(public.stage_screen_ended('00000000-0000-0000-0000-0000000000ee', 3) ->> 'status', 'IGNORED', 'hold: end of video changes nothing');
update public.screens set end_action = 'goto', end_target = 'ambient_dinner'
 where event_id = '00000000-0000-0000-0000-0000000000ee' and key = 'welcome';
select is(public.stage_screen_ended('00000000-0000-0000-0000-0000000000ee', 2) ->> 'status', 'IGNORED', 'stale screen_rev ignored');
select is(public.stage_screen_ended('00000000-0000-0000-0000-0000000000ee', 3) ->> 'status', 'OK', 'goto applies');
select is((select screen ->> 'key' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'ambient_dinner',
          'now on the dinner loop');
select is((select screen ->> 'by' from public.stage_state where event_id = '00000000-0000-0000-0000-0000000000ee'), 'stage', 'by the stage');
select is(public.stage_screen_ended('00000000-0000-0000-0000-0000000000ee', 4) ->> 'status', 'IGNORED', 'a loop never ends');
select is((select count(*)::int from public.audit_log where event_id = '00000000-0000-0000-0000-0000000000ee' and action = 'screen_auto_end'), 1,
          'auto end audited');

-- panel read
select is(public.screen_state('00000000-0000-0000-0000-0000000000ee') #>> '{screen,key}', 'ambient_dinner', 'panel sees the live screen');
select is((public.screen_state('00000000-0000-0000-0000-0000000000ee') ->> 'screen_rev')::int, 4, 'panel gets screen_rev');
select is(jsonb_array_length(public.screen_state('00000000-0000-0000-0000-0000000000ee') -> 'screens'), 12, 'twelve screens listed');
select is(public.screen_state('00000000-0000-0000-0000-0000000000ee') #>> '{screens,0,key}', 'ambient_arrival', 'in catalogue order');
select is(jsonb_typeof(public.screen_state('00000000-0000-0000-0000-0000000000ee') -> 'up_next'), 'null', 'no up-next before the show');
insert into public.rundown_runs (event_id, segment_id) values
  ('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-0000000000c1');
select is(public.screen_state('00000000-0000-0000-0000-0000000000ee') #>> '{up_next,screen}', 'welcome', 'up next follows the current segment');

-- manifest and heartbeat
select is(jsonb_array_length(public.stage_screens('00000000-0000-0000-0000-0000000000ee') -> 'videos'), 2, 'manifest lists screens with a file');
select is(public.stage_screens('00000000-0000-0000-0000-0000000000ee') #>> '{videos,0,path}', 'ambient_dinner/v1.mp4', 'manifest order');
select lives_ok($$select public.stage_heartbeat_report('00000000-0000-0000-0000-0000000000ee',
                  '{"ready": 1, "total": 2, "failed": ["welcome"], "sound_on": false}')$$, 'heartbeat with a cache report');
select is(public.screen_state('00000000-0000-0000-0000-0000000000ee') #>> '{cache,failed,0}', 'welcome', 'panel sees failed items');
select lives_ok($$select public.stage_heartbeat_report('00000000-0000-0000-0000-0000000000ee', '{"ready": "x"}')$$, 'malformed report');
select is(public.screen_state('00000000-0000-0000-0000-0000000000ee') -> 'cache', '{}'::jsonb, 'a malformed report is stored as {}');
select is((public.get_stage('00000000-0000-0000-0000-0000000000ee') ->> 'screen_rev')::int, 4, 'projector read carries screen_rev');

select * from finish();
rollback;
