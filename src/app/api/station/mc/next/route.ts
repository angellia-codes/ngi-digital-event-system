import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, stationPost } from '@/lib/routes';

// from_segment_id is the segment this device shows as current (null before the show). A stale device gets
// ALREADY_ADVANCED with the live state, so two MCs tapping NEXT together never skip a segment.
const schema = z.object({ from_segment_id: z.string().uuid().nullable() });

export const POST = stationPost(['mc'], schema, async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('mc_next', {
    p_event: env().EVENT_ID, p_from: body.from_segment_id, p_actor: actorId(actor),
  });
  return ok(r.status, r);
});
