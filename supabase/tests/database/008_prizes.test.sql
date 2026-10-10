begin;
select * from no_plan();

insert into events (id, name, event_date) values ('00000000-0000-4000-8000-0000000000bb', 'Test', '2026-12-10');
insert into guests (id, event_id, employee_id, full_name, outlet) values
 ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000bb', 'E1', 'Guest One', 'Outlet A');
insert into check_ins (event_id, guest_id, method, prize_number) values
 ('00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000b1', 'manual', 1);

select is(actor_type_of('draw'), 'station', 'a role is a station actor');
select is(actor_type_of('hr@example.com'), 'admin', 'an email is an admin actor');
select is(actor_type_of(null), 'station', 'null is treated as a station actor');

-- create
create temp table made as
  select admin_save_prize('00000000-0000-4000-8000-0000000000bb', null,
                          '{"name":" Grand Prize ","tier":"grand","quantity":1}'::jsonb, 'hr@example.com') as r;
select is((select r->>'status' from made), 'OK', 'create a prize');
select is((select name from prizes where id = (select (r->>'id')::uuid from made)), 'Grand Prize', 'name is trimmed');
select is((select sort_order from prizes where id = (select (r->>'id')::uuid from made)), 10, 'first prize gets sort order 10');
select is((select (admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, '{"name":"Voucher","quantity":10,"draw_as_batch":true}'::jsonb, 'hr@example.com'))->>'status'), 'OK', 'create a batch prize');
select is((select sort_order from prizes where name = 'Voucher'), 20, 'next prize gets sort order 20');
select is((select draw_as_batch from prizes where name = 'Voucher'), true, 'batch flag stored');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, '{"name":"Grand Prize"}'::jsonb, 'hr@example.com')->>'status', 'NAME_IN_USE', 'duplicate name refused');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, '{"name":""}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'empty name refused');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, '{"tier":"x"}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'name required on create');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, '{"name":"Q","quantity":0}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'quantity 0 refused');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, '{"name":"Q","quantity":501}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'quantity 501 refused');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, '{"name":"Q","quantity":"many"}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'non-numeric quantity refused');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, '{"name":"Q","draw_as_batch":"yes"}'::jsonb, 'hr@example.com')->>'status', 'INVALID', 'non-boolean batch flag refused');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, to_jsonb(repeat('x', 81))::jsonb, 'hr@example.com')->>'status', 'INVALID', 'non-object data refused');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', null, jsonb_build_object('name', repeat('x', 81)), 'hr@example.com')->>'status', 'INVALID', 'name over 80 characters refused');

-- update
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', (select (r->>'id')::uuid from made), '{"tier":"major","sort_order":5}'::jsonb, 'hr@example.com')->>'status', 'OK', 'update tier and order');
select is((select tier from prizes where name = 'Grand Prize'), 'major', 'tier changed');
select is((select quantity from prizes where name = 'Grand Prize'), 1, 'untouched fields stay');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', (select (r->>'id')::uuid from made), '{"tier":null}'::jsonb, 'hr@example.com')->>'status', 'OK', 'clear the tier');
select is((select tier from prizes where name = 'Grand Prize'), null, 'tier cleared');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', gen_random_uuid(), '{"name":"X"}'::jsonb, 'hr@example.com')->>'status', 'NOT_FOUND', 'unknown prize');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', (select (r->>'id')::uuid from made), '{"name":"Voucher"}'::jsonb, 'hr@example.com')->>'status', 'NAME_IN_USE', 'rename onto an existing name refused');

-- locks once drawn
insert into draws (event_id, prize_id, slot, winner_guest_id, request_id, request_group, round_id, status)
select '00000000-0000-4000-8000-0000000000bb', id, 4, '00000000-0000-4000-8000-0000000000b1', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'confirmed'
  from prizes where name = 'Voucher';
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', (select id from prizes where name = 'Voucher'), '{"quantity":3}'::jsonb, 'hr@example.com')->>'status', 'QUANTITY_TOO_LOW', 'cannot shrink below a drawn slot');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', (select id from prizes where name = 'Voucher'), '{"quantity":4}'::jsonb, 'hr@example.com')->>'status', 'OK', 'can shrink down to the drawn slot');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', (select id from prizes where name = 'Voucher'), '{"draw_as_batch":false}'::jsonb, 'hr@example.com')->>'status', 'LOCKED_BY_DRAWS', 'batch flag locked after a draw');
select is(admin_save_prize('00000000-0000-4000-8000-0000000000bb', (select id from prizes where name = 'Voucher'), '{"draw_as_batch":true,"name":"Voucher 100k"}'::jsonb, 'hr@example.com')->>'status', 'OK', 'same batch flag and a rename are fine after a draw');

-- delete
select is(admin_delete_prize('00000000-0000-4000-8000-0000000000bb', (select id from prizes where name = 'Voucher 100k'), 'hr@example.com')->>'status', 'HAS_DRAWS', 'cannot delete a drawn prize');
select is(admin_delete_prize('00000000-0000-4000-8000-0000000000bb', (select id from prizes where name = 'Grand Prize'), 'hr@example.com')->>'status', 'OK', 'delete an unused prize');
select is(admin_delete_prize('00000000-0000-4000-8000-0000000000bb', gen_random_uuid(), 'hr@example.com')->>'status', 'NOT_FOUND', 'unknown prize');

-- list
select is(jsonb_array_length(prize_list('00000000-0000-4000-8000-0000000000bb')->'prizes'), 1, 'list shows the remaining prize');
select is(prize_list('00000000-0000-4000-8000-0000000000bb')->'prizes'->0->>'confirmed', '1', 'list: confirmed count');
select is(prize_list('00000000-0000-4000-8000-0000000000bb')->'prizes'->0->>'remaining', '3', 'list: remaining slots');
select is(prize_list('00000000-0000-4000-8000-0000000000bb')->'prizes'->0->>'has_draws', 'true', 'list: has_draws');
select is((select count(*)::int from audit_log where action = 'prize_created'), 2, 'creates are audited');
select is((select actor_type from audit_log where action = 'prize_created' limit 1), 'admin', 'audit shows an admin actor');

select * from finish();
rollback;
