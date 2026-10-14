import { db, rpc } from './db';
import { isToken } from './qr';

export type PassData = {
  event: {
    name: string; date: string; doors_at: string | null; starts_at: string | null; ends_at: string | null;
    venue: string | null; maps_url: string | null;
  };
  server_now: string;
  guest: { full_name: string; outlet: string; department: string | null; position: string | null };
  invite_token: string;
  checked_in: boolean;
  checked_in_at: string | null;
  prize_number: number | null;
  merchandise: null | { token: string; claimed: boolean; redeemed_at: string | null };
};
export type PassResult = { status: 'OK'; data: PassData } | { status: 'INVALID' } | { status: 'RATE_LIMITED' };

const LIMIT = 20;

/** True when this IP already made 20 invalid lookups in the last minute. */
export async function checkLimit(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db().from('auth_attempts').select('id', { count: 'exact', head: true })
    .eq('scope', 'token_ip').eq('key', ip).gte('at', since);
  return (count ?? 0) >= LIMIT;
}
export const noteInvalid = async (ip: string) => {
  await db().from('auth_attempts').insert({ scope: 'token_ip', key: ip, success: false });
};

export async function loadPass(token: string, ip: string): Promise<PassResult> {
  if (await checkLimit(ip)) return { status: 'RATE_LIMITED' };
  if (!isToken(token)) {
    await noteInvalid(ip);
    return { status: 'INVALID' };
  }
  const r = await rpc<{ status: string } & Partial<PassData>>('get_pass', { p_token: token });
  if (r.status !== 'OK') {
    await noteInvalid(ip);
    return { status: 'INVALID' };
  }
  return { status: 'OK', data: r as unknown as PassData };
}
