import Papa from 'papaparse';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/admin-auth', () => ({ getAdmin: vi.fn() }));

import { getAdmin } from '@/lib/admin-auth';
import { GET as invitations } from '@/app/api/admin/invitations.csv/route';
import { GET as listGuests, POST as updateGuest } from '@/app/api/admin/guests/route';
import { POST as walkIn } from '@/app/api/admin/guests/walk-in/route';
import { POST as commit } from '@/app/api/admin/import/commit/route';
import { POST as preview } from '@/app/api/admin/import/preview/route';
import { GET as listRedemptions } from '@/app/api/admin/redemptions/route';
import { POST as voidRedemption } from '@/app/api/admin/redemptions/[id]/void/route';
import { EVENT, getReq, loginAs, postJson, resetEvent, seedGuests, setupPins, svc, type TestGuest } from './helpers';

const asAdmin = () => vi.mocked(getAdmin).mockResolvedValue({ email: 'dev-admin@example.com' });
const asNobody = () => vi.mocked(getAdmin).mockResolvedValue(null);
const json = (r: Response) => r.json();
const CSV_OK = 'Employee ID,Nama,Outlet,No HP\nX1,Ayu Lestari,Outlet A,0812-3456-7001\nX2,Bagus,Outlet B,\n';

async function cleanup() {
  await svc().from('guests').delete().eq('event_id', EVENT).or('employee_id.like.X*,employee_id.like.WALKIN-*');
}

beforeAll(setupPins);
beforeEach(async () => {
  asAdmin();
  await resetEvent();
  await cleanup();
});
afterAll(cleanup);

describe('access', () => {
  it('answers 401 without an admin session, even with a station cookie', async () => {
    asNobody();
    const station = await loginAs('checkin');
    const res = await preview(postJson('/api/admin/import/preview', { csv: CSV_OK }, station));
    expect(res.status).toBe(401);
    expect((await listGuests(getReq('/api/admin/guests', station))).status).toBe(401);
  });
  it('rejects a cross-origin POST', async () => {
    const req = new Request('http://localhost/api/admin/import/preview', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify({ csv: CSV_OK }),
    });
    expect((await preview(req)).status).toBe(403);
  });
});

describe('import', () => {
  const countX = async () => (await svc().from('guests').select('id', { count: 'exact', head: true }).eq('event_id', EVENT).like('employee_id', 'X%')).count;

  it('previews without writing', async () => {
    const j = await json(await preview(postJson('/api/admin/import/preview', { csv: CSV_OK })));
    expect(j).toMatchObject({ status: 'OK', data: { would_insert: 2, would_update: 0 } });
    expect(await countX()).toBe(0);
  });
  it('lists every problem at once and blocks the commit', async () => {
    const bad = 'employee_id,full_name,outlet,phone\nX1,Ayu,O,123\nX1,Bagus,O,\n';
    const p = await json(await preview(postJson('/api/admin/import/preview', { csv: bad })));
    expect(p.status).toBe('HAS_ERRORS');
    const codes = p.data.errors.map((e: { code: string }) => e.code).sort();
    expect(codes).toEqual(['DUPLICATE_IN_FILE', 'DUPLICATE_IN_FILE', 'INVALID_PHONE']);
    const c = await json(await commit(postJson('/api/admin/import/commit', { csv: bad })));
    expect(c.status).toBe('HAS_ERRORS');
    expect(await countX()).toBe(0);
  });
  it('rejects names over 120 characters', async () => {
    const csv = `employee_id,full_name,outlet\nX1,${'A'.repeat(121)},Outlet A\n`;
    const j = await json(await preview(postJson('/api/admin/import/preview', { csv })));
    expect(j.status).toBe('HAS_ERRORS');
    expect(j.data.errors).toEqual([{ row: 2, field: 'full_name', code: 'TOO_LONG' }]);
  });
  it('reports a file without the required columns', async () => {
    const j = await json(await preview(postJson('/api/admin/import/preview', { csv: 'a,b\n1,2\n' })));
    expect(j).toMatchObject({ status: 'BAD_COLUMNS' });
    expect(j.data.missingColumns).toContain('employee_id');
  });
  it('commits, then flags guests missing from the next file instead of deleting them', async () => {
    const c1 = await json(await commit(postJson('/api/admin/import/commit', { csv: CSV_OK })));
    expect(c1).toMatchObject({ status: 'OK', data: { inserted: 2 } });
    const c2 = await json(await commit(postJson('/api/admin/import/commit', { csv: 'employee_id,full_name,outlet\nX1,Ayu Lestari,Outlet A\n' })));
    expect(c2.data).toMatchObject({ inserted: 0, updated: 1 });
    const { data: x2 } = await svc().from('guests').select('flagged_missing, active').eq('event_id', EVENT).eq('employee_id', 'X2').single();
    expect(x2).toEqual({ flagged_missing: true, active: true });
  });
});

describe('guests', () => {
  let g: TestGuest[];
  beforeEach(async () => { g = await seedGuests(2); });

  it('lists and filters', async () => {
    const all = await json(await listGuests(getReq('/api/admin/guests?q=test%20guest%201')));
    expect(all.data.guests.map((x: { employee_id: string }) => x.employee_id)).toEqual(['T1']);
    const none = await json(await listGuests(getReq('/api/admin/guests?outlet=Nowhere')));
    expect(none.data.guests).toEqual([]);
  });
  it('updates a guest and normalises the phone', async () => {
    const j = await json(await updateGuest(postJson('/api/admin/guests', { guest_id: g[0].id, changes: { full_name: 'Renamed Guest', phone: '0812 3456 7002' } })));
    expect(j.status).toBe('OK');
    const { data } = await svc().from('guests').select('full_name, phone').eq('id', g[0].id).single();
    expect(data).toEqual({ full_name: 'Renamed Guest', phone: '+6281234567002' });
    await svc().from('guests').update({ full_name: g[0].full_name }).eq('id', g[0].id);
  });
  it('rejects a bad phone, an unknown guest and unknown fields', async () => {
    expect((await json(await updateGuest(postJson('/api/admin/guests', { guest_id: g[0].id, changes: { phone: '12' } })))).status).toBe('INVALID_PHONE');
    expect((await json(await updateGuest(postJson('/api/admin/guests', { guest_id: crypto.randomUUID(), changes: { outlet: 'B' } })))).status).toBe('NOT_FOUND');
    expect((await updateGuest(postJson('/api/admin/guests', { guest_id: g[0].id, changes: { invite_token: 'x' } }))).status).toBe(400);
  });
  it('adds a walk-in with a working pass link', async () => {
    const j = await json(await walkIn(postJson('/api/admin/guests/walk-in', { full_name: 'Tamu Baru', outlet: 'Outlet A' })));
    expect(j.status).toBe('OK');
    expect(j.data.employee_id).toMatch(/^WALKIN-\d+$/);
    expect(j.data.pass_url).toBe(`${process.env.APP_URL}/pass/${j.data.invite_token}`);
    const { data } = await svc().rpc('get_pass', { p_token: j.data.invite_token });
    expect(data.status).toBe('OK');
  });
  it('refuses a walk-in without a name', async () => {
    expect((await json(await walkIn(postJson('/api/admin/guests/walk-in', { full_name: ' ', outlet: 'A' })))).status).toBe('INVALID');
  });
  it('filters the invitation export by outlet', async () => {
    const parse = async (res: Response) =>
      Papa.parse<Record<string, string>>((await res.text()).replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: true }).data;
    const some = await parse(await invitations(getReq('/api/admin/invitations.csv?outlet=Outlet%20A')));
    expect(some.some((r) => r.employee_id === 'T1')).toBe(true);
    expect(some.every((r) => r.outlet === 'Outlet A')).toBe(true);
    expect(await parse(await invitations(getReq('/api/admin/invitations.csv?outlet=Nowhere')))).toEqual([]);
  });
  it('exports invitations with each active employee’s personal link and audits the download', async () => {
    const res = await invitations(getReq('/api/admin/invitations.csv'));
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const rows = Papa.parse<Record<string, string>>((await res.text()).replace(/^﻿/, ''), { header: true, skipEmptyLines: true }).data;
    const mine = rows.find((r) => r.employee_id === 'T1')!;
    expect(mine.pass_link).toBe(`${process.env.APP_URL}/pass/${g[0].invite_token}`);
    const { count } = await svc().from('audit_log').select('id', { count: 'exact', head: true }).eq('event_id', EVENT).eq('action', 'invitations_exported');
    expect(count).toBe(1);
  });
});

describe('merchandise voids', () => {
  let g: TestGuest[];
  beforeEach(async () => {
    g = await seedGuests(1);
    await svc().rpc('check_in', { p_event: EVENT, p_token: g[0].invite_token, p_guest_id: null, p_method: 'scan', p_station_label: 'Meja 1', p_actor: 'test' });
    await svc().rpc('redeem_merchandise', { p_event: EVENT, p_token: g[0].merch_token, p_guest_id: null, p_station_label: 'Booth 1', p_actor: 'test' });
  });
  const voidCall = (id: string, reason: string) =>
    voidRedemption(postJson(`/api/admin/redemptions/${id}/void`, { reason }), { params: Promise.resolve({ id }) });

  it('lists redemptions with the guest', async () => {
    const j = await json(await listRedemptions(getReq('/api/admin/redemptions')));
    expect(j.data.redemptions[0]).toMatchObject({ status: 'redeemed', station_label: 'Booth 1', guest: { employee_id: 'T1' } });
  });
  it('voids with a reason, frees the guest to collect again, and keeps the audit trail', async () => {
    const id = (await json(await listRedemptions(getReq('/api/admin/redemptions')))).data.redemptions[0].id;
    expect((await json(await voidCall(id, 'abc'))).status).toBe('REASON_REQUIRED');
    expect((await json(await voidCall(id, 'Wrong size, exchanged by mistake'))).status).toBe('OK');
    expect((await json(await voidCall(id, 'Second attempt on same row'))).status).toBe('NOT_FOUND');
    const { data } = await svc().rpc('redeem_lookup', { p_event: EVENT, p_token: g[0].merch_token, p_guest_id: null });
    expect(data.status).toBe('READY');
  });
  it('rejects a malformed id', async () => {
    expect((await voidCall('not-a-uuid', 'Some valid reason')).status).toBe(400);
  });
});
