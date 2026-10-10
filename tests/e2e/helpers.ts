import { assertTestEnv } from '../../scripts/guard-test-env.mjs';
assertTestEnv();
import { createClient } from '@supabase/supabase-js';
import { expect, type Page } from '@playwright/test';

export const EVENT = process.env.EVENT_ID!;
export const PINS = { checkin: '111111', merchandise: '222222', draw: '333333', prizes: '444444', admin: '555555' };
export const svc = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export type E2eGuest = { id: string; full_name: string; invite_token: string; merch_token: string };

/** Known PINs, an empty rehearsal event, and n guests (employee ids T1..Tn). */
export async function prepare(n = 1): Promise<E2eGuest[]> {
  const s = svc();
  for (const [role, pin] of Object.entries(PINS)) {
    const { error } = await s.rpc('set_station_pin', { p_event: EVENT, p_role: role, p_pin: pin, p_actor: 'e2e' });
    if (error) throw error;
  }
  const reset = await s.rpc('reset_rehearsal_data', { p_event: EVENT, p_actor: 'e2e' });
  if (reset.error || reset.data?.status !== 'OK') throw new Error('reset failed: the dev event must be in rehearsal mode');
  const rows = Array.from({ length: n }, (_, i) => ({
    row_no: i + 2, employee_id: `T${i + 1}`, full_name: `Test Guest ${i + 1}`, outlet: 'Outlet A', phone: '+628123450000',
  }));
  const imp = await s.rpc('import_guests', { p_event: EVENT, p_rows: rows, p_filename: 'e2e.csv', p_actor: 'e2e' });
  if (imp.error || imp.data?.status !== 'OK') throw new Error('import failed');
  // import_guests keeps RSVP and activation, so a rerun would otherwise start from the previous run's answers
  await s.from('guests').update({ active: true, rsvp_status: 'pending', first_opened_at: null }).eq('event_id', EVENT).like('employee_id', 'T%');
  const { data } = await s.from('guests').select('id, full_name, invite_token, merch_token')
    .eq('event_id', EVENT).like('employee_id', 'T%').order('employee_id');
  return (data ?? []).slice(0, n) as E2eGuest[];
}

export async function checkInViaDb(g: E2eGuest) {
  const { data, error } = await svc().rpc('check_in', {
    p_event: EVENT, p_token: g.invite_token, p_guest_id: null, p_method: 'scan', p_station_label: 'Meja 1', p_actor: 'e2e',
  });
  if (error || data?.status !== 'CHECKED_IN') throw new Error('check-in setup failed');
}

export async function stationLogin(page: Page, pin: string, label: string, home: string) {
  await page.goto('/station');
  await page.getByPlaceholder('••••••').fill(pin);
  await page.getByRole('button', { name: 'LOG IN' }).click();
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('button', { name: 'CONTINUE' }).click();
  await page.waitForURL(`**${home}`);
}

/** Stands in for the camera: hands a decoded QR string to the scanner. */
export async function inject(page: Page, code: string) {
  await page.waitForFunction(() => typeof (window as unknown as { __nfInjectCode?: unknown }).__nfInjectCode === 'function');
  await page.evaluate((c) => (window as unknown as { __nfInjectCode: (x: string) => void }).__nfInjectCode(c), code);
}

export async function noHorizontalScroll(page: Page) {
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits, 'page is wider than the 360 px viewport').toBe(true);
}
