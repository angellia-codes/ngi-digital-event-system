import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as enter } from '@/app/api/stage/enter/route';
import { POST as heartbeat } from '@/app/api/stage/heartbeat/route';
import { GET as state } from '@/app/api/stage/state/route';
import { EVENT, getReq, loginAs, mergeCookies, postJson, resetEvent, setupPins, svc } from './helpers';

const KEY = 'Abcdefghijklmnop12345678';
const setKey = (k: string) => svc().rpc('set_stage_key', { p_event: EVENT, p_key: k, p_actor: 'test' });
const goto = (path: string, ip = '10.0.0.1') => new Request(`http://localhost${path}`, { headers: { 'x-forwarded-for': ip } });
const location = (r: Response) => new URL(r.headers.get('location')!, 'http://localhost');

beforeAll(setupPins);
beforeEach(async () => {
  await resetEvent(); // also clears auth_attempts
  expect((await setKey(KEY)).data.status).toBe('OK');
});

describe('entering with the display key', () => {
  it('sets an httpOnly cookie and redirects to /stage without the key', async () => {
    const res = await enter(goto(`/api/stage/enter?key=${KEY}`));
    expect(res.status).toBe(302);
    expect(location(res).pathname).toBe('/stage');
    expect(location(res).search).toBe('');
    expect(res.headers.getSetCookie().join('\n')).toMatch(/nf_stage=.+HttpOnly/i);
  });
  it('refuses a wrong key without a cookie', async () => {
    const res = await enter(goto('/api/stage/enter?key=wrong'));
    expect(location(res).search).toBe('?error=invalid');
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
  it('says so when no key has been set', async () => {
    await svc().from('events').update({ display_key_hash: null }).eq('id', EVENT);
    expect(location(await enter(goto(`/api/stage/enter?key=${KEY}`))).search).toBe('?error=notset');
  });
  it('locks an address after 20 wrong keys but not other addresses', async () => {
    for (let i = 0; i < 20; i++) await enter(goto('/api/stage/enter?key=wrong', '10.9.9.9'));
    expect(location(await enter(goto(`/api/stage/enter?key=${KEY}`, '10.9.9.9'))).search).toBe('?error=locked');
    expect(location(await enter(goto(`/api/stage/enter?key=${KEY}`, '10.1.1.1'))).pathname).toBe('/stage');
  });
});

describe('state and heartbeat', () => {
  const cookieFor = async () => mergeCookies('', await enter(goto(`/api/stage/enter?key=${KEY}`)));

  it('answers 401 without the cookie, with a station cookie, and with a garbage cookie', async () => {
    expect((await state(getReq('/api/stage/state'))).status).toBe(401);
    expect((await state(getReq('/api/stage/state', 'nf_stage=garbage'))).status).toBe(401);
    expect((await state(getReq('/api/stage/state', await loginAs('draw')))).status).toBe(401); // a station session is not a display
    expect((await heartbeat(postJson('/api/stage/heartbeat', {}))).status).toBe(401);
  });
  it('returns the current row with the cookie', async () => {
    const j = await (await state(getReq('/api/stage/state', await cookieFor()))).json();
    expect(j).toMatchObject({ ok: true, status: 'OK', data: { phase: 'idle', options: { language: 'en' } } });
    expect(typeof j.data.rev).toBe('number');
  });
  it('records a heartbeat, and refuses one from another Origin', async () => {
    const c = await cookieFor();
    expect((await heartbeat(postJson('/api/stage/heartbeat', {}, c))).status).toBe(200);
    const age = await svc().rpc('stage_heartbeat_age', { p_event: EVENT });
    expect(age.data).toBeLessThanOrEqual(2);
    const bad = new Request('http://localhost/api/stage/heartbeat', { method: 'POST', headers: { origin: 'https://evil.example', cookie: c }, body: '{}' });
    expect((await heartbeat(bad)).status).toBe(403);
  });
  it('signs the display out when the key is rotated', async () => {
    const c = await cookieFor();
    expect((await state(getReq('/api/stage/state', c))).status).toBe(200);
    await setKey('Zyxwvutsrqponmlk98765432');
    expect((await state(getReq('/api/stage/state', c))).status).toBe(401);
  });
});
