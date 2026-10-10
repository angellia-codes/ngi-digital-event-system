import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { arrive, clearPrizes, newPrize } from './draw-helpers';
import { EVENT, resetEvent, seedGuests, svc } from './helpers';

const mk = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
// `stage_state` is not in this list: it is the one table a browser may read (see the last two blocks).
const TABLES = [
  'events', 'admins', 'station_pins', 'auth_attempts', 'import_batches', 'guests', 'check_ins', 'merchandise_redemptions',
  'attempt_log', 'audit_log', 'prizes', 'draws', 'stage_heartbeat',
];
const NIL = '00000000-0000-4000-8000-000000000000';
const FUNCTIONS: [string, Record<string, unknown>][] = [
  ['get_pass', { p_token: 'AAAAAAAAAAAAAAAAAAAAAA' }],
  ['verify_pin', { p_event: EVENT, p_pin: '111111', p_device_key: 'x', p_ip_key: 'x' }],
  ['check_in', { p_event: EVENT, p_token: 'AAAAAAAAAAAAAAAAAAAAAA', p_guest_id: null, p_method: 'scan', p_station_label: 'x', p_actor: 'x' }],
  ['redeem_merchandise', { p_event: EVENT, p_token: 'AAAAAAAAAAAAAAAAAAAAAA', p_guest_id: null, p_station_label: 'x', p_actor: 'x' }],
  ['void_redemption', { p_event: EVENT, p_redemption_id: NIL, p_reason: 'none', p_actor: 'x' }],
  ['import_guests', { p_event: EVENT, p_rows: [], p_filename: 'x', p_actor: 'x' }],
  ['set_station_pin', { p_event: EVENT, p_role: 'checkin', p_pin: '123456', p_actor: 'x' }],
  ['is_admin', { p_event: EVENT, p_email: 'dev-admin@example.com' }],
  ['go_live', { p_event: EVENT, p_actor: 'x' }],
  ['reset_rehearsal_data', { p_event: EVENT, p_actor: 'x' }],
  ['event_counts', { p_event: EVENT }],
  // Plan 2. Every function, including the internal helpers: a browser must not be able to write a name to the stage.
  ['prize_list', { p_event: EVENT }],
  ['admin_save_prize', { p_event: EVENT, p_id: null, p_data: { name: 'x' }, p_actor: 'x' }],
  ['admin_delete_prize', { p_event: EVENT, p_id: NIL, p_actor: 'x' }],
  ['get_stage', { p_event: EVENT }],
  ['set_stage', { p_event: EVENT, p_phase: 'idle', p_prize_id: null, p_actor: 'x' }],
  ['set_stage_options', { p_event: EVENT, p_options: { safe_mode: true }, p_actor: 'x' }],
  ['touch_stage_heartbeat', { p_event: EVENT }],
  ['stage_heartbeat_age', { p_event: EVENT }],
  ['set_stage_key', { p_event: EVENT, p_key: 'x'.repeat(24), p_actor: 'x' }],
  ['stage_key_tag', { p_event: EVENT }],
  ['verify_stage_key', { p_event: EVENT, p_key: 'x', p_ip_key: 'x' }],
  ['draw_prize', { p_event: EVENT, p_prize_id: NIL, p_request_id: NIL, p_actor: 'x' }],
  ['draw_current', { p_event: EVENT }],
  ['lookup_prize_number', { p_event: EVENT, p_number: 1 }],
  ['resolve_draw', { p_event: EVENT, p_draw_id: NIL, p_outcome: 'confirm', p_actor: 'x' }],
  ['resolve_round', { p_event: EVENT, p_round: NIL, p_actor: 'x' }],
  ['admin_void_draw', { p_event: EVENT, p_draw_id: NIL, p_reason: 'none', p_actor: 'x' }],
  ['admin_dashboard', { p_event: EVENT }],
  ['admin_draw_list', { p_event: EVENT }],
  ['admin_audit_list', { p_event: EVENT, p_before: null, p_limit: 10 }],
  ['report_rows', { p_event: EVENT, p_report: 'guests' }],
  ['round_json', { p_event: EVENT, p_round: NIL }],
  ['stage_write', { p_event: EVENT, p_phase: 'idle', p_payload: {} }],
  ['stage_payload', { p_event: EVENT, p_round: NIL }],
  ['stage_publish', { p_event: EVENT, p_round: NIL }],
  ['actor_type_of', { p_actor: 'x' }],
];

const EMAIL = 'security-test@example.com';
const PASSWORD = 'Sec-test-pass-12345';
let anonClient: SupabaseClient;
let authedClient: SupabaseClient;
let userId: string | undefined;

beforeAll(async () => {
  anonClient = mk();
  const admin = svc().auth.admin;
  const created = await admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  userId = created.data.user?.id ?? (await admin.listUsers()).data.users.find((u) => u.email === EMAIL)?.id;
  authedClient = mk();
  const { error } = await authedClient.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  expect(error).toBeNull(); // a signed-in Google admin is the `authenticated` role, so it must be locked out too
});
afterAll(async () => {
  if (userId) await svc().auth.admin.deleteUser(userId);
  await resetEvent();
  await clearPrizes();
});

const roles = [['anon', () => anonClient], ['authenticated', () => authedClient]] as const;

describe.each(roles)('%s role', (_name, client) => {
  it.each(TABLES)('cannot read %s', async (table) => {
    const { data, error } = await client().from(table).select('*').limit(1);
    expect(error?.code).toBe('42501');
    expect(data).toBeNull();
  });
  it.each(TABLES)('cannot write %s', async (table) => {
    const { error } = await client().from(table).insert({});
    expect(error?.code).toBe('42501');
  });
  it.each(FUNCTIONS)('cannot call %s', async (fn, args) => {
    const { error } = await client().rpc(fn, args);
    expect(error?.code).toBe('42501');
  });
});

describe.each(roles)('%s role and stage_state', (_name, client) => {
  it('can read the stage row (the projector does this with the anon key)', async () => {
    const { data, error } = await client().from('stage_state').select('rev, phase, payload, options').eq('event_id', EVENT);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
  it('cannot insert, change or delete it', async () => {
    expect((await client().from('stage_state').insert({ event_id: EVENT })).error?.code).toBe('42501');
    expect((await client().from('stage_state').update({ rev: 999 }).eq('event_id', EVENT)).error?.code).toBe('42501');
    expect((await client().from('stage_state').delete().eq('event_id', EVENT)).error?.code).toBe('42501');
  });
});

describe('what the one readable row contains', () => {
  beforeEach(async () => {
    await resetEvent();
    await clearPrizes();
  });

  it('holds the number but no name, outlet or department until the draw is confirmed', async () => {
    const guests = await seedGuests(3);
    await arrive(guests);
    const prize = await newPrize({ name: 'Smart TV', quantity: 1 });
    const drawn = await svc().rpc('draw_prize', { p_event: EVENT, p_prize_id: prize, p_request_id: crypto.randomUUID(), p_actor: 'test' });
    expect(drawn.data.status).toBe('DRAWN');
    const winner = drawn.data.draws[0] as { id: string; name: string; number: number };

    const read = () => anonClient.from('stage_state').select('*').eq('event_id', EVENT).single();
    const before = await read();
    const text = JSON.stringify(before.data).toLowerCase();
    expect(text).not.toContain(winner.name.toLowerCase());
    expect(text).not.toContain('test guest');
    expect(text).not.toContain('outlet a');
    const slot = before.data!.payload.slots[0];
    expect(slot).toMatchObject({ number: winner.number, state: 'rolling' });
    expect(slot).not.toHaveProperty('name');
    expect(slot).not.toHaveProperty('outlet');
    expect(slot).not.toHaveProperty('department');

    const done = await svc().rpc('resolve_draw', { p_event: EVENT, p_draw_id: winner.id, p_outcome: 'confirm', p_actor: 'test' });
    expect(done.data.status).toBe('CONFIRMED');
    const after = await read();
    expect(after.data!.rev).toBeGreaterThan(before.data!.rev);
    expect(after.data!.payload.slots[0]).toMatchObject({ number: winner.number, state: 'revealed', name: winner.name });
  });

  it('never holds a no-show winner’s name either', async () => {
    const guests = await seedGuests(3);
    await arrive(guests);
    const prize = await newPrize({ name: 'Smart TV', quantity: 1 });
    const drawn = await svc().rpc('draw_prize', { p_event: EVENT, p_prize_id: prize, p_request_id: crypto.randomUUID(), p_actor: 'test' });
    const winner = drawn.data.draws[0] as { id: string; name: string };
    await svc().rpc('resolve_draw', { p_event: EVENT, p_draw_id: winner.id, p_outcome: 'no_show', p_actor: 'test' });
    const { data } = await anonClient.from('stage_state').select('*').eq('event_id', EVENT).single();
    expect(JSON.stringify(data).toLowerCase()).not.toContain(winner.name.toLowerCase());
    expect(data!.phase).toBe('void');
  });
});
