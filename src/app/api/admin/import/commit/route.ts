import { z } from 'zod';
import { ok } from '@/lib/api';
import { commitImport } from '@/lib/import';
import { actorId, adminPost } from '@/lib/routes';

export const POST = adminPost(z.object({ csv: z.string().min(1).max(2_000_000) }), async ({ actor, body }) => {
  const r = await commitImport(body.csv, actorId(actor));
  return ok(r.status, r);
});
