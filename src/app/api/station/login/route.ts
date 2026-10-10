import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { clientIp, fail, guard, ok, parseCookies, readJson, sameOrigin } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { stationLabels } from '@/lib/labels';
import { DEVICE_COOKIE, deviceCookie, signStation, stationCookie, type Role } from '@/lib/session';

const schema = z.object({ pin: z.string().regex(/^\d{6}$/) });

export const POST = guard(async (req: Request) => {
  if (!sameOrigin(req)) return fail(403, 'BAD_ORIGIN');
  const body = await readJson(req, schema);
  if (!body) return fail(400, 'BAD_INPUT');

  const existing = parseCookies(req.headers.get('cookie'))[DEVICE_COOKIE];
  const device = existing && /^[a-f0-9]{32}$/.test(existing) ? existing : randomBytes(16).toString('hex');

  const r = await rpc<{ status: string; role?: Role; session_version?: number }>('verify_pin', {
    p_event: env().EVENT_ID, p_pin: body.pin, p_device_key: device, p_ip_key: clientIp(req),
  });

  const res =
    r.status === 'LOCKED' ? fail(429, 'LOCKED')
    : r.status === 'OK' ? ok('OK', { role: r.role, labels: await stationLabels() })
    : ok('INVALID');
  res.cookies.set(deviceCookie(device));
  if (r.status === 'OK' && r.role && r.session_version !== undefined) {
    res.cookies.set(stationCookie(await signStation({ role: r.role, label: '', v: r.session_version })));
  }
  return res;
});
