-- pgTAP: merchandise T-shirt size, part 2 (booth lookup, redeem with given size, stock summary). Run with `supabase test db`.
begin;
select plan(28);

insert into public.events (id, name, event_date, mode, doors_at)
values ('00000000-0000-0000-0000-0000000000dd', 'T', '2026-12-08', 'rehearsal', now() + interval '30 days');

insert into public.guests (id, event_id, employee_id, full_name, outlet, invite_token, merch_token) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000dd', 'E1', 'Ayu', 'A', 'inviteAAAAAAAAAAAAAAAA', 'merchAAAAAAAAAAAAAAAAA'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000dd', 'E2', 'Budi', 'A', 'inviteBBBBBBBBBBBBBBBB', 'merchBBBBBBBBBBBBBBBBB'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000dd', 'E3', 'Citra', 'B', 'inviteCCCCCCCCCCCCCCCC', 'merchCCCCCCCCCCCCCCCCC');

do $$ begin
  perform public.set_merch_size('inviteAAAAAAAAAAAAAAAA', 'L');
  perform public.set_merch_size('inviteCCCCCCCCCCCCCCCC', 'L');
end $$;
insert into public.check_ins (event_id, guest_id, method, prize_number) values
  ('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-000000000001', 'scan', 1),
  ('00000000-0000-0000-0000-0000000000dd', '00000000-0000-0000-0000-000000000002', 'scan', 2);

-- lookup
select is(public.redeem_lookup('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null) ->> 'status', 'READY', 'ready');
select is(public.redeem_lookup('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null) ->> 'size', 'L', 'lookup shows the reserved size');
select is(public.redeem_lookup('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null) ->> 'size_source', 'guest', 'lookup shows the source');
select is(public.redeem_lookup('00000000-0000-0000-0000-0000000000dd', null, '00000000-0000-0000-0000-000000000002') ->> 'size', null, 'no size yet');
select is(public.redeem_lookup('00000000-0000-0000-0000-0000000000dd', 'merchCCCCCCCCCCCCCCCCC', null) ->> 'status', 'NOT_CHECKED_IN', 'still needs check-in');

-- redeem
select is(public.redeem_merchandise('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null, 'Booth 1', 'merchandise', null) ->> 'status', 'INVALID_SIZE', 'given size required');
select is(public.redeem_merchandise('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null, 'Booth 1', 'merchandise', 'XS') ->> 'status', 'INVALID_SIZE', 'given size must be S to XXL');
select is(public.redeem_merchandise('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null, 'Booth 1', 'merchandise', 'XL') ->> 'status', 'REDEEMED', 'redeemed with a substitute');
select is((select reserved_size || '>' || given_size from public.merchandise_redemptions where guest_id = '00000000-0000-0000-0000-000000000001'), 'L>XL', 'reserved and given recorded');
select is((select reserved_source from public.merchandise_redemptions where guest_id = '00000000-0000-0000-0000-000000000001'), 'guest', 'reserved source recorded');
select is(public.redeem_merchandise('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null, 'Booth 1', 'merchandise', 'XL') ->> 'replay', 'true', 'same booth double tap is a replay');
select is(public.redeem_lookup('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null) ->> 'status', 'ALREADY_REDEEMED', 'already redeemed');
select is(public.redeem_lookup('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null) ->> 'given_size', 'XL', 'already redeemed shows the size given');
select is(public.get_pass('inviteAAAAAAAAAAAAAAAA') -> 'merch_size', '{"size": "L", "source": "guest", "given_size": "XL"}'::jsonb, 'pass shows reserved and given');
select is(public.set_merch_size('inviteAAAAAAAAAAAAAAAA', 'S') ->> 'status', 'ALREADY_CHOSEN', 'no change after the hand-over');
select is(public.redeem_merchandise('00000000-0000-0000-0000-0000000000dd', null, '00000000-0000-0000-0000-000000000002', 'Booth 1', 'merchandise', 'M') ->> 'status', 'REDEEMED', 'guest with no size gets what was handed over');
select is((select reserved_size from public.merchandise_redemptions where guest_id = '00000000-0000-0000-0000-000000000002'), null, 'no reserved size recorded');

-- summary before and after stock is entered
select is(public.merch_size_summary('00000000-0000-0000-0000-0000000000dd') ->> 'stock_set', 'false', 'no stock entered yet');
insert into public.merch_stock (event_id, size, received) values
  ('00000000-0000-0000-0000-0000000000dd', 'L', 3), ('00000000-0000-0000-0000-0000000000dd', 'XL', 5);
select is(public.merch_size_summary('00000000-0000-0000-0000-0000000000dd') #>> '{sizes,3,given}', '1', 'one XL handed over');
select is(public.merch_size_summary('00000000-0000-0000-0000-0000000000dd') #>> '{sizes,3,left}', '4', 'four XL left');
select is(public.merch_size_summary('00000000-0000-0000-0000-0000000000dd') #>> '{sizes,2,reserved}', '2', 'two L reserved');
select is(public.merch_size_summary('00000000-0000-0000-0000-0000000000dd') #>> '{sizes,2,to_claim}', '1', 'one L still to claim');
select is(public.merch_size_summary('00000000-0000-0000-0000-0000000000dd') ->> 'no_size', '1', 'one guest without a reserved size');

-- void returns the shirt to stock and lets the QR work again
select is(public.void_redemption('00000000-0000-0000-0000-0000000000dd',
  (select id from public.merchandise_redemptions where guest_id = '00000000-0000-0000-0000-000000000001'), 'wrong size swap', 'admin') ->> 'status', 'OK', 'voided');
select is(public.merch_size_summary('00000000-0000-0000-0000-0000000000dd') #>> '{sizes,3,left}', '5', 'void returns the XL to stock');
select is(public.redeem_merchandise('00000000-0000-0000-0000-0000000000dd', 'merchAAAAAAAAAAAAAAAAA', null, 'Booth 2', 'merchandise', 'L') ->> 'status', 'REDEEMED', 'can redeem again after a void');

select hasnt_function('public', 'redeem_merchandise', array['uuid', 'text', 'uuid', 'text', 'text'], 'old five-argument redeem is gone');
select ok(not has_function_privilege('anon', 'public.redeem_merchandise(uuid,text,uuid,text,text,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.merch_size_summary(uuid)', 'execute'),
  'anon and authenticated cannot execute');

select * from finish();
rollback;
