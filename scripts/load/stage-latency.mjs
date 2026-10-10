// Usage: node --env-file=.env.test scripts/load/stage-latency.mjs
// Spec: a draw and a confirm reach the projector quickly. Measures database call -> Realtime event on the anon key.
// Run on STAGING (and again at the venue on Rehearsal 2 day). Needs the fake guests (seed-fake-guests.mjs).
// WARNING: resets rehearsal data and adds, then removes, a test prize. Refuses to run on a live event.
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { finish, percentile } from './util.mjs';

const EVENT = process.env.EVENT_ID;
const N = 8;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

const reset = await q("select public.reset_rehearsal_data($1, 'latency') as r", [EVENT]);
if (reset[0].r.status !== 'OK') { console.error('Event is not in rehearsal mode. Aborting.'); process.exit(2); }
const guests = await q("select invite_token from guests where event_id = $1 and employee_id like 'L%' order by employee_id limit $2", [EVENT, N + 4]);
if (guests.length < N + 4) { console.error(`Seed first: need ${N + 4} fake guests.`); process.exit(2); }
for (const g of guests) await q("select public.check_in($1, $2, null, 'scan', 'Latency', 'latency')", [EVENT, g.invite_token]);
const prize = (await q("select public.admin_save_prize($1, null, $2::jsonb, 'latency') as r", [EVENT, JSON.stringify({ name: 'Latency test', quantity: N })]))[0].r;
if (prize.status !== 'OK') { console.error('Could not create the test prize', prize); process.exit(2); }

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const waiters = [];
const channel = sb.channel('latency').on('postgres_changes', { event: '*', schema: 'public', table: 'stage_state', filter: `event_id=eq.${EVENT}` }, (p) => {
  for (const w of [...waiters]) {
    if (w.test(p.new)) { waiters.splice(waiters.indexOf(w), 1); w.done(performance.now()); }
  }
});
await new Promise((resolve, reject) => {
  channel.subscribe((s) => {
    if (s === 'SUBSCRIBED') resolve();
    if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') reject(new Error(`Realtime ${s}`));
  });
});
const nextEvent = (test, ms = 10_000) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    waiters.push({ test, done: (at) => { clearTimeout(timer); resolve(at); } });
  });

const drawMs = [];
const confirmMs = [];
let lost = 0;
try {
  for (let i = 0; i < N; i++) {
    const rolling = nextEvent((row) => row.phase === 'rolling');
    const t0 = performance.now();
    const [{ r: drawn }] = await q('select public.draw_prize($1, $2, $3, $4) as r', [EVENT, prize.id, randomUUID(), 'latency']);
    const seenDraw = await rolling;
    if (drawn.status !== 'DRAWN' || seenDraw === null) { lost++; continue; }
    drawMs.push(seenDraw - t0);

    const revealed = nextEvent((row) => row.phase === 'revealed');
    const t1 = performance.now();
    await q("select public.resolve_draw($1, $2, 'confirm', 'latency') as r", [EVENT, drawn.draws[0].id]);
    const seenConfirm = await revealed;
    if (seenConfirm === null) { lost++; continue; }
    confirmMs.push(seenConfirm - t1);
  }
} finally {
  await sb.removeChannel(channel);
  await q("select public.reset_rehearsal_data($1, 'latency')", [EVENT]);
  await q('delete from prizes where id = $1', [prize.id]);
  await pool.end();
}

finish('stage-latency', [
  [`all ${N} draws and confirms reached the display`, lost === 0 && drawMs.length === N && confirmMs.length === N, `${lost} lost`],
  ['draw -> display p95 under 2 s', percentile(drawMs, 95) < 2000, `${Math.round(percentile(drawMs, 95))} ms`],
  ['confirm -> display p95 under 2 s', percentile(confirmMs, 95) < 2000, `${Math.round(percentile(confirmMs, 95))} ms`],
]);
