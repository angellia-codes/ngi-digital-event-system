begin;
select * from no_plan();

insert into events (id, name, event_date) values ('00000000-0000-4000-8000-0000000000bb', 'Test', '2026-12-10');
insert into guests (id, event_id, employee_id, full_name, outlet, department) values
 ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000bb', 'E1', 'Guest One', 'Outlet A', 'FOH'),
 ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000bb', 'E2', 'Guest Two', 'Outlet B', null),
 ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000bb', 'E3', 'Guest Three', 'Outlet C', 'BOH');
insert into check_ins (event_id, guest_id, method, prize_number) values
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000b1', 'manual', 1),
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000b2', 'manual', 2),
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000b3', 'manual', 3);
insert into prizes (id, event_id, name, tier, quantity, draw_as_batch) values
 ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000bb', 'Grand Prize', 'grand', 1, false),
 ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000bb', 'Vouchers', 'minor', 3, true);

-- get_stage
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'phase', 'idle', 'a new event is idle');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'rev', '0', 'revision 0');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'options'->>'language', 'en', 'default language');
select is(get_stage(gen_random_uuid())->>'phase', 'idle', 'an unknown event reads as idle');

-- stage_write bumps the revision
select stage_write('00000000-0000-4000-8000-0000000000bb', 'idle', '{}'::jsonb);
select stage_write('00000000-0000-4000-8000-0000000000bb', 'idle', '{}'::jsonb);
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'rev', '2', 'every write bumps rev');

-- payload: rolling shows the number only
insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id, status) values
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c2', 1, '00000000-0000-4000-8000-0000000000b1',
  '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'drawn'),
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c2', 2, '00000000-0000-4000-8000-0000000000b2',
  '00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'drawn');
select stage_publish('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'phase', 'rolling', 'phase is rolling while slots are unresolved');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'rev', '3', 'publish bumps rev');
select is(jsonb_array_length(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'), 2, 'two slots on stage');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'->0->>'number', '1', 'slot 1 shows its Door Prize number');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'prize'->>'name', 'Vouchers', 'prize name on stage');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')::text ~* '(Guest One|Guest Two|Outlet A|Outlet B|FOH)', false, 'NO name, outlet or department before confirmation');

-- one slot confirmed: its name appears, the other still has none; phase stays rolling
update draws set status = 'confirmed' where request_id = '00000000-0000-4000-8000-0000000000f1';
select stage_publish('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'->0->>'name', 'Guest One', 'confirmed slot shows the name');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'->0->>'outlet', 'Outlet A', 'and the outlet');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'->0->>'department', 'FOH', 'and the department');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'->1->>'name', null, 'the unresolved slot has no name');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')::text ~* 'Guest Two', false, 'the unresolved winner is not in the payload at all');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'phase', 'rolling', 'phase stays rolling while any slot is unresolved');

-- the other slot is a no-show: phase void
update draws set status = 'void_no_show' where request_id = '00000000-0000-4000-8000-0000000000f2';
select stage_publish('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'phase', 'void', 'phase is void');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'->1->>'state', 'void', 'void slot state');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')::text ~* 'Guest Two', false, 'a no-show is never named');

-- a redraw in the same round replaces the voided slot (latest row wins)
insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id, status) values
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c2', 2, '00000000-0000-4000-8000-0000000000b3',
  '00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000a1', 'confirmed');
select stage_publish('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000a1');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'phase', 'revealed', 'all slots resolved: revealed');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'->1->>'name', 'Guest Three', 'the redraw replaced the void slot');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'->1->>'department', 'BOH', 'department of the redraw winner');

-- an unknown round publishes idle
select stage_publish('00000000-0000-4000-8000-0000000000bb', gen_random_uuid());
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'phase', 'idle', 'unknown round resets the stage');

-- set_stage
select is(set_stage('00000000-0000-4000-8000-0000000000bb', 'rolling', null, 'draw')->>'status', 'INVALID_PHASE', 'the MC cannot set arbitrary phases');
select is(set_stage('00000000-0000-4000-8000-0000000000bb', 'intro', gen_random_uuid(), 'draw')->>'status', 'PRIZE_NOT_FOUND', 'unknown prize');
select is(set_stage('00000000-0000-4000-8000-0000000000bb', 'intro', '00000000-0000-4000-8000-0000000000c1', 'draw')->>'status', 'OK', 'show a prize banner');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'phase', 'intro', 'phase intro');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'prize'->>'name', 'Grand Prize', 'banner shows the prize');
select is(jsonb_array_length(get_stage('00000000-0000-4000-8000-0000000000bb')->'payload'->'slots'), 0, 'intro has no slots');
select is(set_stage('00000000-0000-4000-8000-0000000000bb', 'idle', null, 'draw')->>'status', 'OK', 'blank the screen');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->>'phase', 'idle', 'phase idle');
insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id, status) values
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000c1', 1, '00000000-0000-4000-8000-0000000000b2',
  gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'drawn');
select is(set_stage('00000000-0000-4000-8000-0000000000bb', 'idle', null, 'draw')->>'status', 'DRAW_IN_PROGRESS', 'cannot blank the screen over an unresolved draw');
delete from draws where status = 'drawn';

-- options
select is(set_stage_options('00000000-0000-4000-8000-0000000000bb', '{"safe_mode":true}'::jsonb, 'hr@example.com')->>'status', 'OK', 'set safe mode');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'options'->>'safe_mode', 'true', 'safe mode on');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'options'->>'language', 'en', 'other options kept');
select is(set_stage_options('00000000-0000-4000-8000-0000000000bb', '{"language":"id","reduce_effects":true}'::jsonb, 'hr@example.com')->>'status', 'OK', 'set two options');
select is(get_stage('00000000-0000-4000-8000-0000000000bb')->'options'->>'language', 'id', 'language changed');
select is(set_stage_options('00000000-0000-4000-8000-0000000000bb', '{"language":"fr"}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'unknown language refused');
select is(set_stage_options('00000000-0000-4000-8000-0000000000bb', '{"safe_mode":"yes"}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'non-boolean refused');
select is(set_stage_options('00000000-0000-4000-8000-0000000000bb', '{"payload":{}}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'unknown option refused');
select is(set_stage_options('00000000-0000-4000-8000-0000000000bb', '{}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'empty options refused');

-- heartbeat
select is(stage_heartbeat_age('00000000-0000-4000-8000-0000000000bb'), null, 'no heartbeat yet');
select touch_stage_heartbeat('00000000-0000-4000-8000-0000000000bb');
select ok(stage_heartbeat_age('00000000-0000-4000-8000-0000000000bb') between 0 and 2, 'fresh heartbeat');
update stage_heartbeat set seen_at = now() - interval '40 seconds';
select ok(stage_heartbeat_age('00000000-0000-4000-8000-0000000000bb') >= 40, 'age grows');

-- stage key
select is(verify_stage_key('00000000-0000-4000-8000-0000000000bb', 'whatever', 'ip1')->>'status', 'NOT_SET', 'no key set yet');
select is(set_stage_key('00000000-0000-4000-8000-0000000000bb', 'short', 'hr@example.com')->>'status', 'INVALID_KEY', 'short key refused');
select is(set_stage_key('00000000-0000-4000-8000-0000000000bb', 'has spaces in it 12345', 'hr@example.com')->>'status', 'INVALID_KEY', 'unsafe characters refused');
select is(set_stage_key('00000000-0000-4000-8000-0000000000bb', 'Abcdefghijklmnop12345678', 'hr@example.com')->>'status', 'OK', 'set a key');
select is(verify_stage_key('00000000-0000-4000-8000-0000000000bb', 'Abcdefghijklmnop12345678', 'ip1')->>'status', 'OK', 'right key');
select is(length(verify_stage_key('00000000-0000-4000-8000-0000000000bb', 'Abcdefghijklmnop12345678', 'ip1')->>'tag'), 12, 'tag is 12 characters');
select is(verify_stage_key('00000000-0000-4000-8000-0000000000bb', 'Abcdefghijklmnop1234567X', 'ip1')->>'status', 'INVALID', 'wrong key');
select is(verify_stage_key('00000000-0000-4000-8000-0000000000bb', null, 'ip1')->>'status', 'INVALID', 'null key');
create temp table tag1 as select stage_key_tag('00000000-0000-4000-8000-0000000000bb') as t;
select set_stage_key('00000000-0000-4000-8000-0000000000bb', 'Zyxwvutsrqponmlk98765432', 'hr@example.com');
select isnt(stage_key_tag('00000000-0000-4000-8000-0000000000bb'), (select t from tag1), 'rotating the key changes the tag');
select is(verify_stage_key('00000000-0000-4000-8000-0000000000bb', 'Abcdefghijklmnop12345678', 'ip1')->>'status', 'INVALID', 'the old key stops working');
insert into auth_attempts (scope, key, success) select 'stage_ip', 'ip2', false from generate_series(1, 20);
select is(verify_stage_key('00000000-0000-4000-8000-0000000000bb', 'Zyxwvutsrqponmlk98765432', 'ip2')->>'status', 'LOCKED', 'an IP is locked after 20 failures');
select is(verify_stage_key('00000000-0000-4000-8000-0000000000bb', 'Zyxwvutsrqponmlk98765432', 'ip3')->>'status', 'OK', 'other IPs are unaffected');
select is((select count(*)::int from audit_log where action = 'set_stage_key' and details::text like '%Abcdef%'), 0, 'the key is never written to the audit log');

select * from finish();
rollback;
