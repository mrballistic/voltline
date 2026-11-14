// Hint and AI mode check (Task 17), against the dev server:
//   npx tsx scripts/ai-check.ts [baseUrl] [outDir] [aiSeconds]   (start `npm run dev` first)
// Presses Hint and screenshots the arrows mid-reveal and with the best isolated (GSAP slowed so
// the frames land); holds a drag still while AI mode turns on and checks the piece eases home;
// then runs AI mode on Fast for `aiSeconds` (default 120) and fails on a stall or a console error.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { DECLINED_CONSENT } from './consent';
import type { DebugHandle } from '../src/app/debug';

declare global { interface Window { __voltline?: DebugHandle } }
const base = process.argv[2] ?? 'http://localhost:5173/';
const out = resolve(process.argv[3] ?? '/tmp/voltline-ai-check');
const aiSeconds = Number(process.argv[4] ?? 120);
mkdirSync(out, { recursive: true });

const fails: string[] = [];
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };
const snap = (p: Page) => p.evaluate(() => window.__voltline!.controller.snapshot());
const idle = (p: Page) => p.waitForFunction(() => window.__voltline!.controller.snapshot().busy === false);

const browser = await chromium.launch();
const errors: string[] = [];
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })).newPage();
await page.addInitScript(DECLINED_CONSENT);
page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !m.text().includes('GL Driver Message'))) errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`${base}?seed=7`);
await page.waitForFunction(() => window.__voltline !== undefined);
await idle(page);
await page.waitForTimeout(300);

// 1. Hint: slowed 4x, so the 1 s reveal takes 4 s.
await page.evaluate(() => window.__voltline!.timeScale(0.25));
await page.getByRole('button', { name: 'Hint' }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/hint-reveal.png` });
await page.waitForTimeout(3800);
await page.screenshot({ path: `${out}/hint-best.png` });
await page.evaluate(() => window.__voltline!.timeScale(1));
// Any tap clears it.
const box = (await page.locator('canvas').boundingBox())!;
const g = await page.evaluate(() => window.__voltline!.geometry());
const at = (row: number, col: number) => ({ x: box.x + g.boardX + (col + 0.5) * g.cellPx, y: box.y + g.boardY + (row + 0.5) * g.cellPx });
await page.mouse.click(at(0, 0).x, at(0, 0).y);
await page.mouse.click(at(0, 0).x, at(0, 0).y); // and deselect
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/hint-cleared.png` });

// 2. A drag held still while AI mode turns on eases back at once.
const cell = at(4, 4);
const id = await page.evaluate(() => window.__voltline!.controller.state.board[4][4]!.id);
await page.mouse.move(cell.x, cell.y);
await page.mouse.down();
await page.mouse.move(cell.x + g.cellPx * 0.25, cell.y, { steps: 4 });
await page.waitForTimeout(100);
const offsetBefore = await page.evaluate((pid) => {
  const h = window.__voltline!;
  h.record();
  return new Promise<number>((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const s = h.stop().at(-1)!.sprites.find((x) => x.id === pid)!;
    res(s.x);
  })));
}, id);
await page.evaluate(() => { window.__voltline!.controller.setAISpeed('medium'); window.__voltline!.controller.setAI(true); });
await page.waitForTimeout(250); // > dragReturnMs, < the medium reveal before the AI's first move
const offsetAfter = await page.evaluate((pid) => {
  const h = window.__voltline!;
  h.record();
  return new Promise<number>((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const s = h.stop().at(-1)!.sprites.find((x) => x.id === pid);
    res(s ? s.x : NaN);
  })));
}, id);
await page.mouse.up();
check(offsetBefore - cell.x + box.x > g.cellPx * 0.2, `drag held: piece offset ${(offsetBefore - cell.x + box.x).toFixed(1)} px`);
check(Math.abs(offsetAfter - cell.x + box.x) < 0.5, `AI on mid-drag: piece back on its cell (${(offsetAfter - cell.x + box.x).toFixed(2)} px)`);
await page.evaluate(() => window.__voltline!.controller.setAI(false));
await idle(page);

// 3. AI mode on Fast, from a fresh game, driven through the UI. First a few moves on Slow, to
// catch the AI's arrows mid-reveal (300 ms into its 1 s reveal) for a screenshot.
await page.evaluate(() => window.__voltline!.controller.newGame());
await idle(page);
await page.getByRole('button', { name: 'Slow' }).click();
await page.getByRole('switch', { name: 'AI' }).click();
for (let i = 0; i < 3; i++) {
  await page.waitForFunction(() => { const s = window.__voltline!.controller.snapshot(); return !s.busy && !s.aiThinking; });
  await page.waitForFunction(() => window.__voltline!.controller.snapshot().aiThinking, undefined, { polling: 'raf' });
  await page.waitForFunction(() => !window.__voltline!.controller.snapshot().aiThinking, undefined, { polling: 'raf' });
}
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/ai-mode-reveal.png` });
await page.getByRole('button', { name: 'Fast' }).click();
const games: { moves: number; score: number; level: number; over: boolean }[] = [];
let last = { moves: -1, t: Date.now() };
let longestStallMs = 0;
let shot = false;
const end = Date.now() + aiSeconds * 1000;
while (Date.now() < end) {
  await page.waitForTimeout(250);
  const s = await snap(page);
  if (s.aiMoves !== last.moves) last = { moves: s.aiMoves, t: Date.now() };
  const stall = Date.now() - last.t;
  longestStallMs = Math.max(longestStallMs, stall);
  if (!shot && s.aiMoves >= 12) {
    await page.screenshot({ path: `${out}/ai-mode-running.png` });
    shot = true;
  }
  if (s.over && !s.busy) {
    games.push({ moves: s.aiMoves, score: s.score, level: s.level, over: true });
    console.log(`game over: ${s.aiMoves} AI moves, score ${s.score}, level ${s.level}`);
    await page.getByRole('button', { name: 'Play again' }).click();
    await idle(page);
    last = { moves: -1, t: Date.now() };
    continue;
  }
  if (stall > 5000) {
    const state = await page.evaluate(() => ({ hidden: document.hidden, ...window.__voltline!.controller.snapshot() }));
    check(false, `AI stalled for ${stall} ms at ${s.aiMoves} moves: ${JSON.stringify({ ...state, tray: undefined, best: undefined })}`);
    break;
  }
}
const s = await snap(page);
games.push({ moves: s.aiMoves, score: s.score, level: s.level, over: s.over });
await page.screenshot({ path: `${out}/ai-mode-end.png` });
for (const [i, gm] of games.entries()) console.log(`game ${i + 1}: ${gm.moves} AI moves, score ${gm.score.toLocaleString('en-US')}, level ${gm.level}${gm.over ? ' (over)' : ' (still playing)'}`);
console.log(`longest gap between AI moves: ${longestStallMs} ms`);
check(s.aiOn, 'AI mode still on at the end');

// 4. A hint after the run, which usually has tray pieces, so placement arrows show too.
await page.getByRole('switch', { name: 'AI' }).click();
await idle(page);
if (!(await snap(page)).over) {
  await page.evaluate(() => window.__voltline!.timeScale(0.25));
  await page.getByRole('button', { name: 'Hint' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/hint-tray.png` });
  await page.evaluate(() => window.__voltline!.timeScale(1));
  console.log(`tray at the end: ${(await snap(page)).tray.length} pieces`);
}
check(errors.length === 0, `no console errors or warnings${errors.length ? `: ${errors.join(' | ')}` : ''}`);
await browser.close();
if (fails.length) { console.error(`${fails.length} failed`); process.exit(1); }
