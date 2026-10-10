import { expect, test } from '@playwright/test';
import { checkInViaDb, inject, noHorizontalScroll, PINS, prepare, stationLogin } from './helpers';

const next = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'SCAN NEXT' }).click();
const title = (page: import('@playwright/test').Page, text: string) => expect(page.getByText(text, { exact: true })).toBeVisible();
// The scanner ignores an identical code for 2 seconds, so a deliberate repeat has to wait that long.
const waitOutDebounce = (page: import('@playwright/test').Page) => page.waitForTimeout(2100);

test('check-in desk: first scan, repeat scan, wrong QR, garbage', async ({ page }) => {
  const [a] = await prepare(1);
  await stationLogin(page, PINS.checkin, 'Meja 1', '/station/check-in');
  await noHorizontalScroll(page);

  await inject(page, `NF:CI:${a.invite_token}`);
  await title(page, 'CHECKED IN');
  await expect(page.getByText(a.full_name)).toBeVisible();
  await expect(page.getByText('001', { exact: true })).toBeVisible();
  await noHorizontalScroll(page);

  await next(page);
  await waitOutDebounce(page);
  await inject(page, `NF:CI:${a.invite_token}`);
  await title(page, 'ALREADY CHECKED IN');
  await expect(page.getByText(/No new number was created/)).toBeVisible();

  await next(page);
  await inject(page, `NF:MR:${a.merch_token}`);
  await title(page, 'NOT A CHECK-IN QR');

  await next(page);
  await inject(page, 'hello');
  await title(page, 'QR NOT RECOGNISED');
});

test('check-in desk: manual search finds a guest by name', async ({ page }) => {
  await prepare(2);
  await stationLogin(page, PINS.checkin, 'Meja 2', '/station/check-in');
  await page.getByRole('tab', { name: 'MANUAL SEARCH' }).click();
  await page.getByPlaceholder('Search name or employee ID').fill('guest 2');
  await page.getByText('Test Guest 2').click();
  await title(page, 'CHECKED IN');
});

test('merchandise booth: look up, hand over once, block the repeat and the wrong QR', async ({ page }) => {
  const [a, b] = await prepare(2);
  await checkInViaDb(a);
  await stationLogin(page, PINS.merchandise, 'Booth 1', '/station/merchandise');
  await noHorizontalScroll(page);

  await inject(page, `NF:MR:${a.merch_token}`);
  await title(page, 'READY TO HAND OVER');
  await page.getByRole('button', { name: 'HAND OVER MERCHANDISE' }).click();
  await title(page, 'RECORDED');

  await next(page);
  await waitOutDebounce(page);
  await inject(page, `NF:MR:${a.merch_token}`);
  await title(page, 'CLAIMED');

  await next(page);
  await inject(page, `NF:MR:${b.merch_token}`);
  await title(page, 'NOT CHECKED IN');

  await next(page);
  await inject(page, `NF:CI:${a.invite_token}`);
  await title(page, 'NOT A MERCHANDISE QR');

  await page.goto(`/pass/${a.invite_token}`);
  await expect(page.getByText('CLAIMED')).toBeVisible();
  await expect(page.getByRole('img', { name: /QR merchandise/ })).toHaveCount(0);
});

test('a wrong PIN is refused and a role without a screen yet says so', async ({ page }) => {
  await prepare(1);
  await page.goto('/station');
  await page.getByPlaceholder('••••••').fill('999999');
  await page.getByRole('button', { name: 'LOG IN' }).click();
  await expect(page.getByText('Wrong PIN')).toBeVisible();
  await page.getByPlaceholder('••••••').fill(PINS.draw);
  await page.getByRole('button', { name: 'LOG IN' }).click();
  await expect(page.getByText("This screen isn't available yet.")).toBeVisible(); // draw screen arrives with Plan 2
});
