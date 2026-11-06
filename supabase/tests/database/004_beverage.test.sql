-- pgTAP: beverage reservation. Run with `supabase test db` against a database that has all migrations applied.
-- now() is fixed for the whole transaction, so deadlines are set relative to it.
begin;
select plan(49);

insert into public.events (id, name, event_date, mode, doors_at)
values ('00000000-0000-0000-0000-0000000000bb', 'T', '2026-12-08', 'rehearsal', now() + interval '30 days');

insert into public.guests (id, event_id, employee_id, full_name, outlet, invite_token, beverage_token) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000bb', 'E1', 'Ayu', 'A', 'inviteAAAAAAAAAAAAAAAA', 'bevAAAAAAAAAAAAAAAAAAA'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000bb', 'E2', 'Budi', 'A', 'inviteBBBBBBBBBBBBBBBB', 'bevBBBBBBBBBBBBBBBBBBB'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000bb', 'E3', 'Citra', 'B', 'inviteCCCCCCCCCCCCCCCC', 'bevCCCCCCCCCCCCCCCCCCC');
insert into public.guests (id, event_id, employee_id, full_name, outlet, active) values
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000bb', 'E4', 'Dewi', 'B', false);

-- get_pass before any choice: no token
select is(public.get_pass('inviteAAAAAAAAAAAAAAAA') #>> '{beverage,token}', null, 'token hidden until a drink is set');
select is(public.get_pass('inviteAAAAAAAAAAAAAAAA') #>> '{beverage,choice}', null, 'no choice yet');

-- set_beverage
select is(public.set_beverage('inviteAAAAAAAAAAAAAAAA', 'wine') ->> 'status', 'INVALID', 'bad choice');
select is(public.set_beverage('nope', 'beer') ->> 'status', 'INVALID', 'bad token');
select is(public.set_beverage('inviteAAAAAAAAAAAAAAAA', 'beer') ->> 'status', 'OK', 'first choice saved');
select is(public.set_beverage('inviteAAAAAAAAAAAAAAAA', 'beer') ->> 'status', 'OK', 'identical repeat is OK');
select is(public.set_beverage('inviteAAAAAAAAAAAAAAAA', 'soft_drink') ->> 'status', 'ALREADY_CHOSEN', 'different drink refused');
select is(public.set_beverage('inviteAAAAAAAAAAAAAAAA', 'soft_drink') ->> 'choice', 'beer', 'returns the saved drink');
select is((select beverage_source from public.guests where employee_id = 'E1'), 'guest', 'source guest');
select is(public.get_pass('inviteAAAAAAAAAAAAAAAA') #>> '{beverage,token}', 'bevAAAAAAAAAAAAAAAAAAA', 'token shown once chosen');

-- effective drink with no deadline: none
select is(public.effective_beverage(null, null, null) ->> 'choice', null, 'no deadline, no choice');
select is(public.effective_beverage(null, null, now() + interval '1 day') ->> 'choice', null, 'deadline ahead, no choice');
select is(public.effective_beverage(null, null, now() - interval '1 second') ->> 'source', 'auto', 'deadline passed gives auto');
select is(public.effective_beverage('beer', 'guest', now() - interval '1 second') ->> 'choice', 'beer', 'stored choice wins');

-- bar lookup / redeem
select is(public.beverage_lookup('00000000-0000-0000-0000-0000000000bb', 'zzzzzzzzzzzzzzzzzzzzzz', null) ->> 'status', 'INVALID', 'unknown token');
select is(public.beverage_lookup('00000000-0000-0000-0000-0000000000bb', null, '00000000-0000-0000-0000-000000000004') ->> 'status', 'NOT_ELIGIBLE', 'inactive guest');
select is(public.beverage_lookup('00000000-0000-0000-0000-0000000000bb', 'bevAAAAAAAAAAAAAAAAAAA', null) ->> 'status', 'NOT_CHECKED_IN', 'needs check-in');
select is(public.redeem_beverage('00000000-0000-0000-0000-0000000000bb', 'bevAAAAAAAAAAAAAAAAAAA', null, 'Bar 1', 'bar') ->> 'status', 'NOT_CHECKED_IN', 'redeem needs check-in');

insert into public.check_ins (event_id, guest_id, method, prize_number) values
  ('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-000000000001', 'scan', 1),
  ('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-000000000002', 'scan', 2);

select is(public.beverage_lookup('00000000-0000-0000-0000-0000000000bb', null, '00000000-0000-0000-0000-000000000002') ->> 'status', 'NO_CHOICE', 'no drink set');
select is(public.redeem_beverage('00000000-0000-0000-0000-0000000000bb', null, '00000000-0000-0000-0000-000000000002', 'Bar 1', 'bar') ->> 'status', 'NO_CHOICE', 'cannot redeem without a drink');
select is(public.beverage_lookup('00000000-0000-0000-0000-0000000000bb', 'bevAAAAAAAAAAAAAAAAAAA', null) ->> 'status', 'READY', 'ready');
select is(public.beverage_lookup('00000000-0000-0000-0000-0000000000bb', 'bevAAAAAAAAAAAAAAAAAAA', null) ->> 'beverage', 'beer', 'lookup shows the drink');
select is((select count(*)::int from public.beverage_redemptions), 0, 'lookup records nothing');
select is(public.redeem_beverage('00000000-0000-0000-0000-0000000000bb', 'bevAAAAAAAAAAAAAAAAAAA', null, 'Bar 1', 'bar') ->> 'status', 'REDEEMED', 'redeemed');
select is(public.redeem_beverage('00000000-0000-0000-0000-0000000000bb', 'bevAAAAAAAAAAAAAAAAAAA', null, 'Bar 1', 'bar') ->> 'replay', 'true', 'same bar double tap is a replay');
select is(public.redeem_beverage('00000000-0000-0000-0000-0000000000bb', 'bevAAAAAAAAAAAAAAAAAAA', null, 'Bar 2', 'bar') ->> 'status', 'ALREADY_REDEEMED', 'other bar refused');
select is((select count(*)::int from public.beverage_redemptions where status = 'redeemed'), 1, 'one active redemption');
select is(public.set_beverage('inviteAAAAAAAAAAAAAAAA', 'soft_drink') ->> 'status', 'ALREADY_CHOSEN', 'no change after redemption');
select is(public.get_pass('inviteAAAAAAAAAAAAAAAA') #>> '{beverage,redeemed}', 'true', 'pass shows redeemed');
select throws_ok($$insert into public.beverage_redemptions (event_id, guest_id, beverage, source, status)
  values ('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-000000000001', 'beer', 'guest', 'redeemed')$$,
  '23505', null, 'unique index blocks a second active redemption');

-- admin_set_beverage
select is(public.admin_set_beverage('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-000000000001', 'soft_drink', 'oops', 'admin') ->> 'status', 'REASON_REQUIRED', 'reason too short');
select is(public.admin_set_beverage('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-000000000001', 'soft_drink', 'wrong tap', 'admin') ->> 'status', 'ALREADY_REDEEMED', 'blocked while redeemed');
select is(public.admin_set_beverage('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-000000000002', 'cola', 'wrong tap', 'admin') ->> 'status', 'INVALID', 'bad choice');
select is(public.admin_set_beverage('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000ff', 'beer', 'wrong tap', 'admin') ->> 'status', 'NOT_FOUND', 'unknown guest');
select is(public.admin_set_beverage('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-000000000002', 'beer', 'asked at the desk', 'admin') ->> 'status', 'OK', 'admin sets drink');
select is((select beverage_source from public.guests where employee_id = 'E2'), 'admin', 'source admin');

-- void
select is(public.void_beverage('00000000-0000-0000-0000-0000000000bb', (select id from public.beverage_redemptions limit 1), 'x', 'admin') ->> 'status', 'REASON_REQUIRED', 'void needs reason');
select is(public.void_beverage('00000000-0000-0000-0000-0000000000bb', gen_random_uuid(), 'bar mistake', 'admin') ->> 'status', 'NOT_FOUND', 'void unknown');
select is(public.void_beverage('00000000-0000-0000-0000-0000000000bb', (select id from public.beverage_redemptions limit 1), 'bar mistake', 'admin') ->> 'status', 'OK', 'voided');
select is(public.beverage_lookup('00000000-0000-0000-0000-0000000000bb', 'bevAAAAAAAAAAAAAAAAAAA', null) ->> 'status', 'READY', 'void lets the QR work again');

-- deadline passed: CLOSED, Citra becomes auto Soft Drink, summary is final
update public.events set beverage_deadline = now() - interval '1 minute' where id = '00000000-0000-0000-0000-0000000000bb';
select is(public.set_beverage('inviteCCCCCCCCCCCCCCCC', 'beer') ->> 'status', 'CLOSED', 'closed after deadline');
select is(public.get_pass('inviteCCCCCCCCCCCCCCCC') #>> '{beverage,source}', 'auto', 'auto soft drink on the pass');
select is((public.beverage_summary('00000000-0000-0000-0000-0000000000bb') ->> 'no_choice')::int, 0, 'nobody left without a drink');
select is((public.beverage_summary('00000000-0000-0000-0000-0000000000bb') ->> 'beer')::int, 2, 'two beers');
select is(public.beverage_summary('00000000-0000-0000-0000-0000000000bb') ->> 'final', 'true', 'final after deadline');

-- set_event_details: deadline must be before doors
select is(public.set_event_details('00000000-0000-0000-0000-0000000000bb',
  jsonb_build_object('beverage_deadline', now() + interval '31 days'), 'admin') ->> 'status', 'INVALID_TIMES', 'deadline after doors refused');

-- reset keeps choices, clears redemptions
select is(public.reset_rehearsal_data('00000000-0000-0000-0000-0000000000bb', 'admin') ->> 'status', 'OK', 'reset ok');
select is((select count(*)::int from public.guests where beverage_choice is not null and event_id = '00000000-0000-0000-0000-0000000000bb'), 2, 'choices kept');

select ok(not has_function_privilege('anon', 'public.set_beverage(text,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.redeem_beverage(uuid,text,uuid,text,text)', 'execute'),
  'anon and authenticated cannot execute');

select * from finish();
rollback;
