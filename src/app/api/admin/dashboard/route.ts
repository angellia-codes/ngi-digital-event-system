import { ok } from '@/lib/api';
import { db, RetryableError, rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { adminGet } from '@/lib/routes';

export const GET = adminGet(async () => {
  const counts = await rpc<Record<string, unknown>>('event_counts', { p_event: env().EVENT_ID });
  const { data, error } = await db()
    .from('audit_log').select('at, actor, action')
    .eq('event_id', env().EVENT_ID).order('id', { ascending: false }).limit(10);
  if (error) throw new RetryableError('dashboard');
  return ok('OK', { counts, recent: data });
});
