import assert from 'node:assert/strict';
import { EVENT, pool, q, clean, purge, makeGuests } from './lib.mjs';

const checkIn = (token) =>
  q(`select public.check_in($1::uuid, $2::text, null, 'scan', 'Meja 1', 'concurrency') as r`, [EVENT, token]);
const redeem = async (token, station) =>
  (await q(`select public.redeem_merchandise($1::uuid, $2::text, null, $3::text, 'concurrency') as r`, [EVENT, token, station]))[0].r;

// A: two stations redeem one guest at the same moment -> 1 REDEEMED, 1 ALREADY_REDEEMED
await clean();
const [g] = await makeGuests(1, 'MA');
await checkIn(g.invite_token);
const resA = await Promise.all([redeem(g.merch_token, 'Booth 1'), redeem(g.merch_token, 'Booth 2')]);
assert.deepEqual(resA.map((r) => r.status).sort(), ['ALREADY_REDEEMED', 'REDEEMED']);
console.log('A ok: two stations, one guest -> 1 REDEEMED, 1 ALREADY_REDEEMED');

// B: 20 taps from ONE station for one guest -> all report REDEEMED, only one row exists
await clean();
const [h] = await makeGuests(1, 'MB');
await checkIn(h.invite_token);
const resB = await Promise.all(Array.from({ length: 20 }, () => redeem(h.merch_token, 'Booth 1')));
assert.ok(resB.every((r) => r.status === 'REDEEMED'));
const [{ n }] = await q(`select count(*)::int as n from merchandise_redemptions where status = 'redeemed' and guest_id = $1`, [h.id]);
assert.equal(n, 1);
console.log('B ok: 20 taps from one station -> 1 redemption row');

await purge();
await pool.end();
