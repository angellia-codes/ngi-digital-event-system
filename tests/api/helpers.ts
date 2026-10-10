import { createClient } from '@supabase/supabase-js';
import { expect } from 'vitest';
import type { Role } from '@/lib/session';

export const EVENT = process.env.EVENT_ID!;
export const svc = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
export const PINS: Record<Role, string> = { checkin: '111111', merchandise: '222222', draw: '333333', prizes: '444444' };

export async function setupPins() {
  for (const [role, pin] of Object.entries(PINS)) {
    const { data, error } = await svc().rpc('set_station_pin', { p_event: EVENT, p_role: role, p_pin: pin, p_actor: 'test' });
    expect(error).toBeNull();
    expect(data.status).toBe('OK');
  }
}

export async function resetEvent() {
  const { data, error } = await svc().rpc('reset_rehearsal_data', { p_event: EVENT, p_actor: 'test' });
  expect(error).toBeNull();
  expect(data.status).toBe('OK'); // the dev event must still be in rehearsal mode
}

export type TestGuest = { id: string; employee_id: string; full_name: string; invite_token: string; merch_token: string };

export async function seedGuests(n = 3): Promise<TestGuest[]> {
  const rows = Array.from({ length: n }, (_, i) => ({
    row_no: i + 2, employee_id: `T${i + 1}`, full_name: `Test Guest ${i + 1}`, outlet: 'Outlet A', phone: '+628123450000',
  }));
  const { data, error } = await svc().rpc('import_guests', { p_event: EVENT, p_rows: rows, p_filename: 'test.csv', p_actor: 'test' });
  expect(error).toBeNull();
  expect(data.status).toBe('OK');
  // resetEvent keeps guests, so undo any deactivation or RSVP left by an earlier test
  await svc().from('guests').update({ active: true, rsvp_status: 'pending', first_opened_at: null }).eq('event_id', EVENT).like('employee_id', 'T%');
  const { data: guests } = await svc()
    .from('guests').select('id, employee_id, full_name, invite_token, merch_token')
    .eq('event_id', EVENT).like('employee_id', 'T%').order('employee_id');
  return (guests ?? []).slice(0, n) as TestGuest[];
}

export function postJson(path: string, body: unknown, cookie?: string) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}
export function getReq(path: string, cookie?: string) {
  return new Request(`http://localhost${path}`, { headers: cookie ? { cookie } : {} });
}

/** Merges Set-Cookie values from a response into a Cookie header string. */
export function mergeCookies(base: string, res: Response): string {
  const jar = new Map<string, string>();
  for (const part of base.split(';').map((s) => s.trim()).filter(Boolean)) jar.set(part.split('=')[0], part);
  for (const sc of res.headers.getSetCookie()) {
    const pair = sc.split(';')[0];
    const [name, value] = [pair.split('=')[0], pair.slice(pair.indexOf('=') + 1)];
    if (value === '') jar.delete(name);
    else jar.set(name, pair);
  }
  return [...jar.values()].join('; ');
}

/** Full staff login: PIN, then station label. Returns the Cookie header to send on later requests. */
export async function loginAs(role: Role, label = 'Meja 1'): Promise<string> {
  const { POST: login } = await import('@/app/api/station/login/route');
  const { POST: pick } = await import('@/app/api/station/select-label/route');
  const res = await login(postJson('/api/station/login', { pin: PINS[role] }));
  expect((await res.clone().json()).status).toBe('OK');
  let cookie = mergeCookies('', res);
  const res2 = await pick(postJson('/api/station/select-label', { label }, cookie));
  expect(res2.status).toBe(200);
  cookie = mergeCookies(cookie, res2);
  return cookie;
}
