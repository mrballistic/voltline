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

  // Reduced motion stops the idle glow breathing, so the idle board is static and any
  // canvas change after Hint can only come from the hint arrows.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const canvas = page.locator('canvas').first();
  await canvas.waitFor();
  await page.waitForTimeout(1500); // the opening deal

  const readScore = async () => {
    const m = /([\d,]+)\s*\n\s*Best/.exec(await page.locator('body').innerText());
    return m ? Number(m[1].replace(/,/g, '')) : -1;
  };
  expect(await readScore()).toBe(0);

  // Try adjacent swaps until one scores (the rest are invalid and slide back).
  let scored = false;
  for (let r = BOARD_SIZE - 1; r >= 0 && !scored; r--) {
    for (let c = 0; c < BOARD_SIZE - 1 && !scored; c += 2) {
      await clickCell(page, r, c);
      await page.waitForTimeout(150);
      await clickCell(page, r, c + 1);
      await page.waitForTimeout(900);
      scored = (await readScore()) > 0;
    }
  }
  expect(scored, 'at least one swap was valid and scored').toBe(true);
  await page.waitForTimeout(4000); // let the cascade settle

  // Idle stability: with nothing happening the canvas does not change.
  const idle1 = await canvas.screenshot();
  await page.waitForTimeout(500);
  const idle2 = await canvas.screenshot();
  expect(idle2.equals(idle1), 'idle board is static').toBe(true);

  // Hint: the canvas pixels change within about a second.
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect.poll(async () => !(await canvas.screenshot()).equals(idle2), { timeout: 1500, intervals: [100] }).toBe(true);
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
