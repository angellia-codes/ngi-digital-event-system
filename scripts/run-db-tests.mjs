// Runs supabase/tests/database/*.test.sql (pgTAP) against DATABASE_URL without Docker/pg_prove.
// Each test file wraps itself in begin/rollback, so nothing persists.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const envFile = process.env.ENV_FILE || '.env.test';
const fromFile = fs.existsSync(envFile)
  ? Object.fromEntries(fs.readFileSync(envFile, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
  : {};
const env = { ...fromFile, ...process.env };
if (!env.DATABASE_URL) { console.error('DATABASE_URL missing'); process.exit(1); }

const dir = 'supabase/tests/database';
const only = process.argv[2];
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.sql') && (!only || f.includes(only))).sort();
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query('create extension if not exists pgtap with schema extensions');
await c.query('set search_path = public, extensions');
let bad = 0;
for (const f of files) {
  const sql = fs.readFileSync(path.join(dir, f), 'utf8');
  let results;
  try { results = await c.query(sql); } catch (e) { console.log(`# ${f}: ERROR ${e.message}`); bad++; await c.query('rollback').catch(() => {}); continue; }
  const lines = (Array.isArray(results) ? results : [results]).flatMap((r) => (r.rows || []).map((row) => Object.values(row)[0])).filter((v) => typeof v === 'string');
  const fails = lines.filter((l) => /^not ok/.test(l));
  console.log(`# ${f}: ${lines.filter((l) => /^ok/.test(l)).length} ok, ${fails.length} failed`);
  fails.forEach((l) => console.log('  ' + l));
  lines.filter((l) => /^#/.test(l)).forEach((l) => console.log('  ' + l));
  bad += fails.length;
}
await c.end();
console.log(bad ? 'Result: FAIL' : 'Result: PASS');
process.exit(bad ? 1 : 0);
