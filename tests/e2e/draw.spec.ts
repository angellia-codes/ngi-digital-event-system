import { expect, test, type Page } from '@playwright/test';
import { prepareDraw } from './draw-helpers';
import { noHorizontalScroll, PINS, stationLogin } from './helpers';

const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const openMc = (page: Page) => stationLogin(page, PINS.draw, 'Meja 1', '/station/draw');
const recorded = (page: Page) => expect(page.getByText('RECORDED', { exact: true })).toBeVisible();

test('MC draws, sees the winner’s name, confirms and moves to the next prize', async ({ page }) => {
  await prepareDraw(3, [{ name: 'Smart TV', tier: 'HADIAH UTAMA' }, { name: 'Voucher' }]);
  await openMc(page);
  await expect(page.getByText('1 OF 1 LEFT').first()).toBeVisible();
  await noHorizontalScroll(page);

  await btn(page, 'DRAW NOW').click();
  // The operator sees the name even though the stage does not yet.
  await expect(page.locator('.winner__name')).toHaveText(/Test Guest \d/i);
  await expect(page.getByText('WINNER MUST BE PRESENT · 60 SECONDS')).toBeVisible();
  await noHorizontalScroll(page);

  await btn(page, 'ID').click();
  await expect(btn(page, 'KONFIRMASI')).toBeVisible();
  await noHorizontalScroll(page);
  await btn(page, 'EN').click();

  await btn(page, 'CONFIRM').click();
  await recorded(page);
  await btn(page, 'NEXT DRAW').click();
  await expect(page.getByRole('button', { name: /Voucher/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(btn(page, 'DRAW NOW')).toBeEnabled();
});

test('a no-show frees the slot and the redraw picks somebody else', async ({ page }) => {
  await prepareDraw(3, [{ name: 'Smart TV' }]);
  await openMc(page);
  await btn(page, 'DRAW NOW').click();
  const first = await page.locator('.winner__number').innerText();

  await btn(page, 'NOT HERE').click();
  await expect(page.getByText('NOT HERE — REDRAW')).toBeVisible();
  await btn(page, 'DRAW NOW').click();
  await expect(page.locator('.winner__number')).not.toHaveText(first);

  await btn(page, 'CONFIRM').click();
  await recorded(page);
});

test('a batch prize draws every slot at once; tiles confirm one by one or all together', async ({ page }) => {
  await prepareDraw(4, [{ name: 'Voucher 100K', quantity: 3, draw_as_batch: true }]);
  await openMc(page);
  await btn(page, 'DRAW 3 WINNERS').click();
  await expect(page.locator('.winner')).toHaveCount(3);
  await noHorizontalScroll(page);

  await btn(page, 'CONFIRM').first().click(); // one tile
  await expect(btn(page, 'CONFIRM')).toHaveCount(2); // the confirmed tile loses its buttons
  await btn(page, 'CONFIRM ALL').click();
  await recorded(page);
});

test('Prize Verification confirms for the MC, and looks numbers up', async ({ page, browser, baseURL }) => {
  await prepareDraw(3, [{ name: 'Smart TV' }]);
  await openMc(page);
  await btn(page, 'DRAW NOW').click();
  const number = await page.locator('.winner__number').innerText(); // "002"

  const ctx = await browser.newContext({ baseURL, viewport: { width: 360, height: 780 }, locale: 'id-ID', timezoneId: 'Asia/Makassar' });
  try {
    const desk = await ctx.newPage();
    await stationLogin(desk, PINS.prizes, 'Meja 1', '/station/prizes');
    await expect(desk.locator('.winner__number')).toHaveText(number);
    await noHorizontalScroll(desk);

    await desk.getByRole('button', { name: 'CONFIRM & HAND OVER', exact: true }).click();
    await expect(desk.getByText('No draw is waiting.')).toBeVisible();
    await recorded(page); // the MC screen follows within its 2-second poll

    const lookup = async (n: number) => {
      await desk.getByLabel('Door Prize number').fill(String(n));
      await desk.getByRole('button', { name: 'LOOK UP', exact: true }).click();
    };
    await lookup(Number(number));
    await expect(desk.getByText('CONFIRMED WINNER')).toBeVisible();
    await lookup(Number(number) === 1 ? 2 : 1);
    await expect(desk.getByText('NOT A WINNER')).toBeVisible();
    await lookup(999);
    await expect(desk.getByText('NUMBER NOT FOUND')).toBeVisible();
  } finally {
    await ctx.close();
  }
});
