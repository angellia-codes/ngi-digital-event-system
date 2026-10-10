// Sets or resets the admin PIN. Usage (PowerShell):  $env:ADMIN_PIN='123456'; node --env-file=.env.local scripts/set-admin-pin.mjs
// The PIN is read from the environment so it never appears in chat or shell history files you share.
// Needs migration 20261115000007 (the 'admin' role). Every browser signed in as admin is signed out.
import pg from 'pg';

const pin = process.env.ADMIN_PIN ?? '';
if (!/^[0-9]{4}$/.test(pin)) { console.error('Set ADMIN_PIN to exactly 4 digits.'); process.exit(2); }
if (!process.env.DATABASE_URL || !process.env.EVENT_ID) { console.error('DATABASE_URL and EVENT_ID are required (use --env-file=.env.local).'); process.exit(2); }

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  const { rows } = await db.query("select public.set_station_pin($1, 'admin', $2, 'setup-script') as r", [process.env.EVENT_ID, pin]);
  console.log(rows[0].r.status === 'OK' ? 'Admin PIN set.' : `Not set: ${rows[0].r.status}`);
  process.exitCode = rows[0].r.status === 'OK' ? 0 : 1;
} finally {
  await db.end();
}
