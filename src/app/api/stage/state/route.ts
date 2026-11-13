import { fail, guard, ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { readStage } from '@/lib/stage-session';

export const GET = guard(async (req: Request) => {
  if (!(await readStage(req))) return fail(401, 'NO_SESSION');
  const r = await rpc<{ rev: number; phase: string; payload: unknown; options: unknown }>('get_stage', { p_event: env().EVENT_ID });
  return ok('OK', { rev: r.rev, phase: r.phase, payload: r.payload, options: r.options });
});
