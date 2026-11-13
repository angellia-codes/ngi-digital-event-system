import { z } from 'zod';
import { fail, guard, ok, readJson, sameOrigin } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { readStage } from '@/lib/stage-session';

/** A one-off video reached its end on the stage. Only a 'goto' end action changes the screen (stage_screen_ended). */
export const POST = guard(async (req: Request) => {
  if (!sameOrigin(req)) return fail(403, 'BAD_ORIGIN');
  if (!(await readStage(req))) return fail(401, 'NO_SESSION');
  const body = await readJson(req, z.object({ screen_rev: z.number().int().min(0) }));
  if (!body) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ status: string }>('stage_screen_ended', { p_event: env().EVENT_ID, p_screen_rev: body.screen_rev });
  return ok(r.status);
});
