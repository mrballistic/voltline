// Input check for drag, swipe and short-drag-as-tap (Task 15), against the dev server:
//   npx tsx scripts/input-check.ts [baseUrl]   (start `npm run dev` first; it uses the debug handle)
// Mouse drag swaps and hands off to the swap tween without a snap; a touch swipe (390x844,
// hasTouch) does the same; a short drag is a tap; an invalid drag eases back; input while busy
// shows no drag preview; a drag that leaves the canvas still completes.
import { chromium, type Page } from '@playwright/test';
import { applyMove } from '../src/engine';
import type { GameState, Pos } from '../src/engine';
import type { DebugHandle, FrameSample } from '../src/app/debug';

declare global { interface Window { __voltline?: DebugHandle } }
const base = process.argv[2] ?? 'http://localhost:5173/';
const fails: string[] = [];
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };

const idle = (p: Page) => p.waitForFunction(() => window.__voltline!.controller.snapshot().busy === false);
async function open(p: Page, seed: number) {
  await p.goto(`${base}?seed=${seed}`);
  await p.waitForFunction(() => window.__voltline !== undefined);
  await idle(p);
}
const geo = (p: Page) => p.evaluate(() => window.__voltline!.geometry());
const state = (p: Page) => p.evaluate(() => window.__voltline!.controller.state) as Promise<GameState>;
const moves = async (p: Page) => (await state(p)).moves;

async function center(p: Page, c: Pos) {
  const box = (await p.locator('canvas').boundingBox())!;
  const g = await geo(p);
  return { x: box.x + g.boardX + (c.col + 0.5) * g.cellPx, y: box.y + g.boardY + (c.row + 0.5) * g.cellPx, cell: g.cellPx };
}

function pick(s: GameState, valid: boolean): { a: Pos; b: Pos } {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 7; col++) {
      const a = { row, col }; const b = { row, col: col + 1 };
      const first = applyMove(s, { type: 'swap', a, b }).script[0]?.t;
      if ((first === 'swap-invalid') !== valid && first) return { a, b };
    }
  }
  throw new Error('no swap found');
}

/** A touch drag through CDP, since Playwright has no touch-move API. */
async function touchDrag(p: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 6) {
  const cdp = await p.context().newCDPSession(p);
  const send = (type: string, pt?: { x: number; y: number }) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pt ? [{ x: pt.x, y: pt.y, id: 1 }] : [] } as never);
  await send('touchStart', from);
  for (let i = 1; i <= steps; i++) {
    await send('touchMove', { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps });
  }
  await send('touchEnd');
}

/** Largest step backwards (toward the start) before the piece first reaches its furthest point, in cells. Zero means no snap back. */
function maxSnapBack(frames: FrameSample[], id: number, cell: number): number {
  const xs = frames.map((f) => f.sprites.find((q) => q.id === id)?.x).filter((x): x is number => x !== undefined);
  const peak = xs.indexOf(Math.max(...xs));
  let m = 0;
  for (let i = 1; i <= peak; i++) m = Math.max(m, (xs[i - 1] - xs[i]) / cell);
  return m;
}

const browser = await chromium.launch();

// 1. Mouse drag: swap, smooth hand-off.
{
  const page = await (await browser.newContext({ viewport: { width: 900, height: 900 } })).newPage();
  await open(page, 1234);
  const s = await state(page);
  const { a, b } = pick(s, true);
  const id = s.board[a.row][a.col]!.id;
  const A = await center(page, a);
  const B = await center(page, b);
  await page.evaluate(() => window.__voltline!.record());
  await page.mouse.move(A.x, A.y);
  await page.mouse.down();
  await page.mouse.move(A.x + (B.x - A.x) * 0.2, A.y, { steps: 4 });
  const snap = await page.evaluate(() => window.__voltline!.controller.snapshot().busy);
  check(!snap, 'mouse: below the threshold nothing is submitted');
  await page.mouse.move(A.x + (B.x - A.x) * 0.45, A.y, { steps: 4 });
  await page.mouse.move(A.x + (B.x - A.x) * 0.7, A.y, { steps: 3 });
  await page.mouse.up();
  const frames = await page.evaluate(() => window.__voltline!.stop());
  check((await moves(page)) === 1, 'mouse: drag past threshold swaps (moves = 1)');
  const sb = maxSnapBack(frames, id, A.cell);
  check(sb < 0.02, `mouse: drag hands off to the swap tween with no snap back (max backward step ${sb.toFixed(3)} cell)`);
}

// 2. Short drag acts as a tap.
{
  const page = await (await browser.newContext({ viewport: { width: 900, height: 900 } })).newPage();
  await open(page, 1234);
  const A = await center(page, { row: 2, col: 2 });
  await page.mouse.move(A.x, A.y);
  await page.mouse.down();
  await page.mouse.move(A.x + A.cell * 0.15, A.y + 2, { steps: 3 });
  await page.mouse.up();
  const sel = await page.evaluate(() => window.__voltline!.controller.snapshot().selected);
  check(sel?.row === 2 && sel?.col === 2, 'short drag: selects the cell like a tap');
  check((await moves(page)) === 0, 'short drag: no move');
  // Resting piece back on its cell.
  await page.waitForTimeout(300);
  const f = await (async () => { await page.evaluate(() => window.__voltline!.record()); await page.waitForTimeout(60); return page.evaluate(() => window.__voltline!.stop()); })();
  const near = f[f.length - 1].sprites.filter((q) => Math.abs(q.x - A.x) < 2 && Math.abs(q.y - A.y) < 2);
  check(near.length === 1, 'short drag: piece is back on its cell');
}

// 3. Invalid drag eases back; drag off canvas still completes.
{
  const page = await (await browser.newContext({ viewport: { width: 900, height: 900 } })).newPage();
  await open(page, 1234);
  const s = await state(page);
  const { a, b } = pick(s, false);
  const id = s.board[a.row][a.col]!.id;
  const A = await center(page, a);
  const B = await center(page, b);
  await page.evaluate(() => window.__voltline!.record());
  await page.mouse.move(A.x, A.y);
  await page.mouse.down();
  await page.mouse.move(B.x, B.y, { steps: 6 });
  await page.mouse.up();
  await idle(page);
  const frames = await page.evaluate(() => window.__voltline!.stop());
  const last = frames[frames.length - 1].sprites.find((q) => q.id === id)!;
  check(Math.hypot(last.x - A.x, last.y - A.y) < 1.5, 'invalid drag: piece ends on its original cell');
  check((await moves(page)) <= 1, 'invalid drag: state consistent');
  const sb = maxSnapBack(frames, id, A.cell);
  check(sb < 0.02, `invalid drag: no snap back before the piece swaps out (max backward step ${sb.toFixed(3)} cell)`);

  // Drag that leaves the canvas: valid swap whose pointer ends far outside the window.
  const s2 = await state(page);
  const m2 = pick(s2, true);
  const A2 = await center(page, m2.a);
  const before = s2.moves;
  await page.mouse.move(A2.x, A2.y);
  await page.mouse.down();
  await page.mouse.move(A2.x + A2.cell * 0.2, A2.y, { steps: 2 });
  await page.mouse.move(A2.x + A2.cell * 0.2, -50, { steps: 3 }); // leaves canvas upward, dominant axis flips
  await page.mouse.up();
  await idle(page);
  check((await moves(page)) === before || (await moves(page)) === before + 1, 'off-canvas release ends the gesture without wedging');
  const snap = await page.evaluate(() => window.__voltline!.controller.snapshot());
  check(!snap.busy, 'off-canvas release: controller idle');
}

// 4. Busy: dragging during a play shows no preview and does nothing.
{
  const page = await (await browser.newContext({ viewport: { width: 900, height: 900 } })).newPage();
  await open(page, 1234);
  const s = await state(page);
  const { a, b } = pick(s, true);
  const A = await center(page, a);
  const B = await center(page, b);
  await page.evaluate(() => window.__voltline!.timeScale(0.1));
  await page.mouse.move(A.x, A.y);
  await page.mouse.down();
  await page.mouse.move(B.x, B.y, { steps: 5 });
  await page.mouse.up();
  const C = await center(page, { row: 6, col: 6 });
  await page.evaluate(() => window.__voltline!.record());
  await page.mouse.move(C.x, C.y);
  await page.mouse.down();
  await page.mouse.move(C.x + 20, C.y, { steps: 3 });
  const frames = await page.evaluate(() => window.__voltline!.stop());
  await page.mouse.up();
  const off = frames.length === 0 || frames[frames.length - 1].sprites.some((q) => Math.abs(q.x - (C.x + 20)) < 3 && Math.abs(q.y - C.y) < 3);
  check(!off, 'busy: no piece follows the pointer');
  await page.evaluate(() => window.__voltline!.timeScale(1));
  await idle(page);
  check((await moves(page)) === 1, 'busy: second drag ignored');
}

// 5. Touch swipe on a phone.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await open(page, 1234);
  const s = await state(page);
  const { a, b } = pick(s, true);
  const A = await center(page, a);
  const B = await center(page, b);
  await touchDrag(page, { x: A.x, y: A.y }, { x: A.x + (B.x - A.x) * 0.8, y: A.y });
  await idle(page);
  check((await moves(page)) === 1, 'touch: swipe swaps (moves = 1)');
  const sc = await page.evaluate(() => window.scrollY);
  check(sc === 0, 'touch: page did not scroll');
  // Tap by touch still selects.
  const T = await center(page, { row: 5, col: 5 });
  await page.touchscreen.tap(T.x, T.y);
  const sel = await page.evaluate(() => window.__voltline!.controller.snapshot().selected);
  check(sel?.row === 5 && sel?.col === 5, 'touch: tap selects');
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall input checks passed');
process.exit(fails.length ? 1 : 0);
