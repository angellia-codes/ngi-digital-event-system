import { SignJWT, jwtVerify } from 'jose';
import { parseCookies } from './api';
import { rpc } from './db';
import { env } from './env';

export const STAGE_COOKIE = 'nf_stage';
const key = () => new TextEncoder().encode(env().STATION_SESSION_SECRET);

/** `tag` is the 12-character fingerprint of the current display key (SQL `stage_key_tag`). */
export async function signStage(tag: string): Promise<string> {
  return new SignJWT({ k: tag })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('stage')
    .setIssuedAt()
    .setExpirationTime('36h')
    .sign(key());
}

export const stageCookie = (value: string, maxAge = 36 * 3600) => ({
  name: STAGE_COOKIE, value, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge,
});

/** Valid signature, right audience, and the fingerprint still matches the current key (rotating the key signs displays out). */
export async function verifyStageCookie(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  let tag: string;
  try {
    const { payload } = await jwtVerify(value, key(), { algorithms: ['HS256'], audience: 'stage' });
    tag = String(payload.k ?? '');
  } catch {
    return false;
  }
  const current = await rpc<string | null>('stage_key_tag', { p_event: env().EVENT_ID });
  return !!current && current === tag;
}

export const readStage = (req: Request): Promise<boolean> =>
  verifyStageCookie(parseCookies(req.headers.get('cookie'))[STAGE_COOKIE]);
