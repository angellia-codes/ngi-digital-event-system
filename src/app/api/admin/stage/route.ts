import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { adminGet } from '@/lib/routes';

export const GET = adminGet(async () => {
  const [stage, age, tag] = await Promise.all([
    rpc<Record<string, unknown>>('get_stage', { p_event: env().EVENT_ID }),
    rpc<number | null>('stage_heartbeat_age', { p_event: env().EVENT_ID }),
    rpc<string | null>('stage_key_tag', { p_event: env().EVENT_ID }),
  ]);
  return ok('OK', { stage, heartbeat_age: age, key_set: !!tag });
});
