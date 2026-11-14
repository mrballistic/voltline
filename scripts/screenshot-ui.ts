// Captures the chrome states for the Claude Design brief: game over, tray full, level up.
/* eslint-disable @typescript-eslint/no-explicit-any -- pokes private controller fields in the dev build */
//   npx tsx scripts/screenshot-ui.ts [baseUrl] [outDir]   (start `npm run dev` first; dev build only)
// Drives the dev-only window.__voltline handle: it seeds the controller with a crafted state, so
// the real UI renders each state. Output is PNG; convert to WebP afterwards (cwebp -q 80).
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = resolve(process.argv[3] ?? '/tmp/voltline-ui');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })).newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const open = async () => {
  await page.goto(`${base}?seed=7`);
  await page.waitForSelector('canvas');
  await page.waitForFunction(() => '__voltline' in window);
  await page.waitForTimeout(2500);
};

/** Replaces the controller's state, as `newGame` would, and redeals the board. */
const seed = (cells: Record<string, string>, over: Record<string, unknown>) => page.evaluate(async ({ cells, over }) => {
  const t = await import('/src/engine/testing.ts');
  const c = (window as any).__voltline.controller;
  c._state = t.makeState(t.boardWith(cells), over);
  c.shown = c.shownFrom(c._state);
  await c.d.player.show({ board: c._state.board, tray: c._state.tray });
  c.d.onChange(c.snapshot());
}, { cells, over });

// Tray full: five spare pieces and the persistent notice.
await open();
await seed({}, { score: 1840, tray: ['red', 'blue', 'yellow', 'green', 'cyan'] });
await page.evaluate(() => { const c = (window as any).__voltline.controller; c.notice = { kind: 'tray-full' }; c.d.onChange(c.snapshot()); });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/ui-tray-full.png` });

// Level up: a real move that crosses the target; capture while "Level 2!" is up.
await open();
await seed({ '4,2': 'R', '4,3': 'R', '3,4': 'R' }, { score: 950, tray: ['magenta', 'orange'] });
await page.evaluate(() => {
  (window as any).__voltline.controller.swap({ row: 3, col: 4 }, { row: 4, col: 4 });
});
await page.waitForFunction(() => document.body.innerText.includes('Level 2!'), undefined, { timeout: 15000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/ui-level-up.png` });

// Game over: the dialog with a new best.
await open();
await seed({}, { score: 12480, level: 4, levelStartScore: 8750, levelTarget: 10000, tray: ['red', 'cyan'] });
await page.evaluate(() => {
  const c = (window as any).__voltline.controller;
  c.shown.over = true; c.newBest = true; c.prefs.bestPlayer = 12480; c.d.onChange(c.snapshot());
});
await page.waitForSelector('#game-over-title');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/ui-game-over.png` });

await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
