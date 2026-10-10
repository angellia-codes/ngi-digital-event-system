import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';
import { assertTestEnv } from '../../scripts/guard-test-env.mjs';

// The pgTAP suites assume an empty database, so leave no API-test data behind.
// Safety: only runs when API tests were requested, and only if the event is still in rehearsal mode.
export async function teardown() {
  if (!process.argv.some((a) => a.includes('tests/api') || a === 'tests/api')) return;
  assertTestEnv(); // never reset or delete anything unless .env.test is a separate project
  const env = loadEnv('test', process.cwd(), '');
  const event = env.EVENT_ID;
  const svc = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data } = await svc.rpc('reset_rehearsal_data', { p_event: event, p_actor: 'test' });
  if (data?.status !== 'OK') return; // live event: never delete anything
  await svc.from('guests').delete().eq('event_id', event);
  await svc.from('import_batches').delete().eq('event_id', event);
  await svc.from('station_pins').delete().eq('event_id', event);
  await svc.from('audit_log').delete().eq('event_id', event);
}
