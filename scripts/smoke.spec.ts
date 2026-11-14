import { expect, test, type Page } from '@playwright/test';
import { BOARD_SIZE, newGame, productiveMoves } from '../src/engine';
import { computeLayout } from '../src/render/layout';

// Drives the real UI of the production build: no debug handle, only clicks.
const SHOTS = '.playwright-mcp';
// A fixed opening board (`?seed=N` works in production builds), checked below to have a
// productive swap, so the swap scan can't come up empty on an unlucky random deal.
const SEED = 3;
// The scan reaches seed 3's first productive swap on its third try; the cap only bounds a
// run where something else is wrong.
const MAX_SWAP_TRIES = 40;

// Every adjacent pair (horizontal and vertical), bottom row first, as [row1, col1, row2, col2].
const PAIRS: [number, number, number, number][] = [];
for (let r = BOARD_SIZE - 1; r >= 0; r--) {
  for (let c = 0; c < BOARD_SIZE; c++) {
    if (c + 1 < BOARD_SIZE) PAIRS.push([r, c, r, c + 1]);
    if (r > 0) PAIRS.push([r, c, r - 1, c]);
  }
}
const SCAN = PAIRS.slice(0, MAX_SWAP_TRIES);

/** True when the seed's opening board has a productive swap among the pairs the scan tries. */
function scanCanScore(seed: number): boolean {
  const key = (r1: number, c1: number, r2: number, c2: number) => [`${r1},${c1}`, `${r2},${c2}`].sort().join('|');
  const productive = new Set(productiveMoves(newGame(seed)).flatMap((m) =>
    m.type === 'swap' ? [key(m.a.row, m.a.col, m.b.row, m.b.col)] : []));
  return SCAN.some(([r1, c1, r2, c2]) => productive.has(key(r1, c1, r2, c2)));
}

async function boardCell(page: Page, row: number, col: number) {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('canvas has no box');
  const l = computeLayout(box.width, box.height);
  const step = l.cellPx;
  return { x: box.x + l.board.x + step * (col + 0.5), y: box.y + l.board.y + step * (row + 0.5) };
}

async function clickCell(page: Page, row: number, col: number) {
  const p = await boardCell(page, row, col);
  await page.mouse.click(p.x, p.y);
}

/** Any Google host: the tag, the collection endpoints and anything they might reach for. */
function isGoogle(url: URL): boolean {
  return /(^|\.)(google|googletagmanager|google-analytics|googleapis|gstatic|doubleclick)\.[a-z.]+$/.test(url.hostname);
}

/**
 * Listens for console errors, failed requests, CSP violations and Google requests. Every Google
 * request is answered here, so the run never makes a real external call: the tag gets an empty
 * 200 script, anything else an empty 204.
 */
async function watch(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  // Production answers a missing file with a real 404 (no SPA fallback), and so does
  // `vite preview` with appType 'mpa'. Nothing the page loads may fail.
  const failed: string[] = [];
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  const google: string[] = [];
  page.on('request', (r) => { if (isGoogle(new URL(r.url()))) google.push(r.url()); });
  await page.route(isGoogle, (route) => new URL(route.request().url()).pathname === '/gtag/js'
    ? route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
    : route.fulfill({ status: 204, body: '' }));
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  const csp = () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
  return { errors, failed, google, csp };
}

const banner = (page: Page) => page.getByRole('region', { name: 'Analytics cookies' });

test('voltline smoke: decline cookies, then play, hint, AI, no errors, no CSP violations', async ({ page }) => {
  const { errors, failed, google, csp } = await watch(page);

  // Reduced motion stops the idle glow breathing, so the idle board is static and any
  // canvas change after Hint can only come from the hint arrows.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(scanCanScore(SEED), `seed ${SEED} has a productive swap within the scan`).toBe(true);
  await page.goto(`/?seed=${SEED}`);
  const canvas = page.locator('canvas').first();
  await canvas.waitFor();
  // First visit: the banner asks, and declining closes it without a word to Google.
  await expect(banner(page)).toBeVisible();
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect(banner(page)).toBeHidden();
  await page.waitForTimeout(1500); // the opening deal

  const readScore = async () => {
    const m = /([\d,]+)\s*\n\s*Best/.exec(await page.locator('body').innerText());
    return m ? Number(m[1].replace(/,/g, '')) : -1;
  };
  expect(await readScore()).toBe(0);

  // Try adjacent pairs until one scores (the rest are invalid and slide back).
  let scored = false;
  for (const [r1, c1, r2, c2] of SCAN) {
    await clickCell(page, r1, c1);
    await page.waitForTimeout(150);
    await clickCell(page, r2, c2);
    await page.waitForTimeout(900);
    scored = (await readScore()) > 0;
    if (scored) break;
  }
  expect(scored, 'at least one swap was valid and scored').toBe(true);
  await page.waitForTimeout(4000); // let the cascade settle

  // Idle stability: with nothing happening the canvas does not change.
  const idle1 = await canvas.screenshot();
  await page.waitForTimeout(500);
  const idle2 = await canvas.screenshot();
  expect(idle2.equals(idle1), 'idle board is static').toBe(true);

  // Hint: once the ranking is done, the arrows change the canvas. The first
  // ranking also boots the AI worker, and CI runners render in software on
  // two CPUs, so allow generous time; a broken Hint still fails (it never
  // changes the static board).
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect.poll(async () => !(await canvas.screenshot()).equals(idle2), { timeout: 15_000, intervals: [100, 250, 500] }).toBe(true);
  await page.screenshot({ path: `${SHOTS}/smoke-1440x900.png` });

  // AI on for about 10 s: the counter must move.
  await page.getByRole('switch', { name: 'AI' }).check();
  await page.waitForTimeout(10_000);
  const text = await page.getByText(/^AI moves [\d,]+$/).innerText();
  expect(Number(text.replace(/\D/g, ''))).toBeGreaterThan(0);
  await page.getByRole('switch', { name: 'AI' }).uncheck();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/smoke-390x844.png` });

  // The deliberate miss: an unknown path is a real 404 here too, not index.html.
  expect((await page.request.get('/definitely-not-a-page')).status()).toBe(404);

  // The violation log starts afresh with each page load, so check it before reloading.
  expect(await csp()).toEqual([]);
  // Still declined after a reload: no banner, and nothing ever went to Google.
  await page.reload();
  await page.locator('canvas').first().waitFor();
  await page.waitForTimeout(500);
  await expect(banner(page)).toBeHidden();
  expect(google, 'no request reached a Google host').toEqual([]);

  expect(await csp()).toEqual([]);
  expect(failed, 'no request failed').toEqual([]);
  expect(errors).toEqual([]);
});

test('voltline smoke: accept cookies loads the tag under the CSP', async ({ page }) => {
  const { errors, failed, google, csp } = await watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?seed=${SEED}`);
  await page.locator('canvas').first().waitFor();
  await expect(banner(page)).toBeVisible();
  expect(google, 'nothing goes to Google before an answer').toEqual([]);

  const tag = page.waitForResponse((r) => r.url().startsWith('https://www.googletagmanager.com/gtag/js?id=G-CWEHQPGMV8'));
  await page.getByRole('button', { name: 'Accept' }).click();
  expect((await tag).status()).toBe(200);
  await expect(banner(page)).toBeHidden();
  // Page views only: gtag('js') and gtag('config', id).
  await expect.poll(() => page.evaluate(() => (window as unknown as { dataLayer?: unknown[] }).dataLayer?.length ?? 0)).toBe(2);

  expect(await csp()).toEqual([]); // before the reload resets the log
  // A returning visitor who accepted gets the tag again with no banner; Cookie settings reopens it.
  await page.reload();
  await page.locator('canvas').first().waitFor();
  await expect.poll(() => google.filter((u) => u.includes('/gtag/js')).length).toBe(2);
  await expect(banner(page)).toBeHidden();
  await page.getByRole('button', { name: 'Cookie settings' }).click();
  await expect(banner(page)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/smoke-banner-1440x900.png` });

  expect(await csp()).toEqual([]);
  expect(failed, 'no request failed').toEqual([]);
  expect(errors).toEqual([]);
});
