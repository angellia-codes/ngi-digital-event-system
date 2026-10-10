import assert from 'node:assert/strict';
import { EVENT, pool, q, clean, purge, makeGuests } from './lib.mjs';

const checkIn = async (token, station = 'Meja 1') =>
  (await q(`select public.check_in($1::uuid, $2::text, null, 'scan', $3::text, 'concurrency') as r`, [EVENT, token, station]))[0].r;

// A: 50 parallel check-ins for ONE guest -> exactly one CHECKED_IN
await clean();
const [one] = await makeGuests(1, 'CA');
const resA = await Promise.all(Array.from({ length: 50 }, () => checkIn(one.invite_token)));
assert.equal(resA.filter((r) => r.status === 'CHECKED_IN').length, 1, 'exactly one CHECKED_IN');
assert.equal(resA.filter((r) => r.status === 'ALREADY_CHECKED_IN').length, 49, '49 duplicates');
assert.equal(new Set(resA.map((r) => r.prize_number)).size, 1, 'everyone sees the same number');
console.log('A ok: 50 parallel check-ins for one guest -> 1 CHECKED_IN');

// B: 215 parallel check-ins for different guests -> numbers 1..215, unique, no gaps
await clean();
const many = await makeGuests(215, 'CB');
const resB = await Promise.all(many.map((g, i) => checkIn(g.invite_token, `Meja ${(i % 3) + 1}`)));
assert.ok(resB.every((r) => r.status === 'CHECKED_IN'), 'all 215 checked in');
const nums = resB.map((r) => r.prize_number).sort((a, b) => a - b);
assert.deepEqual(nums, Array.from({ length: 215 }, (_, i) => i + 1), 'numbers are exactly 1..215');
const [{ next_prize_number }] = await q('select next_prize_number from events where id = $1', [EVENT]);
assert.equal(next_prize_number, 216, 'counter ends at 216');
console.log('B ok: 215 parallel check-ins -> numbers 1..215, no gaps');

await purge();
await pool.end();
