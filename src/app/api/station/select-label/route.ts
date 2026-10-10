import { z } from 'zod';
import { fail, ok } from '@/lib/api';
import { stationLabels } from '@/lib/labels';
import { stationPost } from '@/lib/routes';
import { ROLES, signStation, stationCookie } from '@/lib/session';

export const POST = stationPost(ROLES, z.object({ label: z.string().min(1).max(30) }), async ({ actor, body }) => {
  if (actor.type === 'admin') return ok('OK', { label: 'admin' });
  if (!(await stationLabels()).includes(body.label)) return fail(400, 'BAD_LABEL');
  const res = ok('OK', { label: body.label });
  res.cookies.set(stationCookie(await signStation({ role: actor.role, label: body.label, v: actor.v })));
  return res;
});
