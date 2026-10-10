import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { prepareDraw, STAGE_KEY } from './draw-helpers';
import { EVENT, PINS, stationLogin, svc } from './helpers';

const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const ROLL = { timeout: 12_000 }; // the number roll takes about 5 seconds

/** A projector: desktop-sized window, no touch, Indonesian locale. */
async function openStageContext(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  return browser.newContext({ baseURL, viewport: { width: 1280, height: 720 }, locale: 'id-ID', timezoneId: 'Asia/Makassar' });
}
const stageUrl = (key = STAGE_KEY) => `/stage?key=${encodeURIComponent(key)}`;

test('the stage shows the number only until the MC confirms, then the name', async ({ page, browser, baseURL }) => {
  await prepareDraw(3, [{ name: 'Smart TV', tier: 'HADIAH UTAMA' }]);
  const ctx = await openStageContext(browser, baseURL);
  try {
    const stage = await ctx.newPage();
    const frames: string[] = [];
    stage.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));

    // Entering with the key: the cookie is set and the key disappears from the address bar.
    await stage.goto(stageUrl());
    await expect(stage).toHaveURL(/\/stage$/);
    await expect(stage.getByText('THE DRAW STARTS SOON')).toBeVisible();
    expect(await stage.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await stationLogin(page, PINS.draw, 'Meja 1', '/station/draw');
    await btn(page, 'SHOW PRIZE').click();
    await expect(stage.getByText('HADIAH UTAMA · SMART TV')).toBeVisible();

    await btn(page, 'DRAW NOW').click();
    const name = (await page.locator('.winner__name').innerText()).trim(); // operator sees it
    const number = (await page.locator('.winner__number').innerText()).trim();

    // Rolling, then landed: the number and "waiting", never the name.
    await expect(stage.getByText('WINNING NUMBER')).toBeVisible();
    await expect(stage.locator('.num')).toHaveText(number, ROLL);
    await expect(stage.getByText('WAITING FOR THE WINNER...')).toBeVisible(ROLL);

    const visible = (await stage.locator('body').innerText()).toLowerCase();
    expect(visible).not.toContain(name.toLowerCase());
    expect(visible).not.toContain('test guest');
    const state = await (await ctx.request.get('/api/stage/state')).json();
    expect(JSON.stringify(state).toLowerCase()).not.toContain('test guest');
    expect(frames.join('\n').toLowerCase()).not.toContain('test guest'); // nothing on the Realtime socket either

    await btn(page, 'CONFIRM').click();
    await expect(stage.getByText(name)).toBeVisible();
    await expect(stage.getByText('DRAW 1 OF 1')).toBeVisible();
    await expect(stage.locator('.num')).toHaveClass(/num--small/);
    expect(await stage.getByText('Congratulations').count()).toBe(0);

    // A reload rebuilds the same picture from the database.
    await stage.reload();
    await expect(stage.getByText(name)).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test('a no-show shows the void message, then the banner, and the redraw rolls again', async ({ page, browser, baseURL }) => {
  await prepareDraw(3, [{ name: 'Smart TV', tier: 'HADIAH UTAMA' }], { reduce_effects: true });
  const ctx = await openStageContext(browser, baseURL);
  try {
    const stage = await ctx.newPage();
    await stage.goto(stageUrl());
    await stationLogin(page, PINS.draw, 'Meja 1', '/station/draw');
    await btn(page, 'DRAW NOW').click();
    await expect(stage.getByText('WINNING NUMBER')).toBeVisible();

    await btn(page, 'NOT HERE').click();
    await expect(stage.getByText('NOT HERE — REDRAW')).toBeVisible();
    await expect(stage.getByText('NOT HERE — REDRAW')).toBeHidden({ timeout: 8_000 }); // brief, then the banner returns
    await expect(stage.getByText('HADIAH UTAMA · SMART TV')).toBeVisible();

    await btn(page, 'DRAW NOW').click();
    await expect(stage.getByText('WAITING FOR THE WINNER...')).toBeVisible();
    await btn(page, 'CONFIRM').click();
    await expect(stage.locator('.name')).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test('a batch reveals tile by tile and the operator can blank the screen', async ({ page, browser, baseURL }) => {
  await prepareDraw(4, [{ name: 'Voucher 100K', tier: 'HIBURAN', quantity: 3, draw_as_batch: true }], { reduce_effects: true });
  const ctx = await openStageContext(browser, baseURL);
  try {
    const stage = await ctx.newPage();
    await stage.goto(stageUrl());
    await stationLogin(page, PINS.draw, 'Meja 1', '/station/draw');
    await btn(page, 'DRAW 3 WINNERS').click();
    await expect(stage.locator('.tile')).toHaveCount(3);
    await expect(stage.getByText('3 WINNERS')).toBeVisible();
    expect(await stage.locator('.tile__name').count()).toBe(0);

    await btn(page, 'CONFIRM').first().click();
    await expect(stage.locator('.tile__name')).toHaveCount(1);
    await btn(page, 'CONFIRM ALL').click();
    await expect(stage.locator('.tile__name')).toHaveCount(3);

    await btn(page, 'BLANK SCREEN').click();
    await expect(stage.getByText('THE DRAW STARTS SOON')).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test('stage options apply live; the projector-safe look hides the sound button', async ({ browser, baseURL }) => {
  await prepareDraw(1, [{ name: 'Smart TV' }]);
  const ctx = await openStageContext(browser, baseURL);
  try {
    const stage = await ctx.newPage();
    await stage.goto(stageUrl());
    await expect(stage.locator('.stage')).not.toHaveClass(/stage--safe/);
    await expect(stage.getByRole('button', { name: 'Turn on sound' })).toHaveCount(1);

    await svc().rpc('set_stage_options', { p_event: EVENT, p_options: { safe_mode: true }, p_actor: 'e2e' });
    await expect(stage.locator('.stage')).toHaveClass(/stage--safe/, { timeout: 10_000 });
    await expect(stage.getByRole('button', { name: 'Turn on sound' })).toHaveCount(0);

    await svc().rpc('set_stage_options', { p_event: EVENT, p_options: { language: 'id' }, p_actor: 'e2e' });
    await expect(stage.getByText('UNDIAN DIMULAI SEBENTAR LAGI')).toBeVisible({ timeout: 10_000 });
  } finally {
    await ctx.close();
  }
});

test('a wrong key is refused, and a new key signs the open display out', async ({ browser, baseURL }) => {
  await prepareDraw(1, [{ name: 'Smart TV' }]);
  const ctx = await openStageContext(browser, baseURL);
  try {
    const stage = await ctx.newPage();
    await stage.goto(stageUrl('not-the-key'));
    await expect(stage.getByText('The display key is not valid.')).toBeVisible();
    await expect(stage.getByText('THE DRAW STARTS SOON')).toHaveCount(0);

    await stage.goto(stageUrl());
    await expect(stage.getByText('THE DRAW STARTS SOON')).toBeVisible();
    const rotate = await svc().rpc('set_stage_key', { p_event: EVENT, p_key: 'another-key-0123456789abcdef-xyz', p_actor: 'e2e' });
    expect(rotate.data.status).toBe('OK');
    await expect(stage.getByText('The display key was replaced. Open the new display link.')).toBeVisible({ timeout: 12_000 }); // next heartbeat
    await stage.reload();
    await expect(stage.getByText('Open the stage link from Admin → Settings.')).toBeVisible();
  } finally {
    await ctx.close();
  }
});

test('polling takes over when Realtime is blocked', async ({ browser, baseURL }) => {
  await prepareDraw(2, [{ name: 'Smart TV' }], { reduce_effects: true });
  const ctx = await openStageContext(browser, baseURL);
  try {
    const stage = await ctx.newPage();
    await stage.routeWebSocket(/\/realtime\//, (ws) => ws.close()); // the socket never opens
    await stage.goto(stageUrl());
    await expect(stage.getByText('THE DRAW STARTS SOON')).toBeVisible();

    const { data: prizes } = await svc().from('prizes').select('id').eq('event_id', EVENT).limit(1);
    const drawn = await svc().rpc('draw_prize', { p_event: EVENT, p_prize_id: prizes![0].id, p_request_id: crypto.randomUUID(), p_actor: 'e2e' });
    expect(drawn.data.status).toBe('DRAWN');
    // 5 s before polling starts, then a 3 s interval.
    await expect(stage.getByText('WINNING NUMBER')).toBeVisible({ timeout: 20_000 });
  } finally {
    await ctx.close();
  }
});
