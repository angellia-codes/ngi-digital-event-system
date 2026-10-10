import { fail, guard, ok, sameOrigin } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { readStage } from '@/lib/stage-session';

export const POST = guard(async (req: Request) => {
  if (!sameOrigin(req)) return fail(403, 'BAD_ORIGIN');
  if (!(await readStage(req))) return fail(401, 'NO_SESSION');
  await rpc('touch_stage_heartbeat', { p_event: env().EVENT_ID });
  return ok('OK');
});
