import { z } from 'zod';
import { clientIp, fail, guard, ok, readJson, sameOrigin } from '@/lib/api';
import { rpc } from '@/lib/db';
import { checkLimit, noteInvalid } from '@/lib/pass';
import { isToken } from '@/lib/qr';

const schema = z.object({ status: z.enum(['yes', 'no']) });

export const POST = guard(async (req: Request, ctx?: { params: Promise<{ token: string }> }) => {
  if (!sameOrigin(req)) return fail(403, 'BAD_ORIGIN');
  const body = await readJson(req, schema);
  if (!body) return fail(400, 'BAD_INPUT');
  const { token } = await ctx!.params;
  const ip = clientIp(req);
  if (await checkLimit(ip)) return fail(429, 'RATE_LIMITED');
  if (!isToken(token)) { await noteInvalid(ip); return ok('INVALID'); }
  const r = await rpc<{ status: string }>('set_rsvp', { p_token: token, p_status: body.status });
  if (r.status !== 'OK') { await noteInvalid(ip); return ok('INVALID'); }
  return ok('OK', { rsvp_status: body.status });
});
