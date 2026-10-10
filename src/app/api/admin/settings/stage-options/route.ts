import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

const schema = z
  .object({ safe_mode: z.boolean().optional(), reduce_effects: z.boolean().optional(), language: z.enum(['id', 'en']).optional() })
  .strict()
  .refine((o) => Object.keys(o).length > 0);

export const POST = adminPost(schema, async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('set_stage_options', { p_event: env().EVENT_ID, p_options: body, p_actor: actorId(actor) });
  return ok(r.status, r);
});
