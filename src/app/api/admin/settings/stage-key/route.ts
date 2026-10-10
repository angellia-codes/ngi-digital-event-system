import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ok } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { actorId, adminPost } from '@/lib/routes';

/** Makes a new display key. It is returned once; only a bcrypt hash is stored. Every open display is signed out. */
export const POST = adminPost(z.object({}), async ({ actor }) => {
  const key = randomBytes(24).toString('base64url'); // 32 characters of A–Z a–z 0–9 _ -
  const r = await rpc<{ status: string }>('set_stage_key', { p_event: env().EVENT_ID, p_key: key, p_actor: actorId(actor) });
  if (r.status !== 'OK') return ok(r.status);
  return ok('OK', { key, url: `${env().APP_URL.replace(/\/+$/, '')}/stage?key=${key}` });
});
