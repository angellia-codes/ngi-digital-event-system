import { beforeEach, describe, expect, it } from 'vitest';
import { GET as getPass } from '@/app/api/pass/[token]/route';
import { POST as postRsvp } from '@/app/api/pass/[token]/rsvp/route';
import { EVENT, getReq, postJson, resetEvent, seedGuests, svc, type TestGuest } from './helpers';

let g: TestGuest;
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
const pass = (token: string, ip = '198.51.100.1') => {
  const r = getReq(`/api/pass/${token}`);
  r.headers.set('x-forwarded-for', ip);
  return getPass(r, ctx(token));
};

beforeEach(async () => {
  await resetEvent();
  [g] = await seedGuests(1);
  await svc().from('guests').update({ first_opened_at: null, rsvp_status: 'pending' }).eq('id', g.id);
});

describe('GET /api/pass/[token]', () => {
  it('returns the guest pass before check-in without the merchandise token or phone', async () => {
    const res = await pass(g.invite_token);
    const text = await res.text();
    const json = JSON.parse(text);
    expect(json).toMatchObject({ ok: true, status: 'OK', data: { guest: { full_name: g.full_name }, checked_in: false, merchandise: null } });
    expect(text).not.toContain(g.merch_token);
    expect(text).not.toContain('628123450000');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
  it('records the first open', async () => {
    await pass(g.invite_token);
    const { data } = await svc().from('guests').select('first_opened_at').eq('id', g.id).single();
    expect(data?.first_opened_at).not.toBeNull();
  });
  it('adds the prize number and merchandise token after check-in', async () => {
    await svc().rpc('check_in', { p_event: EVENT, p_token: g.invite_token, p_guest_id: null, p_method: 'scan', p_station_label: 'Meja 1', p_actor: 'test' });
    const json = await (await pass(g.invite_token)).json();
    expect(json.data).toMatchObject({ checked_in: true, prize_number: 1, merchandise: { token: g.merch_token, claimed: false } });
  });
  it('answers INVALID for unknown or malformed tokens without any data', async () => {
    for (const t of ['AAAAAAAAAAAAAAAAAAAAAA', 'short', g.merch_token]) {
      expect(await (await pass(t)).json()).toEqual({ ok: true, status: 'INVALID', data: null });
    }
  });
  it('rate-limits invalid lookups at 20 per minute per IP, but valid lookups never count', async () => {
    for (let i = 0; i < 40; i++) expect((await pass(g.invite_token, '198.51.100.7')).status).toBe(200);
    for (let i = 0; i < 20; i++) expect((await pass('AAAAAAAAAAAAAAAAAAAAAA', '198.51.100.8')).status).toBe(200);
    const limited = await pass('AAAAAAAAAAAAAAAAAAAAAA', '198.51.100.8');
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ ok: false, status: 'RATE_LIMITED' });
    expect((await pass(g.invite_token, '198.51.100.9')).status).toBe(200); // other IPs unaffected
  });
});

describe('POST /api/pass/[token]/rsvp', () => {
  const rsvp = (token: string, status: unknown, origin = 'http://localhost') => {
    const r = new Request(`http://localhost/api/pass/${token}/rsvp`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ status }),
    });
    return postRsvp(r, ctx(token));
  };
  it('stores yes and lets the guest change to no', async () => {
    expect(await (await rsvp(g.invite_token, 'yes')).json()).toMatchObject({ status: 'OK' });
    expect(await (await rsvp(g.invite_token, 'no')).json()).toMatchObject({ status: 'OK' });
    const { data } = await svc().from('guests').select('rsvp_status').eq('id', g.id).single();
    expect(data?.rsvp_status).toBe('no');
  });
  it('rejects bad status values and foreign origins', async () => {
    expect((await rsvp(g.invite_token, 'maybe')).status).toBe(400);
    expect((await rsvp(g.invite_token, 'yes', 'http://evil.example')).status).toBe(403);
  });
  it('answers INVALID for an unknown token', async () => {
    expect(await (await rsvp('AAAAAAAAAAAAAAAAAAAAAA', 'yes')).json()).toMatchObject({ status: 'INVALID' });
  });
});
