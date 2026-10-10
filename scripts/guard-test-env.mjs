// Every test entry point calls assertTestEnv() first. Tests reset and delete event data, so they must never run
// against the production project. The rule: .env.test must be fully filled in and must not point at the project in .env.local.
import fs from 'node:fs';

const KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'STATION_SESSION_SECRET', 'EVENT_ID', 'APP_URL', 'DATABASE_URL'];

function read(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
}
const refOf = (url) => { try { return new URL(url).hostname.split('.')[0]; } catch { return ''; } };

export function assertTestEnv() {
  const test = read('.env.test');
  const prod = read('.env.local');
  const stop = (why) => {
    throw new Error(
      `Refusing to run tests: ${why}\n` +
      'Tests reset and delete event data. Point .env.test at a SEPARATE Supabase project (apply the migrations with ' +
      '`npx supabase db push --db-url <its DATABASE_URL>` and insert an event row with id 00000000-0000-4000-8000-000000000001), then fill in every key in .env.test.',
    );
  };
  const empty = KEYS.filter((k) => !test[k]);
  if (empty.length) stop(`.env.test is missing: ${empty.join(', ')}.`);
  const prodRef = refOf(prod.SUPABASE_URL);
  if (prodRef && (refOf(test.SUPABASE_URL) === prodRef || test.DATABASE_URL.includes(prodRef))) {
    stop(`.env.test points at the production project (${prodRef}).`);
  }
  if (prod.EVENT_ID && test.EVENT_ID === prod.EVENT_ID) stop('.env.test uses the production EVENT_ID.');
}
