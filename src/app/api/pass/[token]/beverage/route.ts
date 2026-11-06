import { z } from 'zod';
import { clientIp, fail, guard, ok, readJson, sameOrigin } from '@/lib/api';
import { rpc } from '@/lib/db';
import { checkLimit, loadPass, noteInvalid } from '@/lib/pass';
import { isToken } from '@/lib/qr';

const Body = z.object({ choice: z.enum(['beer', 'soft_drink']) });

/** Guest saves a drink. Answers with the fresh pass so the client swaps state in one round-trip. */
export const POST = guard(async (req: Request, ctx?: { params: Promise<{ token: string }> }) => {
  if (!sameOrigin(req)) return fail(403, 'BAD_ORIGIN');
  const { token } = await ctx!.params;
  const ip = clientIp(req);
  if (await checkLimit(ip)) return fail(429, 'RATE_LIMITED');
  if (!isToken(token)) {
    await noteInvalid(ip);
    return ok('INVALID');
  }
  const body = await readJson(req, Body);
  if (body === null) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ status: string }>('set_beverage', { p_token: token, p_choice: body.choice });
  if (r.status === 'INVALID') {
    await noteInvalid(ip);
    return ok('INVALID');
  }
  const pass = await loadPass(token, ip);
  return ok(r.status, pass.status === 'OK' ? pass.data : null);
});
