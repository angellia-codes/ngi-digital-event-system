import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

export const POST = adminPost(z.object({ confirm: z.literal('RESET') }), async ({ actor }) => {
  const r = await rpc<{ status: string }>('reset_rehearsal_data', { p_event: env().EVENT_ID, p_actor: actorId(actor) });
  return ok(r.status);
});
