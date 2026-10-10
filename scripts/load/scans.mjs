// Usage: node --env-file=.env.test scripts/load/scans.mjs
// Spec: 20 simultaneous scans, check_in p95 under 1.5 s, prize numbers 1..215 unique with no gaps.
// WARNING: resets rehearsal data first. Refuses to run on a live event.
import pg from 'pg';
import { BASE, finish, percentile, runPool } from './util.mjs';

const PIN = process.env.CHECKIN_PIN ?? '111111';
const headers = { 'content-type': 'application/json', origin: BASE };

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const reset = await pool.query("select public.reset_rehearsal_data($1, 'load') as r", [process.env.EVENT_ID]);
if (reset.rows[0].r.status !== 'OK') { console.error('Event is not in rehearsal mode. Aborting.'); process.exit(2); }
const { rows } = await pool.query("select invite_token from guests where event_id = $1 and employee_id like 'L%' order by employee_id", [process.env.EVENT_ID]);
await pool.end();
if (rows.length < 215) { console.error(`Seed first: only ${rows.length} fake guests (need 215).`); process.exit(2); }

const jar = new Map();
const absorb = (res) => { for (const c of res.headers.getSetCookie()) { const p = c.split(';')[0]; jar.set(p.split('=')[0], p); } };
const cookie = () => [...jar.values()].join('; ');

const login = await fetch(`${BASE}/api/station/login`, { method: 'POST', headers, body: JSON.stringify({ pin: PIN }) });
absorb(login);
if ((await login.json()).status !== 'OK') { console.error('Station login failed'); process.exit(2); }
const pick = await fetch(`${BASE}/api/station/select-label`, { method: 'POST', headers: { ...headers, cookie: cookie() }, body: JSON.stringify({ label: 'Meja 1' }) });
absorb(pick);

const lat = [];
const numbers = [];
let notChecked = 0;
let errors = 0;
await runPool(rows.slice(0, 215), 20, async ({ invite_token }) => {
  const s = performance.now();
  try {
    const res = await fetch(`${BASE}/api/station/check-in`, { method: 'POST', headers: { ...headers, cookie: cookie() }, body: JSON.stringify({ code: `NF:CI:${invite_token}` }) });
    const j = await res.json();
    if (j.status === 'CHECKED_IN') numbers.push(j.data.prize_number); else notChecked++;
  } catch { errors++; }
  lat.push(performance.now() - s);
});

numbers.sort((a, b) => a - b);
const gapFree = numbers.length === 215 && numbers.every((n, i) => n === i + 1);
finish('scans', [
  ['all 215 scans were CHECKED_IN', notChecked === 0 && errors === 0, `${notChecked} other status, ${errors} errors`],
  ['prize numbers are exactly 1..215', gapFree, `${numbers.length} numbers`],
  ['p95 under 1.5 s with 20 in flight', percentile(lat, 95) < 1500, `${Math.round(percentile(lat, 95))} ms`],
]);
