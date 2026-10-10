import { z } from 'zod';
import { ok } from '@/lib/api';
import { previewImport } from '@/lib/import';
import { adminPost } from '@/lib/routes';

export const POST = adminPost(z.object({ csv: z.string().min(1).max(2_000_000) }), async ({ body }) => {
  const r = await previewImport(body.csv);
  return ok(r.status, r);
});
