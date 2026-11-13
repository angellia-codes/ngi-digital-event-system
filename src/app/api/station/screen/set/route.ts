import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, stationPost } from '@/lib/routes';
import { SCREEN_KEYS } from '@/lib/screens';

// from_screen_rev is the screen_rev this panel last showed. If anything changed the screen since, the server answers
// CHANGED with the live state and nothing switches.
const schema = z.object({ key: z.enum(SCREEN_KEYS), from_screen_rev: z.number().int().min(0) });

export const POST = stationPost(['screen'], schema, async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('set_screen', {
    p_event: env().EVENT_ID, p_key: body.key, p_from_screen_rev: body.from_screen_rev, p_actor: actorId(actor),
  });
  return ok(r.status, r);
});
