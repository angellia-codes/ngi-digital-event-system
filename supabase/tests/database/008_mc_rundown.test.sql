-- pgTAP: MC cue card, part 1 (role, mc_state, mc_next, mc_set_current). Run with `supabase test db`.
begin;
select plan(40);

insert into public.events (id, name, event_date, mode, doors_at)
values ('00000000-0000-0000-0000-0000000000dd', 'T', '2026-12-08', 'rehearsal', now() + interval '30 days');

insert into public.guests (id, event_id, employee_id, full_name, outlet) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000dd', 'E1', 'Ayu', 'A'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000dd', 'E2', 'Budi', 'A');
insert into public.check_ins (event_id, guest_id, method, prize_number) values
  ('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-000000000001', 'scan', 1);

insert into public.prizes (id, event_id, name, sort_order, quantity, mc_script) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000dd', 'Voucher', 10, 2, 'Sponsored by X'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000dd', 'TV', 20, 1, null);

insert into public.rundown_segments (id, event_id, sort_order, title, planned_start, duration_min, kind, script) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000dd', 10, 'Opening', '2026-12-08 17:00+08', 10, 'normal', 'Selamat sore'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000dd', 20, 'Door prize 1', '2026-12-08 17:10+08', 15, 'door_prize', null),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000dd', 30, 'Closing', '2026-12-08 17:25+08', 5, 'normal', null);
insert into public.segment_prizes (prize_id, segment_id, event_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000dd');

-- one confirmed winner for the voucher
insert into public.draws (event_id, prize_id, slot, winner_guest_id, status, request_id, request_group, round_id) values
  ('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000a1', 1,
   '00000000-0000-0000-0000-000000000001', 'confirmed', gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

-- role 'mc'
select is(public.set_station_pin('00000000-0000-0000-0000-0000000000dd', 'mc', '4321', 'admin') ->> 'status', 'OK', 'mc PIN can be set');
select is(public.set_station_pin('00000000-0000-0000-0000-0000000000dd', 'nope', '1111', 'admin') ->> 'status', 'INVALID_ROLE', 'unknown role refused');

-- mc_state before the show
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') ->> 'phase', 'not_started', 'not started');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') ->> 'current_segment_id', null, 'no current segment');
select is(jsonb_array_length(public.mc_state('00000000-0000-0000-0000-0000000000dd') -> 'segments'), 3, 'three segments');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') #>> '{segments,0,title}', 'Opening', 'show order');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') #>> '{segments,1,prizes,0,name}', 'Voucher', 'segment prizes listed');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') #>> '{segments,1,prizes,0,mc_script}', 'Sponsored by X', 'prize script included');
select is((public.mc_state('00000000-0000-0000-0000-0000000000dd') #>> '{segments,1,prizes,0,remaining}')::int, 1, 'one voucher left');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') #>> '{segments,1,prizes,0,winners,0}', 'Ayu', 'confirmed winner named');
select is(jsonb_array_length(public.mc_state('00000000-0000-0000-0000-0000000000dd') #> '{segments,0,prizes}'), 0, 'normal segment has no prizes');
select ok(public.mc_state('00000000-0000-0000-0000-0000000000dd') ? 'server_now', 'server clock included');

-- start the show
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c2', 'mc') ->> 'status', 'ALREADY_ADVANCED', 'wrong from before start');
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', null, 'mc') ->> 'status', 'OK', 'show started');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') ->> 'phase', 'running', 'running');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') ->> 'current_segment_id', '00000000-0000-0000-0000-0000000000c1', 'first segment current');
select isnt(public.mc_state('00000000-0000-0000-0000-0000000000dd') #>> '{segments,0,started_at}', null, 'start recorded');
select is((select started_by from public.rundown_runs where segment_id = '00000000-0000-0000-0000-0000000000c1'), 'mc', 'actor recorded');
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', null, 'mc') ->> 'status', 'ALREADY_ADVANCED', 'second start tap is harmless');
select is((select count(*)::int from public.rundown_runs where event_id = '00000000-0000-0000-0000-0000000000dd'), 1, 'still one run');

-- NEXT from the right segment
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c1', 'mc') ->> 'status', 'OK', 'next');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') ->> 'current_segment_id', '00000000-0000-0000-0000-0000000000c2', 'second segment current');
select isnt(public.mc_state('00000000-0000-0000-0000-0000000000dd') #>> '{segments,0,ended_at}', null, 'first segment closed');
-- a second device still on segment 1 taps NEXT: nothing changes
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c1', 'mc') ->> 'status', 'ALREADY_ADVANCED', 'stale device refused');
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c1', 'mc') #>> '{state,current_segment_id}', '00000000-0000-0000-0000-0000000000c2', 'refusal returns live state');
select is((select count(*)::int from public.rundown_runs where ended_at is null and event_id = '00000000-0000-0000-0000-0000000000dd'), 1, 'one open run');
select throws_ok($$insert into public.rundown_runs (event_id, segment_id) values ('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c3')$$,
                 '23505', null, 'a second open run is impossible');

-- admin correction
select is(public.mc_set_current('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c1', 'oops', 'admin') ->> 'status', 'REASON_REQUIRED', 'reason required');
select is(public.mc_set_current('00000000-0000-0000-0000-0000000000dd', gen_random_uuid(), 'wrong tap', 'admin') ->> 'status', 'NOT_FOUND', 'unknown segment');
select is(public.mc_set_current('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c2', 'wrong tap', 'admin') ->> 'status', 'ALREADY_CURRENT', 'already current');
select is(public.mc_set_current('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c1', 'wrong tap', 'admin') ->> 'status', 'OK', 'jumped back');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') ->> 'current_segment_id', '00000000-0000-0000-0000-0000000000c1', 'segment 1 current again');
select is((select reason from public.rundown_runs where ended_at is null and event_id = '00000000-0000-0000-0000-0000000000dd'), 'wrong tap', 'reason stored on the run');
select ok(exists (select 1 from public.audit_log where action = 'mc_set_current' and details ->> 'reason' = 'wrong tap'), 'correction audited');

-- run to the end
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c1', 'mc') ->> 'status', 'OK', 'to segment 2');
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c2', 'mc') ->> 'status', 'OK', 'to segment 3');
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-0000000000c3', 'mc') ->> 'status', 'SHOW_ENDED', 'last NEXT ends the show');
select is(public.mc_state('00000000-0000-0000-0000-0000000000dd') ->> 'phase', 'ended', 'ended');
select is(public.mc_next('00000000-0000-0000-0000-0000000000dd', null, 'mc') ->> 'status', 'SHOW_ENDED', 'a stale start tap cannot restart the show');

select ok(not has_function_privilege('anon', 'public.mc_next(uuid,uuid,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.mc_state(uuid)', 'execute'),
  'anon and authenticated cannot execute');

select * from finish();
rollback;
