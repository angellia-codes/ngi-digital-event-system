import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationPost } from '@/lib/routes';

const schema = z.object({ number: z.number().int().min(1).max(100_000) });

export const POST = stationPost(['draw', 'prizes'], schema, async ({ body }) => {
  const r = await rpc<{ status: string }>('lookup_prize_number', { p_event: env().EVENT_ID, p_number: body.number });
  return ok(r.status, r);
});
