import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, stationPost } from '@/lib/routes';

const schema = z.object({ prize_id: z.string().uuid(), request_id: z.string().uuid() });

export const POST = stationPost(['draw'], schema, async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('draw_prize', {
    p_event: env().EVENT_ID, p_prize_id: body.prize_id, p_request_id: body.request_id, p_actor: actorId(actor),
  });
  return ok(r.status, r);
});
