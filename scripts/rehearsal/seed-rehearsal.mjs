// Usage: node --env-file=.env.local scripts/rehearsal/seed-rehearsal.mjs prizes
//        node --env-file=.env.local scripts/rehearsal/seed-rehearsal.mjs remove-prizes
// Adds placeholder prizes named "[TEST] …" so the MC can practise before HR has entered the real list,
// and removes them again. Refuses to run once the event is live.
import pg from 'pg';

const EVENT = process.env.EVENT_ID;
const command = process.argv[2];
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

const [{ mode }] = await q('select mode from public.events where id = $1', [EVENT]);
if (mode !== 'rehearsal') {
  console.error('The event is live. Placeholder prizes are for rehearsal only.');
  process.exit(2);
}

const PLACEHOLDERS = [
  { name: '[TEST] Hadiah Utama', tier: 'HADIAH UTAMA', quantity: 1, sort_order: 10 },
  { name: '[TEST] Hadiah Kedua', tier: 'HADIAH KEDUA', quantity: 2, sort_order: 20 },
  { name: '[TEST] Hiburan', tier: 'HIBURAN', quantity: 5, sort_order: 30 },
  { name: '[TEST] Voucher (sekaligus)', tier: 'VOUCHER', quantity: 5, sort_order: 40, draw_as_batch: true },
];

try {
  if (command === 'prizes') {
    for (const p of PLACEHOLDERS) {
      const [{ r }] = await q('select public.admin_save_prize($1, null, $2::jsonb, $3) as r', [EVENT, JSON.stringify(p), 'rehearsal']);
      console.log(`${r.status === 'OK' ? 'added  ' : r.status === 'NAME_IN_USE' ? 'exists ' : 'FAILED '} ${p.name}`);
    }
  } else if (command === 'remove-prizes') {
    const rows = await q("select id, name from public.prizes where event_id = $1 and name like '[TEST] %' order by sort_order", [EVENT]);
    for (const p of rows) {
      const [{ r }] = await q('select public.admin_delete_prize($1, $2, $3) as r', [EVENT, p.id, 'rehearsal']);
      console.log(`${r.status === 'OK' ? 'removed' : r.status === 'HAS_DRAWS' ? 'kept   ' : 'FAILED '} ${p.name}${r.status === 'HAS_DRAWS' ? ' (has draws: reset rehearsal data first)' : ''}`);
    }
    if (rows.length === 0) console.log('No placeholder prizes found.');
  } else {
    console.error('Usage: seed-rehearsal.mjs prizes | remove-prizes');
    process.exit(1);
  }
} finally {
  await pool.end();
}
