// Usage: node --env-file=.env.test scripts/load/seed-fake-guests.mjs [count]
// Seeds fake employees L001.. into the event. Use only on local or staging.
import pg from 'pg';

const n = Number(process.argv[2] ?? 215);
const outlets = ['Outlet Ubud', 'Outlet Seminyak', 'Central Kitchen', 'Head Office'];
const rows = Array.from({ length: n }, (_, i) => ({
  row_no: i + 2,
  employee_id: `L${String(i + 1).padStart(3, '0')}`,
  full_name: `Load Guest ${i + 1}`,
  outlet: outlets[i % outlets.length],
  phone: `+628120000${String(i).padStart(4, '0')}`,
}));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows: [r] } = await pool.query('select public.import_guests($1, $2::jsonb, $3, $4) as r', [
  process.env.EVENT_ID, JSON.stringify(rows), 'load.csv', 'load',
]);
console.log(r.r);
await pool.end();
process.exit(r.r.status === 'OK' ? 0 : 1);
