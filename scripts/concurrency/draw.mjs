import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EVENT, pool, q, clean, purge, makeGuests } from './lib.mjs';

const one = async (sql, params) => (await q(sql, params))[0].r;
const draw = (prizeId, requestId = randomUUID()) =>
  one(`select public.draw_prize($1::uuid, $2::uuid, $3::uuid, 'concurrency') as r`, [EVENT, prizeId, requestId]);
const resolve = (drawId, outcome) =>
  one(`select public.resolve_draw($1::uuid, $2::uuid, $3::text, 'concurrency') as r`, [EVENT, drawId, outcome]);
const resolveRound = (roundId) => one(`select public.resolve_round($1::uuid, $2::uuid, 'concurrency') as r`, [EVENT, roundId]);

async function prize(name, quantity, batch = false) {
  const [{ id }] = await q(
    `insert into prizes (event_id, name, tier, quantity, draw_as_batch) values ($1, $2, 'minor', $3, $4) returning id`,
    [EVENT, name, quantity, batch],
  );
  return id;
}
async function arrive(n, prefix) {
  const gs = await makeGuests(n, prefix);
  await Promise.all(gs.map((g) => q(`select public.check_in($1::uuid, $2::text, null, 'scan', 'Meja 1', 'concurrency')`, [EVENT, g.invite_token])));
}
async function wipe() {
  await clean();
  await q('delete from prizes where event_id = $1', [EVENT]);
}
const count = (rs, s) => rs.filter((r) => r.status === s).length;

// A: two (here thirty) simultaneous draws with different request ids -> exactly one DRAWN, the rest DRAW_IN_PROGRESS
await wipe();
await arrive(40, 'DA');
const pA = await prize('Prize A', 1);
const resA = await Promise.all(Array.from({ length: 30 }, () => draw(pA)));
assert.equal(count(resA, 'DRAWN'), 1, 'exactly one DRAWN');
assert.equal(count(resA, 'DRAW_IN_PROGRESS'), 29, '29 refused');
const [{ n: liveA }] = await q(`select count(*)::int n from draws where event_id = $1`, [EVENT]);
assert.equal(liveA, 1, 'one draw row');
console.log('A ok: 30 simultaneous draws -> 1 DRAWN, 29 DRAW_IN_PROGRESS');

// B: double-tap with ONE request id -> one draw, everybody sees it
await wipe();
await arrive(40, 'DA');
const pB = await prize('Prize B', 1);
const rid = randomUUID();
const resB = await Promise.all(Array.from({ length: 30 }, () => draw(pB, rid)));
assert.ok(resB.every((r) => r.status === 'DRAWN'), 'all report DRAWN');
assert.equal(resB.filter((r) => r.idempotent === false).length, 1, 'one fresh draw');
assert.equal(new Set(resB.map((r) => r.draws[0].id)).size, 1, 'one draw id');
const [{ n: rowsB }] = await q(`select count(*)::int n from draws where event_id = $1`, [EVENT]);
assert.equal(rowsB, 1, 'one row');
console.log('B ok: 30 taps with one request id -> 1 draw');

// C: confirm and no-show racing on one draw -> a single final state, the loser sees it
const dB = resB[0].draws[0].id;
const racers = await Promise.all([
  ...Array.from({ length: 10 }, () => resolve(dB, 'confirm')),
  ...Array.from({ length: 10 }, () => resolve(dB, 'no_show')),
]);
const [{ status: finalC }] = await q(`select status from draws where id = $1`, [dB]);
assert.ok(['confirmed', 'void_no_show'].includes(finalC), `final state ${finalC}`);
if (finalC === 'confirmed') {
  assert.equal(count(racers, 'CONFIRMED'), 1, 'one CONFIRMED');
  assert.ok(racers.every((r) => ['CONFIRMED', 'ALREADY_CONFIRMED'].includes(r.status)), 'a confirmed draw cannot be voided by the MC');
} else {
  assert.equal(count(racers, 'VOIDED'), 1, 'one VOIDED');
  assert.ok(racers.every((r) => ['VOIDED', 'DRAW_VOID'].includes(r.status)), 'a voided draw cannot be confirmed');
}
console.log(`C ok: confirm vs no-show race -> one final state (${finalC})`);

// D: draw the whole pool through ten single prizes, fired in parallel each round -> nobody wins twice
await wipe();
await arrive(10, 'DB');
const singles = [];
for (let i = 1; i <= 10; i++) singles.push(await prize(`Single ${i}`, 1));
let confirmed = 0;
for (let guard = 0; guard < 60 && confirmed < 10; guard++) {
  const rs = await Promise.all(singles.map((p) => draw(p)));
  const drawn = rs.filter((r) => r.status === 'DRAWN');
  assert.ok(drawn.length <= 1, 'never two unresolved draws');
  for (const r of drawn) {
    await resolve(r.draws[0].id, 'confirm');
    confirmed += 1;
  }
}
assert.equal(confirmed, 10, 'ten prizes drawn');
const [{ n: distinct }] = await q(`select count(distinct winner_guest_id)::int n from draws where event_id = $1 and status = 'confirmed'`, [EVENT]);
assert.equal(distinct, 10, 'ten different winners');
const extra = await prize('Single 11', 1);
assert.equal((await draw(extra)).status, 'NO_ELIGIBLE_GUESTS', 'pool is empty');
console.log('D ok: whole pool drawn, nobody wins twice, empty pool reported');

// E: a no-show goes back into the pool for other prizes
await wipe();
await arrive(1, 'DC');
const pE1 = await prize('E1', 1);
const pE2 = await prize('E2', 1);
const e1 = await draw(pE1);
await resolve(e1.draws[0].id, 'no_show');
const e2 = await draw(pE2);
assert.equal(e2.status, 'DRAWN', 'the no-show can win a different prize');
assert.equal(e2.draws[0].number, e1.draws[0].number, 'same person');
assert.equal((await draw(pE1)).status, 'DRAW_IN_PROGRESS', 'but only after the open draw is resolved');
await resolve(e2.draws[0].id, 'confirm');
assert.equal((await draw(pE1)).status, 'NO_ELIGIBLE_GUESTS', 'and a confirmed winner is out of the pool');
console.log('E ok: a no-show stays eligible for other prizes');

// F: 215 present, batches larger than the pool -> short_by, everybody drawn once
await wipe();
await arrive(215, 'DA');
const b1 = await prize('Batch 1', 100, true);
const b2 = await prize('Batch 2', 100, true);
const b3 = await prize('Batch 3', 40, true);
const f1 = await draw(b1);
assert.equal(f1.draws.length, 100, 'first batch draws 100');
assert.equal((await resolveRound(f1.round_id)).confirmed, 100, 'confirm all 100');
const f2 = await draw(b2);
assert.equal(f2.draws.length, 100, 'second batch draws 100');
await resolveRound(f2.round_id);
const f3 = await draw(b3);
assert.equal(f3.status, 'DRAWN');
assert.equal(f3.draws.length, 15, 'only 15 people are left');
assert.equal(f3.short_by, 25, 'short by 25');
await resolveRound(f3.round_id);
const [{ n: winners, d: distinctF }] = await q(
  `select count(*)::int n, count(distinct winner_guest_id)::int d from draws where event_id = $1 and status = 'confirmed'`, [EVENT]);
assert.equal(winners, 215, '215 confirmed draws');
assert.equal(distinctF, 215, 'every guest won exactly once');
assert.equal((await draw(b3)).status, 'NO_ELIGIBLE_GUESTS', 'nobody left');
console.log('F ok: 215 guests, three batches, short_by 25, nobody won twice');

await wipe();
await purge();
await pool.end();
