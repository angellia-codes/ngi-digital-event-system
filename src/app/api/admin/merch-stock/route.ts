import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminGet, adminPost } from '@/lib/routes';
import { SIZES } from '@/lib/sizes';

/** Counts per size for the admin Stock panel (merch size spec §5.4). */
export const GET = adminGet(async () =>
  ok('OK', await rpc<Record<string, unknown>>('merch_size_summary', { p_event: env().EVENT_ID })));

/** Received quantity for all five sizes. Overwrites: a second delivery is entered as the new total. */
const Body = z.object({ stock: z.record(z.enum(SIZES), z.number().int().min(0).max(10000)) });

export const POST = adminPost(Body, async ({ actor, body }) => {
  const r = await rpc<{ status: string }>('set_merch_stock', {
    p_event: env().EVENT_ID, p_stock: body.stock, p_actor: actorId(actor),
  });
  return ok(r.status);
});
