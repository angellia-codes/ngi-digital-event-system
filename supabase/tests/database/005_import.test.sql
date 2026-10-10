begin;
select * from no_plan();

insert into events (id, name, event_date) values ('00000000-0000-4000-8000-0000000000aa', 'Test', '2026-12-10');

-- clean import
select is(import_guests('00000000-0000-4000-8000-0000000000aa',
  '[{"row_no":2,"employee_id":" E1 ","full_name":" Kadek Ayu ","outlet":"Outlet A","department":"FOH","position":"Server","phone":"+6281234567890"},
    {"row_no":3,"employee_id":"E2","full_name":"Made Putra","outlet":"Outlet B"},
    {"row_no":4,"employee_id":"E3","full_name":"Wayan Sari","outlet":"Outlet B","phone":""}]'::jsonb,
  'first.csv', 'admin@example.com')->>'inserted', '3', 'three guests inserted');
select is((select count(*)::int from guests), 3, 'three guest rows');
select is((select employee_id from guests where full_name = 'Kadek Ayu'), 'E1', 'text is trimmed');
select is((select phone from guests where employee_id = 'E3'), null, 'blank phone becomes null');
select is((select count(distinct invite_token)::int from guests), 3, 'each guest has its own invite token');
select is((select count(*)::int from import_batches), 1, 'one import batch recorded');

-- re-import: updates, never changes tokens
create temp table tok as select employee_id, invite_token, merch_token from guests;
select is(import_guests('00000000-0000-4000-8000-0000000000aa',
  '[{"row_no":2,"employee_id":"E1","full_name":"Kadek Ayu Lestari","outlet":"Outlet A"},
    {"row_no":3,"employee_id":"E2","full_name":"Made Putra","outlet":"Outlet B"}]'::jsonb,
  'second.csv', 'admin@example.com')->>'updated', '2', 'two guests updated');
select is((select count(*)::int from guests g join tok t using (employee_id, invite_token, merch_token)), 3, 'tokens are unchanged by a re-import');
select is((select full_name from guests where employee_id = 'E1'), 'Kadek Ayu Lestari', 'details are updated');
select is((select flagged_missing from guests where employee_id = 'E3'), true, 'a guest missing from the new file is flagged');
select is((select active from guests where employee_id = 'E3'), true, 'but not deactivated');

-- walk-ins are never flagged
insert into guests (event_id, employee_id, full_name, outlet, is_walk_in)
values ('00000000-0000-4000-8000-0000000000aa', 'WALKIN-1', 'Walk In', 'Outlet A', true);
select is(import_guests('00000000-0000-4000-8000-0000000000aa',
  '[{"row_no":2,"employee_id":"E1","full_name":"Kadek Ayu Lestari","outlet":"Outlet A"},
    {"row_no":3,"employee_id":"E2","full_name":"Made Putra","outlet":"Outlet B"},
    {"row_no":4,"employee_id":"E3","full_name":"Wayan Sari","outlet":"Outlet B"}]'::jsonb,
  'third.csv', 'admin@example.com')->>'flagged_missing', '0', 'nobody missing; walk-ins are not flagged');
select is((select flagged_missing from guests where employee_id = 'E3'), false, 'flag clears when the guest returns');
select is((select flagged_missing from guests where employee_id = 'WALKIN-1'), false, 'walk-in stays unflagged');

-- errors: nothing is written
select is(import_guests('00000000-0000-4000-8000-0000000000aa',
  '[{"row_no":2,"employee_id":"E9","full_name":"Good Row","outlet":"Outlet A"},
    {"row_no":3,"employee_id":"E10","full_name":"No Outlet","outlet":""}]'::jsonb,
  'bad.csv', 'admin@example.com')->>'status', 'HAS_ERRORS', 'a bad row fails the whole file');
select is((select count(*)::int from guests where employee_id in ('E9', 'E10')), 0, 'nothing from a failed file is written');
select is((select count(*)::int from import_batches), 3, 'no batch row for a failed file');
select is(import_guests('00000000-0000-4000-8000-0000000000aa',
  '[{"row_no":2,"employee_id":"E9","full_name":"A","outlet":"O"},{"row_no":5,"employee_id":"E9","full_name":"B","outlet":"O"}]'::jsonb,
  'dup.csv', 'admin@example.com')->'errors'->0->>'code', 'DUPLICATE_IN_FILE', 'duplicate ids in a file are reported');
select is(jsonb_array_length(import_errors('[{"row_no":2,"employee_id":"E9","full_name":"A","outlet":"O"},{"row_no":5,"employee_id":"E9","full_name":"B","outlet":"O"}]'::jsonb)), 2, 'both duplicate rows are reported');
select is(import_errors('[{"row_no":7,"employee_id":"","full_name":"A","outlet":"O"}]'::jsonb)->0->>'row', '7', 'errors carry the CSV row number');
select is(import_errors('[{"employee_id":"","full_name":"A","outlet":"O"}]'::jsonb)->0->>'row', '1', 'without row_no the array position is used');
select is(import_errors(jsonb_build_array(jsonb_build_object('employee_id', repeat('x', 41), 'full_name', 'A', 'outlet', 'O')))->0->>'code', 'TOO_LONG', 'overlong id is refused');

-- preview
select is(import_preview('00000000-0000-4000-8000-0000000000aa',
  '[{"row_no":2,"employee_id":"E1","full_name":"Kadek","outlet":"A"},{"row_no":3,"employee_id":"E50","full_name":"New Person","outlet":"A"}]'::jsonb)->>'would_insert', '1', 'preview counts inserts');
select is(import_preview('00000000-0000-4000-8000-0000000000aa',
  '[{"row_no":2,"employee_id":"E1","full_name":"Kadek","outlet":"A"},{"row_no":3,"employee_id":"E50","full_name":"New Person","outlet":"A"}]'::jsonb)->>'would_update', '1', 'preview counts updates');
select is(import_preview('00000000-0000-4000-8000-0000000000aa',
  '[{"row_no":2,"employee_id":"E1","full_name":"Kadek","outlet":"A"}]'::jsonb)->>'missing_count', '2', 'preview counts guests missing from the file (E2, E3; walk-in excluded)');
select is(import_preview('00000000-0000-4000-8000-0000000000aa', '[{"employee_id":"","full_name":"A","outlet":"O"}]'::jsonb)->>'status', 'HAS_ERRORS', 'preview reports errors');
select is((select count(*)::int from guests where employee_id = 'E50'), 0, 'preview writes nothing');

select * from finish();
rollback;
