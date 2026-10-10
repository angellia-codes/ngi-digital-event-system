import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, stationPost } from '@/lib/routes';

const schema = z
  .object({ phase: z.enum(['idle', 'intro']), prize_id: z.string().uuid().optional() })
  .refine((b) => b.phase === 'idle' || !!b.prize_id);

export const POST = stationPost(['draw'], schema, async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('set_stage', {
    p_event: env().EVENT_ID, p_phase: body.phase, p_prize_id: body.prize_id ?? null, p_actor: actorId(actor),
  });
  return ok(r.status, r);
});
