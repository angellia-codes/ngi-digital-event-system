import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, stationPost } from '@/lib/routes';

const schema = z.union([
  z.object({ draw_id: z.string().uuid(), outcome: z.enum(['confirm', 'no_show']) }),
  z.object({ round_id: z.string().uuid(), outcome: z.literal('confirm_all') }),
]);

export const POST = stationPost(['draw', 'prizes'], schema, async ({ actor, body }) => {
  const r =
    'draw_id' in body
      ? await rpc<{ status: string }>('resolve_draw', {
          p_event: env().EVENT_ID, p_draw_id: body.draw_id, p_outcome: body.outcome, p_actor: actorId(actor),
        })
      : await rpc<{ status: string }>('resolve_round', { p_event: env().EVENT_ID, p_round: body.round_id, p_actor: actorId(actor) });
  return ok(r.status, r);
});
