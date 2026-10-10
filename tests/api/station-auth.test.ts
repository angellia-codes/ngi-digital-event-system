import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as login } from '@/app/api/station/login/route';
import { POST as logout } from '@/app/api/station/logout/route';
import { GET as me } from '@/app/api/station/me/route';
import { POST as pick } from '@/app/api/station/select-label/route';
import { EVENT, PINS, getReq, loginAs, mergeCookies, postJson, resetEvent, setupPins, svc } from './helpers';

beforeAll(setupPins);
beforeEach(resetEvent); // also clears auth_attempts

const body = async (r: Response) => r.json();

describe('station login', () => {
  it('logs in with the right PIN and sets httpOnly cookies', async () => {
    const res = await login(postJson('/api/station/login', { pin: PINS.checkin }));
    expect(res.status).toBe(200);
    expect(await body(res)).toMatchObject({ ok: true, status: 'OK', data: { role: 'checkin' } });
    const cookies = res.headers.getSetCookie().join('\n');
    expect(cookies).toMatch(/nf_station=.+HttpOnly/i);
    expect(cookies).toMatch(/nf_device=.+HttpOnly/i);
    expect(cookies).toMatch(/SameSite=lax/i);
  });
  it('returns INVALID for a wrong PIN and sets no session', async () => {
    const res = await login(postJson('/api/station/login', { pin: '000000' }));
    expect(await body(res)).toMatchObject({ ok: true, status: 'INVALID' });
    expect(res.headers.getSetCookie().join('\n')).not.toMatch(/nf_station/);
  });
  it('rejects malformed PINs and foreign origins', async () => {
    expect((await login(postJson('/api/station/login', { pin: '12ab56' }))).status).toBe(400);
    const bad = new Request('http://localhost/api/station/login', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
      body: JSON.stringify({ pin: PINS.checkin }),
    });
    expect((await login(bad)).status).toBe(403);
  });
  it('locks a device after 5 failures, even for the right PIN, but not other devices', async () => {
    let cookie = '';
    for (let i = 0; i < 5; i++) {
      const r = await login(postJson('/api/station/login', { pin: '000000' }, cookie));
      cookie = mergeCookies(cookie, r);
    }
    const locked = await login(postJson('/api/station/login', { pin: PINS.checkin }, cookie));
    expect(locked.status).toBe(429);
    expect(await body(locked)).toEqual({ ok: false, status: 'LOCKED' });
    const other = await login(postJson('/api/station/login', { pin: PINS.checkin }));
    expect((await body(other)).status).toBe('OK');
  });
  it('caps one IP at 30 failures across devices', async () => {
    const withIp = (pin: string) => {
      const r = postJson('/api/station/login', { pin });
      r.headers.set('x-forwarded-for', '203.0.113.9');
      return r;
    };
    for (let i = 0; i < 30; i++) await login(withIp('000000'));
    expect((await login(withIp(PINS.checkin))).status).toBe(429);
  });
});

describe('station session', () => {
  it('requires a session for /me', async () => {
    const { status } = await me(getReq('/api/station/me'));
    expect(status).toBe(401);
  });
  it('returns role, label and the label list after login and label selection', async () => {
    const cookie = await loginAs('merchandise', 'Booth 1');
    const res = await me(getReq('/api/station/me', cookie));
    expect(await body(res)).toMatchObject({ status: 'OK', data: { role: 'merchandise', label: 'Booth 1' } });
    expect((await body(await me(getReq('/api/station/me', cookie)))).data.labels).toContain('Meja 1');
  });
  it('refuses a label that is not in the list', async () => {
    const res = await login(postJson('/api/station/login', { pin: PINS.checkin }));
    const cookie = mergeCookies('', res);
    expect((await pick(postJson('/api/station/select-label', { label: 'Nowhere' }, cookie))).status).toBe(400);
  });
  it('rejects a forged cookie', async () => {
    expect((await me(getReq('/api/station/me', 'nf_station=not.a.jwt'))).status).toBe(401);
  });
  it('ends the session when the PIN is rotated', async () => {
    const cookie = await loginAs('checkin');
    expect((await me(getReq('/api/station/me', cookie))).status).toBe(200);
    await svc().rpc('set_station_pin', { p_event: EVENT, p_role: 'checkin', p_pin: PINS.checkin, p_actor: 'test' });
    expect((await me(getReq('/api/station/me', cookie))).status).toBe(401);
  });
  it('ends the session when the role is disabled', async () => {
    const cookie = await loginAs('prizes');
    await svc().rpc('set_station_active', { p_event: EVENT, p_role: 'prizes', p_active: false, p_actor: 'test' });
    expect((await me(getReq('/api/station/me', cookie))).status).toBe(401);
    await setupPins(); // re-enable
  });
  it('clears the cookie on logout', async () => {
    const cookie = await loginAs('checkin');
    const res = await logout(postJson('/api/station/logout', {}, cookie));
    expect(res.headers.getSetCookie().join('\n')).toMatch(/nf_station=;/);
  });
});
