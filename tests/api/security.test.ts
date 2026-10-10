import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EVENT, svc } from './helpers';

const mk = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const TABLES = ['events', 'admins', 'station_pins', 'auth_attempts', 'import_batches', 'guests', 'check_ins', 'merchandise_redemptions', 'attempt_log', 'audit_log'];
const FUNCTIONS: [string, Record<string, unknown>][] = [
  ['get_pass', { p_token: 'AAAAAAAAAAAAAAAAAAAAAA' }],
  ['verify_pin', { p_event: EVENT, p_pin: '111111', p_device_key: 'x', p_ip_key: 'x' }],
  ['check_in', { p_event: EVENT, p_token: 'AAAAAAAAAAAAAAAAAAAAAA', p_guest_id: null, p_method: 'scan', p_station_label: 'x', p_actor: 'x' }],
  ['redeem_merchandise', { p_event: EVENT, p_token: 'AAAAAAAAAAAAAAAAAAAAAA', p_guest_id: null, p_station_label: 'x', p_actor: 'x' }],
  ['void_redemption', { p_event: EVENT, p_redemption_id: '00000000-0000-4000-8000-000000000000', p_reason: 'none', p_actor: 'x' }],
  ['import_guests', { p_event: EVENT, p_rows: [], p_filename: 'x', p_actor: 'x' }],
  ['set_station_pin', { p_event: EVENT, p_role: 'checkin', p_pin: '123456', p_actor: 'x' }],
  ['is_admin', { p_event: EVENT, p_email: 'dev-admin@example.com' }],
  ['go_live', { p_event: EVENT, p_actor: 'x' }],
  ['reset_rehearsal_data', { p_event: EVENT, p_actor: 'x' }],
  ['event_counts', { p_event: EVENT }],
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
});

describe.each([['anon', () => anonClient], ['authenticated', () => authedClient]] as const)('%s role', (_name, client) => {
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
