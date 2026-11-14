import { expect, test, type Page } from '@playwright/test';
import { BOARD_SIZE } from '../src/engine';
import { computeLayout } from '../src/render/layout';

// Drives the real UI of the production build: no debug handle, only clicks.
const SHOTS = '.playwright-mcp';

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

test('voltline smoke: play, hint, AI, no errors, no CSP violations', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const canvas = page.locator('canvas').first();
  await canvas.waitFor();
  await page.waitForTimeout(1500); // the opening deal

  // A few swaps; some may be invalid and slide back, which is fine.
  const tries: Array<[number, number, number, number]> = [[7, 0, 7, 1], [3, 3, 3, 4], [5, 2, 4, 2], [2, 6, 3, 6]];
  for (const [r1, c1, r2, c2] of tries) {
    expect(r1 < BOARD_SIZE && r2 < BOARD_SIZE).toBe(true);
    await clickCell(page, r1, c1);
    await page.waitForTimeout(150);
    await clickCell(page, r2, c2);
    await page.waitForTimeout(2500);
  }

  // Hint: the canvas pixels change within about a second.
  await page.waitForTimeout(1000);
  const before = await canvas.screenshot();
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect.poll(async () => !(await canvas.screenshot()).equals(before), { timeout: 1500, intervals: [100] }).toBe(true);
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

  expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
  expect(errors).toEqual([]);
});
