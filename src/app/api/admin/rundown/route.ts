import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminGet, adminPost } from '@/lib/routes';

const schema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().max(80).optional(),
  planned_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), // HH:MM WITA on the event date
  duration_min: z.number().int().min(1).max(600).optional(),
  sort_order: z.number().int().min(0).max(100_000).optional(),
  pic: z.string().max(80).nullable().optional(),
  script: z.string().max(4000).nullable().optional(),
  kind: z.enum(['normal', 'door_prize']).optional(),
  prize_ids: z.array(z.string().uuid()).max(200).optional(),
});

/** The rundown with live run state (same shape the MC screen reads) plus the prize list for assignment. */
export const GET = adminGet(async () => {
  const [state, prizes] = await Promise.all([
    rpc('mc_state', { p_event: env().EVENT_ID }),
    rpc<{ prizes: unknown[] }>('prize_list', { p_event: env().EVENT_ID }),
  ]);
  return ok('OK', { state, prizes: prizes.prizes });
});

export const POST = adminPost(schema, async ({ actor, body }) => {
  const { id, ...data } = body;
  const r = await rpc<{ status: string }>('admin_save_segment', {
    p_event: env().EVENT_ID, p_id: id ?? null, p_data: data, p_actor: actorId(actor),
  });
  return ok(r.status, r);
});
