-- pgTAP: merchandise T-shirt size, part 3 (admin corrections, stock, guest list, dashboard, reports). Run with `supabase test db`.
begin;
select plan(32);

insert into public.events (id, name, event_date, mode, doors_at)
values ('00000000-0000-0000-0000-0000000000ee', 'T', '2026-12-08', 'rehearsal', now() + interval '30 days');

insert into public.guests (id, event_id, employee_id, full_name, outlet, invite_token, merch_token) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000ee', 'E1', 'Ayu', 'A', 'inviteAAAAAAAAAAAAAAAA', 'merchAAAAAAAAAAAAAAAAA'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000ee', 'E2', 'Budi', 'A', 'inviteBBBBBBBBBBBBBBBB', 'merchBBBBBBBBBBBBBBBBB');
insert into public.guests (id, event_id, employee_id, full_name, outlet, active) values
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000ee', 'E3', 'Citra', 'B', false);

-- admin_set_merch_size
select is(public.admin_set_merch_size('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000001', 'L', 'oops', 'admin') ->> 'status', 'REASON_REQUIRED', 'reason too short');
select is(public.admin_set_merch_size('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000001', 'XS', 'wrong tap', 'admin') ->> 'status', 'INVALID', 'bad size');
select is(public.admin_set_merch_size('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-0000000000ff', 'L', 'wrong tap', 'admin') ->> 'status', 'NOT_FOUND', 'unknown guest');
select is(public.admin_set_merch_size('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000001', 'L', 'asked at the desk', 'admin') ->> 'status', 'OK', 'admin sets the size');
select is((select merch_size_source from public.guests where employee_id = 'E1'), 'admin', 'source admin');
select is(public.set_merch_size('inviteAAAAAAAAAAAAAAAA', 'M') ->> 'status', 'ALREADY_CHOSEN', 'guest cannot change an admin size');

insert into public.check_ins (event_id, guest_id, method, prize_number) values
  ('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000001', 'scan', 1);
do $$ begin
  perform public.redeem_merchandise('00000000-0000-0000-0000-0000000000ee', 'merchAAAAAAAAAAAAAAAAA', null, 'Booth 1', 'merchandise', 'L');
end $$;
select is(public.admin_set_merch_size('00000000-0000-0000-0000-0000000000ee', '00000000-0000-0000-0000-000000000001', 'XL', 'wrong tap', 'admin') ->> 'status', 'ALREADY_REDEEMED', 'blocked while redeemed');

-- set_merch_stock
select is(public.set_merch_stock('00000000-0000-0000-0000-0000000000ee', '{"XS": 3}', 'admin') ->> 'status', 'INVALID', 'unknown size');
select is(public.set_merch_stock('00000000-0000-0000-0000-0000000000ee', '{"L": -1}', 'admin') ->> 'status', 'INVALID', 'negative refused');
select is(public.set_merch_stock('00000000-0000-0000-0000-0000000000ee', '{"L": 2.5}', 'admin') ->> 'status', 'INVALID', 'decimal refused');
select is(public.set_merch_stock('00000000-0000-0000-0000-0000000000ee', '{"L": "10"}', 'admin') ->> 'status', 'INVALID', 'string refused');
select is(public.set_merch_stock('00000000-0000-0000-0000-0000000000ee', '{}', 'admin') ->> 'status', 'INVALID', 'empty refused');
select is(public.set_merch_stock('00000000-0000-0000-0000-0000000000ee', '{"L": 10, "XL": 4}', 'admin') ->> 'status', 'OK', 'stock saved');
select is((select received from public.merch_stock where event_id = '00000000-0000-0000-0000-0000000000ee' and size = 'L'), 10, 'L received');
select is(public.set_merch_stock('00000000-0000-0000-0000-0000000000ee', '{"L": 12}', 'admin') ->> 'status', 'OK', 'second delivery');
select is((select received from public.merch_stock where event_id = '00000000-0000-0000-0000-0000000000ee' and size = 'L'), 12, 'L overwritten with the new total');
select is((select received from public.merch_stock where event_id = '00000000-0000-0000-0000-0000000000ee' and size = 'XL'), 4, 'XL untouched');
select is((select count(*)::int from public.audit_log where event_id = '00000000-0000-0000-0000-0000000000ee' and action = 'merch_stock_set'), 2, 'stock changes audited');

-- guest list and dashboard
select is(public.admin_guest_list('00000000-0000-0000-0000-0000000000ee', null, null) #>> '{guests,0,merch_size}', 'L', 'guest list shows the size');
select is(public.admin_guest_list('00000000-0000-0000-0000-0000000000ee', null, null) #>> '{guests,0,merch_given_size}', 'L', 'guest list shows the size given');
select is(public.admin_dashboard('00000000-0000-0000-0000-0000000000ee') #>> '{merch_size,sizes,2,left}', '11', 'dashboard carries the size summary');
select ok(public.admin_dashboard('00000000-0000-0000-0000-0000000000ee') ? 'beverage', 'dashboard keeps its other parts');

-- reports
select is(jsonb_array_length(public.report_rows('00000000-0000-0000-0000-0000000000ee', 'merch_sizes') -> 'rows'), 2, 'one hand-over row and one not-redeemed row');
select is(public.report_rows('00000000-0000-0000-0000-0000000000ee', 'merch_sizes') #>> '{rows,0,given_size}', 'L', 'hand-over row first');
select is(public.report_rows('00000000-0000-0000-0000-0000000000ee', 'merch_sizes') #>> '{rows,0,substituted}', 'false', 'not substituted');
select is(public.report_rows('00000000-0000-0000-0000-0000000000ee', 'merch_size_pending') #>> '{rows,0,employee_id}', 'E2', 'Budi has no size yet');
select is(public.report_rows('00000000-0000-0000-0000-0000000000ee', 'guests') ->> 'status', 'OK', 'existing reports still work');
select is(public.report_rows('00000000-0000-0000-0000-0000000000ee', 'nope') ->> 'status', 'UNKNOWN_REPORT', 'unknown report');

-- rehearsal reset keeps choices and stock
select is(public.reset_rehearsal_data('00000000-0000-0000-0000-0000000000ee', 'admin') ->> 'status', 'OK', 'reset ok');
select is((select merch_size from public.guests where employee_id = 'E1'), 'L', 'size kept after reset');
select is((select count(*)::int from public.merch_stock where event_id = '00000000-0000-0000-0000-0000000000ee'), 2, 'stock kept after reset');
select ok(not has_function_privilege('anon', 'public.set_merch_stock(uuid,jsonb,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.admin_set_merch_size(uuid,uuid,text,text,text)', 'execute')
      and not has_function_privilege('anon', 'public.report_rows(uuid,text)', 'execute'),
  'anon and authenticated cannot execute');

select * from finish();
rollback;
