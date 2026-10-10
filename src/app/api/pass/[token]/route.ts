import { clientIp, fail, guard, ok } from '@/lib/api';
import { loadPass } from '@/lib/pass';

export const GET = guard(async (req: Request, ctx?: { params: Promise<{ token: string }> }) => {
  const { token } = await ctx!.params;
  const r = await loadPass(token, clientIp(req));
  if (r.status === 'RATE_LIMITED') return fail(429, 'RATE_LIMITED');
  if (r.status === 'INVALID') return ok('INVALID');
  return ok('OK', r.data);
});
