import { fail, guard, ok, sameOrigin } from '@/lib/api';
import { stationCookie } from '@/lib/session';

export const POST = guard(async (req: Request) => {
  if (!sameOrigin(req)) return fail(403, 'BAD_ORIGIN');
  const res = ok('OK');
  res.cookies.set(stationCookie('', 0));
  return res;
});
