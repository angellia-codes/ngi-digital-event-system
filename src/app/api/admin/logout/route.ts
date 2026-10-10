import { z } from 'zod';
import { ok } from '@/lib/api';
import { adminPost } from '@/lib/routes';
import { supabaseServer } from '@/lib/supabase-server';

export const POST = adminPost(z.object({}).strict(), async () => {
  await (await supabaseServer()).auth.signOut();
  return ok('OK');
});
