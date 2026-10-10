import { SignJWT, jwtVerify } from 'jose';
import { env } from './env';
import { rpc } from './db';
import { parseCookies } from './api';

export const STATION_COOKIE = 'nf_station';
export const DEVICE_COOKIE = 'nf_device';
export const ROLES = ['checkin', 'merchandise', 'draw', 'prizes', 'admin'] as const;
export type Role = (typeof ROLES)[number];
export type StationSession = { role: Role; label: string; v: number };

const key = () => new TextEncoder().encode(env().STATION_SESSION_SECRET);
const secure = () => process.env.NODE_ENV === 'production';

export async function signStation(s: StationSession): Promise<string> {
  return new SignJWT({ role: s.role, label: s.label, v: s.v })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('14h')
    .sign(key());
}

export async function readStation(req: Request): Promise<StationSession | null> {
  return verifyStationToken(parseCookies(req.headers.get('cookie'))[STATION_COOKIE]);
}

/** Same check for a cookie value read elsewhere (server components use next/headers, not a Request). */
export async function verifyStationToken(token: string | undefined): Promise<StationSession | null> {
  if (!token) return null;
  let session: StationSession;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    session = { role: payload.role as Role, label: String(payload.label ?? ''), v: Number(payload.v) };
  } catch {
    return null; // bad signature or expired
  }
  if (!ROLES.includes(session.role)) return null;
  // Database check on every request: rotating or disabling a PIN logs the role out at once.
  // A database failure throws RetryableError so a network blip does not log staff out.
  const valid = await rpc<boolean>('station_session_valid', { p_event: env().EVENT_ID, p_role: session.role, p_version: session.v });
  return valid ? session : null;
}

export const stationCookie = (value: string, maxAge = 14 * 3600) => ({
  name: STATION_COOKIE, value, httpOnly: true, secure: secure(), sameSite: 'lax' as const, path: '/', maxAge,
});
export const deviceCookie = (value: string) => ({
  name: DEVICE_COOKIE, value, httpOnly: true, secure: secure(), sameSite: 'lax' as const, path: '/', maxAge: 365 * 24 * 3600,
});
