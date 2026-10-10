// Usage: node --env-file=.env.test scripts/load/pass-pages.mjs
// Spec: 215 pass pages inside one minute. Run against a production build (`npm run build && npm run start`), not `next dev`.
import pg from 'pg';
import { BASE, finish, percentile, runPool } from './util.mjs';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query("select invite_token from guests where event_id = $1 and employee_id like 'L%' order by employee_id", [process.env.EVENT_ID]);
await pool.end();
if (rows.length < 215) { console.error(`Seed first: only ${rows.length} fake guests (need 215).`); process.exit(2); }

const lat = [];
let bad = 0;
const t0 = performance.now();
await runPool(rows.slice(0, 215), 40, async ({ invite_token }) => {
  const s = performance.now();
  try {
    const res = await fetch(`${BASE}/pass/${invite_token}`);
    await res.text();
    if (!res.ok) bad++;
  } catch { bad++; }
  lat.push(performance.now() - s);
});
const total = (performance.now() - t0) / 1000;
finish('pass-pages', [
  ['215 pages served inside 60 s', total < 60, `${total.toFixed(1)} s`],
  ['no failed responses', bad === 0, `${bad} failed`],
  ['p95 under 3 s', percentile(lat, 95) < 3000, `${Math.round(percentile(lat, 95))} ms`],
]);
