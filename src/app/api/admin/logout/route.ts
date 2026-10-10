import { z } from 'zod';
import { ok } from '@/lib/api';
import { adminPost } from '@/lib/routes';
import { stationCookie } from '@/lib/session';

export const POST = adminPost(z.object({}).strict(), async () => {
  const res = ok('OK');
  res.cookies.set(stationCookie('', 0));
  return res;
});
