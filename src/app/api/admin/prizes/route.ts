import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminGet, adminPost } from '@/lib/routes';

const schema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().max(80).optional(),
  tier: z.string().max(30).nullable().optional(),
  quantity: z.number().int().min(1).max(500).optional(),
  draw_as_batch: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(100_000).optional(),
});

export const GET = adminGet(async () => {
  const r = await rpc<{ prizes: unknown[] }>('prize_list', { p_event: env().EVENT_ID });
  return ok('OK', { prizes: r.prizes });
});

export const POST = adminPost(schema, async ({ actor, body }) => {
  const { id, ...data } = body;
  const r = await rpc<{ status: string }>('admin_save_prize', {
    p_event: env().EVENT_ID, p_id: id ?? null, p_data: data, p_actor: actorId(actor),
  });
  return ok(r.status, r);
});
