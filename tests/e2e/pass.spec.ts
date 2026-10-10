import { expect, test } from '@playwright/test';
import { checkInViaDb, noHorizontalScroll, prepare } from './helpers';

test('pass renders at 360 px in English (default) and Indonesian, with safe headers', async ({ page }) => {
  const [g] = await prepare(1);
  const res = await page.goto(`/pass/${g.invite_token}`);
  const h = res!.headers();
  expect(h['referrer-policy']).toBe('no-referrer');
  expect(h['x-robots-tag']).toContain('noindex');
  expect(h['cache-control']).toContain('no-store'); // Next adds must-revalidate to dynamic pages

  await expect(page.getByText('CHECK-IN PASS', { exact: true })).toBeVisible();
  const qr = page.getByRole('img', { name: /QR check-in/ });
  await expect(qr).toBeVisible();
  // Version 3 symbol (29 modules) plus a 4-module quiet zone each side is 37 modules: whole pixels per module, at least 5.
  const box = (await qr.boundingBox())!;
  expect(box.width / 37).toBeGreaterThanOrEqual(5);
  expect(Number.isInteger(box.width / 37)).toBe(true);
  await noHorizontalScroll(page);

  await page.getByRole('button', { name: 'ID' }).click();
  await expect(page.getByText('PASS CHECK-IN', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: "AKU IKUT" })).toBeVisible();
  await noHorizontalScroll(page);
});

test('RSVP is saved and survives a reload', async ({ page }) => {
  const [g] = await prepare(1);
  await page.goto(`/pass/${g.invite_token}`);
  await page.getByRole('button', { name: "I'M IN" }).click();
  await expect(page.getByText("You're in. See you on 10 December!")).toBeVisible();
  await page.reload();
  await expect(page.getByText("You're in. See you on 10 December!")).toBeVisible();
});

test('an unknown link shows a neutral message and no guest data', async ({ page }) => {
  await prepare(1);
  await page.goto('/pass/AAAAAAAAAAAAAAAAAAAAAA');
  await expect(page.getByText('LINK NOT RECOGNISED')).toBeVisible();
  await expect(page.getByText('Test Guest')).toHaveCount(0);
});

test('after check-in the pass shows the fixed prize number and the merchandise QR', async ({ page }) => {
  const [g] = await prepare(1);
  await checkInViaDb(g);
  await page.goto(`/pass/${g.invite_token}`);
  await expect(page.getByText('DOOR PRIZE NUMBER')).toBeVisible();
  await expect(page.getByText('001', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /QR merchandise/ })).toBeVisible();
  await noHorizontalScroll(page);
  await page.getByRole('button', { name: 'ID' }).click();
  await expect(page.getByText('NOMOR DOOR PRIZE')).toBeVisible();
  await noHorizontalScroll(page);
});
