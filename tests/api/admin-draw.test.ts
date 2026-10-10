import Papa from 'papaparse';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/admin-auth', () => ({ getAdmin: vi.fn() }));

import { getAdmin } from '@/lib/admin-auth';
import { GET as auditRoute } from '@/app/api/admin/audit/route';
import { GET as dashboard } from '@/app/api/admin/dashboard/route';
import { GET as listDraws } from '@/app/api/admin/draws/route';
import { POST as voidDraw } from '@/app/api/admin/draws/[id]/void/route';
import { POST as deletePrize } from '@/app/api/admin/prizes/[id]/delete/route';
import { GET as listPrizes, POST as savePrize } from '@/app/api/admin/prizes/route';
import { GET as report } from '@/app/api/admin/reports/[name]/route';
import { GET as stageInfo } from '@/app/api/admin/stage/route';
import { POST as stageKey } from '@/app/api/admin/settings/stage-key/route';
import { POST as stageOptions } from '@/app/api/admin/settings/stage-options/route';
import { arrive, clearPrizes, newPrize, stageRow } from './draw-helpers';
import { EVENT, getReq, loginAs, postJson, resetEvent, seedGuests, setupPins, svc, type TestGuest } from './helpers';

const asAdmin = () => vi.mocked(getAdmin).mockResolvedValue({ email: 'dev-admin@example.com' });
const asNobody = () => vi.mocked(getAdmin).mockResolvedValue(null);
const json = (r: Response) => r.json();
const withId = (id: string) => ({ params: Promise.resolve({ id }) });
const withName = (name: string) => ({ params: Promise.resolve({ name }) });
let g: TestGuest[];

beforeAll(setupPins);
beforeEach(async () => {
  asAdmin();
  await resetEvent();
  await clearPrizes();
  g = await seedGuests(3);
  await arrive(g);
});
afterAll(async () => {
  await resetEvent();
  await clearPrizes();
});

describe('access', () => {
  it('answers 401 without an admin session, even with a station cookie', async () => {
    asNobody();
    const station = await loginAs('draw');
    expect((await listPrizes(getReq('/api/admin/prizes', station))).status).toBe(401);
    expect((await dashboard(getReq('/api/admin/dashboard', station))).status).toBe(401);
    expect((await report(getReq('/api/admin/reports/guests', station), withName('guests'))).status).toBe(401);
    expect((await stageKey(postJson('/api/admin/settings/stage-key', {}, station))).status).toBe(401);
  });
});

describe('prizes', () => {
  it('creates, updates and lists a prize', async () => {
    const c = await json(await savePrize(postJson('/api/admin/prizes', { name: 'T-Prize', tier: 'Utama', quantity: 2 })));
    expect(c.status).toBe('OK');
    const u = await json(await savePrize(postJson('/api/admin/prizes', { id: c.data.id, quantity: 5, draw_as_batch: true })));
    expect(u.status).toBe('OK');
    const list = await json(await listPrizes(getReq('/api/admin/prizes')));
    expect(list.data.prizes.find((p: { id: string }) => p.id === c.data.id)).toMatchObject({ name: 'T-Prize', quantity: 5, draw_as_batch: true });
  });
  it('reports a duplicate name, bad input, and an unknown prize', async () => {
    await newPrize({ name: 'T-Dup' });
    expect((await json(await savePrize(postJson('/api/admin/prizes', { name: 'T-Dup' })))).status).toBe('NAME_IN_USE');
    expect((await savePrize(postJson('/api/admin/prizes', { name: 'X', quantity: 0 }))).status).toBe(400);
    expect((await savePrize(postJson('/api/admin/prizes', { name: 'X', quantity: 501 }))).status).toBe(400);
    expect((await json(await savePrize(postJson('/api/admin/prizes', { name: '   ' })))).status).toBe('INVALID');
    expect((await json(await savePrize(postJson('/api/admin/prizes', { id: '00000000-0000-4000-8000-00000000dead', name: 'Z' })))).status).toBe('NOT_FOUND');
  });
  it('deletes a prize without draws and refuses one with draws', async () => {
    const free = await newPrize({ name: 'T-Free' });
    expect((await json(await deletePrize(postJson(`/api/admin/prizes/${free}/delete`, {}), withId(free)))).status).toBe('OK');
    const used = await newPrize({ name: 'T-Used' });
    const { data } = await svc().rpc('draw_prize', { p_event: EVENT, p_prize_id: used, p_request_id: crypto.randomUUID(), p_actor: 'test' });
    expect(data.status).toBe('DRAWN');
    expect((await json(await deletePrize(postJson(`/api/admin/prizes/${used}/delete`, {}), withId(used)))).status).toBe('HAS_DRAWS');
    expect((await deletePrize(postJson('/api/admin/prizes/nope/delete', {}), withId('nope'))).status).toBe(400);
  });
});

describe('draws', () => {
  async function confirmedDraw() {
    const p = await newPrize({ name: 'T-Void', quantity: 2 });
    const { data } = await svc().rpc('draw_prize', { p_event: EVENT, p_prize_id: p, p_request_id: crypto.randomUUID(), p_actor: 'draw' });
    await svc().rpc('resolve_draw', { p_event: EVENT, p_draw_id: data.draws[0].id, p_outcome: 'confirm', p_actor: 'draw' });
    return data.draws[0] as { id: string; name: string };
  }
  it('lists draws with names, newest first', async () => {
    const d = await confirmedDraw();
    const j = await json(await listDraws(getReq('/api/admin/draws')));
    expect(j.data.draws[0]).toMatchObject({ id: d.id, name: d.name, status: 'confirmed', prize: 'T-Void' });
  });
  it('voids a confirmed draw with a reason, blanks the stage, and audits it', async () => {
    const d = await confirmedDraw();
    expect((await json(await voidDraw(postJson(`/api/admin/draws/${d.id}/void`, { reason: 'ok' }), withId(d.id)))).status).toBe('REASON_REQUIRED');
    expect((await json(await voidDraw(postJson(`/api/admin/draws/${d.id}/void`, { reason: 'Winner is a contractor' }), withId(d.id)))).status).toBe('OK');
    expect((await stageRow()).phase).toBe('idle');
    expect((await json(await voidDraw(postJson(`/api/admin/draws/${d.id}/void`, { reason: 'Winner is a contractor' }), withId(d.id)))).status).toBe('NOT_VOIDABLE');
    const { count } = await svc().from('audit_log').select('id', { count: 'exact', head: true }).eq('event_id', EVENT).eq('action', 'draw_void_admin');
    expect(count).toBe(1);
    expect((await voidDraw(postJson('/api/admin/draws/nope/void', { reason: 'long enough' }), withId('nope'))).status).toBe(400);
  });
});

describe('dashboard', () => {
  it('keeps Plan 1 fields and adds outlets, prizes, draw counters and the stage', async () => {
    await newPrize({ name: 'T-Dash', quantity: 3 });
    const j = await json(await dashboard(getReq('/api/admin/dashboard')));
    expect(j.data.counts).toMatchObject({ checked_in: 3, mode: 'rehearsal' });
    expect(j.data.recent.length).toBeLessThanOrEqual(10);
    expect(j.data.outlets[0]).toMatchObject({ outlet: 'Outlet A', checked_in: 3 });
    expect(j.data.prizes.find((p: { name: string }) => p.name === 'T-Dash').remaining).toBe(3);
    expect(j.data.draw).toMatchObject({ confirmed: 0, pending: 0, eligible: 3 });
    expect(j.data.stage).toMatchObject({ phase: 'idle', heartbeat_age: null });
  });
});

describe('reports', () => {
  const parse = (csv: string) => Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: true });

  it.each(['guests', 'check-ins', 'merchandise', 'draws', 'audit', 'rsvp-pending'])('downloads %s as CSV and audits the export', async (name) => {
    const res = await report(getReq(`/api/admin/reports/${name}`), withName(name));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain(`nourishfest-`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(parse(text).meta.fields!.length).toBeGreaterThan(3);
    const { count } = await svc().from('audit_log').select('id', { count: 'exact', head: true }).eq('event_id', EVENT).eq('action', 'report_exported');
    expect(count).toBeGreaterThanOrEqual(1);
  });
  it('contains the real rows, in WITA, with formulas neutralised', async () => {
    await svc().from('guests').update({ full_name: '=HYPERLINK("http://x")' }).eq('id', g[0].id);
    const guests = parse(await (await report(getReq('/api/admin/reports/guests'), withName('guests'))).text());
    expect(guests.data.find((r) => r['Employee ID'] === 'T1')!.Name).toBe(`'=HYPERLINK("http://x")`);
    const cis = parse(await (await report(getReq('/api/admin/reports/check-ins'), withName('check-ins'))).text());
    expect(cis.data).toHaveLength(3);
    expect(cis.data[0].Time).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
  });
  it('rejects an unknown report name', async () => {
    expect((await report(getReq('/api/admin/reports/passwords'), withName('passwords'))).status).toBe(400);
    expect((await report(getReq('/api/admin/reports/__proto__'), withName('__proto__'))).status).toBe(400);
  });
});

describe('audit', () => {
  it('pages newest first', async () => {
    const a = await json(await auditRoute(getReq('/api/admin/audit?limit=2')));
    expect(a.data.rows).toHaveLength(2);
    const next = await json(await auditRoute(getReq(`/api/admin/audit?limit=2&before=${a.data.rows[1].id}`)));
    expect(next.data.rows[0].id).toBeLessThan(a.data.rows[1].id);
  });
  it('ignores a silly limit', async () => {
    expect((await auditRoute(getReq('/api/admin/audit?limit=abc&before=xyz'))).status).toBe(200);
  });
});

describe('stage settings', () => {
  const DEFAULTS = { safe_mode: false, reduce_effects: false, language: 'en' };
  const restore = () => stageOptions(postJson('/api/admin/settings/stage-options', DEFAULTS));

  it('creates a key once, stores only a hash, and the key works on the stage', async () => {
    await svc().from('events').update({ display_key_hash: null }).eq('id', EVENT);
    expect((await json(await stageInfo(getReq('/api/admin/stage')))).data).toMatchObject({ key_set: false });
    const j = await json(await stageKey(postJson('/api/admin/settings/stage-key', {})));
    expect(j.status).toBe('OK');
    expect(j.data.key).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(j.data.url).toBe(`${process.env.APP_URL!.replace(/\/+$/, '')}/stage?key=${j.data.key}`);
    const { data } = await svc().from('events').select('display_key_hash').eq('id', EVENT).single();
    expect(data!.display_key_hash).not.toContain(j.data.key);
    const verify = await svc().rpc('verify_stage_key', { p_event: EVENT, p_key: j.data.key, p_ip_key: 'test' });
    expect(verify.data.status).toBe('OK');
    expect((await json(await stageInfo(getReq('/api/admin/stage')))).data.key_set).toBe(true);
    const { data: rows } = await svc().from('audit_log').select('details').eq('event_id', EVENT);
    expect(JSON.stringify(rows)).not.toContain(j.data.key);
  });

  it('changes the options and refuses nonsense', async () => {
    await restore();
    expect((await json(await stageOptions(postJson('/api/admin/settings/stage-options', { safe_mode: true, language: 'id' })))).status).toBe('OK');
    expect((await stageRow()).options).toMatchObject({ safe_mode: true, reduce_effects: false, language: 'id' });
    expect((await stageOptions(postJson('/api/admin/settings/stage-options', {}))).status).toBe(400);
    expect((await stageOptions(postJson('/api/admin/settings/stage-options', { language: 'fr' }))).status).toBe(400);
    expect((await stageOptions(postJson('/api/admin/settings/stage-options', { sneaky: true }))).status).toBe(400);
    await restore(); // options survive the rehearsal reset, so leave the dev event the way the other tests expect it
  });
});
