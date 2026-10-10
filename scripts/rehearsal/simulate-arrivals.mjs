// Usage: node --env-file=.env.local scripts/rehearsal/simulate-arrivals.mjs <count> [--per-minute 60]
// Checks in <count> not-yet-checked-in employees through the real check_in function, so a draw rehearsal has a
// full pool without 150 people queuing at a desk. They get real Door Prize numbers. Rehearsal mode only; undo it
// with Settings > Reset rehearsal data.
import pg from 'pg';

const EVENT = process.env.EVENT_ID;
const count = Number(process.argv[2]);
const flag = process.argv.indexOf('--per-minute');
const perMinute = flag > -1 ? Number(process.argv[flag + 1]) : 60;
if (!Number.isInteger(count) || count < 1 || !(perMinute > 0)) {
  console.error('Usage: simulate-arrivals.mjs <count> [--per-minute 60]');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const [{ mode }] = await q('select mode from public.events where id = $1', [EVENT]);
  if (mode !== 'rehearsal') {
    console.error('The event is live. Refusing to simulate arrivals.');
    process.exit(2);
  }
  const guests = await q(
    `select g.invite_token, g.employee_id
       from public.guests g
      where g.event_id = $1 and g.active
        and not exists (select 1 from public.check_ins c where c.guest_id = g.id)
      order by random() limit $2`,
    [EVENT, count],
  );
  if (guests.length < count) console.warn(`Only ${guests.length} employees are not checked in yet.`);

  let done = 0;
  for (const g of guests) {
    const [{ r }] = await q("select public.check_in($1, $2, null, 'scan', 'Simulasi', 'simulator') as r", [EVENT, g.invite_token]);
    if (r.status === 'CHECKED_IN') done++;
    else console.warn(`${g.employee_id}: ${r.status}`);
    if (done % 10 === 0 && r.status === 'CHECKED_IN') console.log(`${done} / ${guests.length} checked in`);
    if (done < guests.length) await sleep(60_000 / perMinute);
  }
  const [{ n }] = await q('select count(*)::int as n from public.check_ins where event_id = $1', [EVENT]);
  console.log(`Done. ${done} simulated arrivals; ${n} check-ins in total.`);
} finally {
  await pool.end();
}
