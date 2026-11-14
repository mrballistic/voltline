// Input check for drag, swipe and short-drag-as-tap (Task 15), against the dev server:
//   npx tsx scripts/input-check.ts [baseUrl]   (start `npm run dev` first; it uses the debug handle)
// The whole run takes about 25 minutes, most of it section 6. To run part of it, set
// SECTIONS (e.g. `SECTIONS=1,2,7`) and, for section 6, TRAY_SLOTS (e.g. `TRAY_SLOTS=0,1`).
// Each section and each slot of section 6 prints a timestamped progress line.
// Mouse drag swaps and hands off to the swap tween without a snap; a touch swipe (390x844,
// hasTouch) does the same; a short drag is a tap; an invalid drag eases back; input while busy
// shows no drag preview; a drag that leaves the canvas still completes. Tray drags (1.1 Task 3,
// on `?fixture=tray`): every slot onto every kind of cell, slow, fast, near a cell boundary and
// out of the canvas and back; each drop lands on the cell under the piece, and each refused one
// (same color, special, rock) shakes there, flies home, and the next drag still works.
// Held drops (1.1 Task 10, on `?fixture=held`): a tray drop made while a move plays holds where
// it was let go and places once the board is idle; one the board refuses then shakes, plays the
// refusal cue and flies home; one cancelled by a new game or AI mode goes home without a sound.
import { chromium, type Page } from '@playwright/test';
import { DECLINED_CONSENT } from './consent';
import { canPlace, applyMove } from '../src/engine';
import type { GameState, Pos } from '../src/engine';
import type { DebugHandle, FrameSample } from '../src/app/debug';
import { computeLayout, traySlotCenter } from '../src/render/layout';

declare global { interface Window { __voltline?: DebugHandle } }
const base = process.argv[2] ?? 'http://localhost:5173/';
const fails: string[] = [];
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };
const t0 = Date.now();
const progress = (msg: string) => console.log(`--   ${((Date.now() - t0) / 1000).toFixed(0)} s: ${msg}`);
const listed = (v: string | undefined) => v?.split(',').map(Number);
const sections = listed(process.env.SECTIONS);
const traySlots = listed(process.env.TRAY_SLOTS) ?? [0, 1, 2, 3, 4];
/** Whether section `n` runs this time; prints its progress line if so. */
const section = (n: number, name: string) => {
  const on = !sections || sections.includes(n);
  if (on) progress(`section ${n}: ${name}`);
  return on;
};

const idle = (p: Page) => p.waitForFunction(() => window.__voltline!.controller.snapshot().busy === false);
async function open(p: Page, seed: number) {
  await p.goto(`${base}?seed=${seed}`);
  await p.waitForFunction(() => window.__voltline !== undefined);
  await idle(p);
}
const geo = (p: Page) => p.evaluate(() => window.__voltline!.geometry());
const state = (p: Page) => p.evaluate(() => window.__voltline!.controller.state) as Promise<GameState>;
const moves = async (p: Page) => (await state(p)).moves;

/** Cell center in page px (x, y: where the mouse goes) and in canvas px (cx, cy: what sprite samples report). */
async function center(p: Page, c: Pos) {
  const box = (await p.locator('canvas').boundingBox())!;
  const g = await geo(p);
  const cx = g.boardX + (c.col + 0.5) * g.cellPx;
  const cy = g.boardY + (c.row + 0.5) * g.cellPx;
  return { x: box.x + cx, y: box.y + cy, cx, cy, cell: g.cellPx };
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
/** A new context for a section, closing the earlier ones: a left-over page keeps rendering and
 * starves the next section's frames (section 7's slow-motion timing failed that way). */
async function freshContext(opts: Parameters<typeof browser.newContext>[0]) {
  for (const c of browser.contexts()) await c.close();
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(DECLINED_CONSENT);
  return ctx;
}

// 1. Mouse drag: swap, smooth hand-off.
if (section(1, 'mouse drag')) {
  const page = await (await freshContext({ viewport: { width: 900, height: 900 } })).newPage();
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
if (section(2, 'short drag')) {
  const page = await (await freshContext({ viewport: { width: 900, height: 900 } })).newPage();
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
  const near = f[f.length - 1].sprites.filter((q) => Math.abs(q.x - A.cx) < 2 && Math.abs(q.y - A.cy) < 2);
  check(near.length === 1, 'short drag: piece is back on its cell');
}

// 3. Invalid drag eases back; drag off canvas still completes.
if (section(3, 'invalid and off-canvas drags')) {
  const page = await (await freshContext({ viewport: { width: 900, height: 900 } })).newPage();
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
  check(Math.hypot(last.x - A.cx, last.y - A.cy) < 1.5, 'invalid drag: piece ends on its original cell');
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
if (section(4, 'busy')) {
  const page = await (await freshContext({ viewport: { width: 900, height: 900 } })).newPage();
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
  const off = frames.length === 0 || frames[frames.length - 1].sprites.some((q) => Math.abs(q.x - (C.cx + 20)) < 3 && Math.abs(q.y - C.cy) < 3);
  check(!off, 'busy: no piece follows the pointer');
  await page.evaluate(() => window.__voltline!.timeScale(1));
  await idle(page);
  check((await moves(page)) === 1, 'busy: second drag ignored');
}

// 5. Touch swipe on a phone.
if (section(5, 'touch')) {
  const ctx = await freshContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
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

// 6. Tray drags on the tray fixture: a full tray over plain, same-color, special and rock cells.
if (section(6, 'tray drags')) {
  const FLYER_ID = -1000; // TrayView's id for a piece in flight
  const page = await (await freshContext({ viewport: { width: 900, height: 900 } })).newPage();
  const openTray = async () => {
    await page.goto(`${base}?fixture=tray`);
    await page.waitForFunction(() => window.__voltline !== undefined);
    await idle(page);
  };
  const slotAt = async (slot: number) => {
    const box = (await page.locator('canvas').boundingBox())!;
    const c = traySlotCenter(computeLayout(box.width, box.height), slot);
    return { x: box.x + c.x, y: box.y + c.y };
  };
  // Refusals play in slow motion so the 150 ms shake spans enough headless frames to measure.
  const SLOW = 0.2;
  interface Drop { slot: number; to: Pos; dx?: number; dy?: number; steps?: number; offCanvas?: boolean; slow?: boolean }
  /** One mouse drag from a slot to a cell (offset by dx/dy cells); returns what it did and the flyer's frames. */
  const drop = async (d: Drop) => {
    const s0 = await state(page);
    const from = await slotAt(d.slot);
    const c = await center(page, d.to);
    const to = { x: c.x + (d.dx ?? 0) * c.cell, y: c.y + (d.dy ?? 0) * c.cell };
    const toCanvas = { x: c.cx + (d.dx ?? 0) * c.cell, y: c.cy + (d.dy ?? 0) * c.cell };
    if (d.slow) await page.evaluate((k) => window.__voltline!.timeScale(k), SLOW);
    await page.evaluate(() => window.__voltline!.record());
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    if (d.offCanvas) {
      const box = (await page.locator('canvas').boundingBox())!;
      await page.mouse.move(box.x + box.width + 40, to.y, { steps: 6 });
    }
    await page.mouse.move(to.x, to.y, { steps: d.steps ?? 10 });
    await page.mouse.up();
    await idle(page);
    // Keep sampling until no flyer is drawn (or 6 s): a refusal's shake and return, however slow the frames.
    const frames: FrameSample[] = [];
    for (const t0 = Date.now(); Date.now() - t0 < 6000;) {
      await page.waitForTimeout(250);
      frames.push(...await page.evaluate(() => { const f = window.__voltline!.stop(); window.__voltline!.record(); return f; }));
      if (frames.length && !frames[frames.length - 1].tray.some((q) => q.id === FLYER_ID)) break;
    }
    await page.evaluate(() => window.__voltline!.stop());
    if (d.slow) await page.evaluate(() => window.__voltline!.timeScale(1));
    const s1 = await state(page);
    return { s0, s1, took: s1.moves > s0.moves, frames, to: toCanvas, cell: c.cell };
  };
  /** The flyer in every frame it was drawn, in canvas px. */
  const flyerTrack = (frames: FrameSample[]) =>
    frames.map((f) => f.tray.find((q) => q.id === FLYER_ID)).filter((q): q is NonNullable<typeof q> => q !== undefined);

  await openTray();
  const S = await state(page);
  const kinds: { name: string; to: (slot: number) => Pos }[] = [];
  const findCell = (ok: (p: Pos, slot: number) => boolean) => (slot: number): Pos => {
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) if (ok({ row, col }, slot)) return { row, col };
    throw new Error('no cell');
  };
  const piece = (p: Pos) => S.board[p.row][p.col];
  const plain = findCell((p, slot) => p.row > 0 && p.row < 7 && p.col > 0 && p.col < 7 && canPlace(S.board, S.tray, slot, p));
  kinds.push({ name: 'same color', to: findCell((p, slot) => { const t = piece(p); return t?.kind === 'gem' && t.special === 'none' && t.color === S.tray[slot]; }) });
  kinds.push({ name: 'charge', to: findCell((p) => { const t = piece(p); return t?.kind === 'gem' && t.special === 'charge'; }) });
  kinds.push({ name: 'arc', to: findCell((p) => { const t = piece(p); return t?.kind === 'gem' && t.special === 'arc'; }) });
  kinds.push({ name: 'prism', to: findCell((p) => piece(p)?.kind === 'prism') });
  kinds.push({ name: 'rock', to: findCell((p) => piece(p)?.kind === 'rock') });

  for (const slot of traySlots) {
    progress(`section 6: slot ${slot}`);
    const color = S.tray[slot];
    for (const [label, d] of [
      ['slow', { slot, to: plain(slot), steps: 25 }],
      ['fast', { slot, to: plain(slot), steps: 2 }],
      ['near a cell boundary', { slot, to: plain(slot), dx: 0.45, dy: -0.45 }],
      ['out of the canvas and back', { slot, to: plain(slot), offCanvas: true }],
    ] as const) {
      await openTray();
      const r = await drop(d);
      const placed = r.s1.board[d.to.row][d.to.col];
      check(r.took && placed?.kind === 'gem' && placed.color === color, `tray: slot ${slot} ${label} onto a plain cell places on that cell`);
    }
    for (const k of kinds) {
      await openTray();
      const at = k.to(slot);
      const r = await drop({ slot, to: at, slow: true });
      const track = flyerTrack(r.frames);
      const near = track.filter((q) => Math.hypot(q.x - r.to.x, q.y - r.to.y) < 0.2 * r.cell);
      const swing = near.length ? Math.max(...near.map((q) => q.x)) - Math.min(...near.map((q) => q.x)) : 0;
      const last = r.frames[r.frames.length - 1].tray.find((q) => q.id === FLYER_ID);
      const name = `tray: slot ${slot} onto ${k.name} (${at.row},${at.col})`;
      check(!r.took, `${name} is refused`);
      // A 0.07-cell shake dying away over 3 cycles swings about 0.12 cell from side to side.
      check(swing > 0.07 * r.cell, `${name} shakes where it was dropped (${(swing / r.cell).toFixed(3)} cell)`);
      check(last === undefined, `${name} then flies home and is gone`);
      // The next drag on the same page still works.
      const next = await drop({ slot, to: plain(slot) });
      check(next.took, `tray: slot ${slot} the next drag after a refusal places`);
    }
  }
}

// 7. Held drops on the held fixture: a full tray over a board that stays live after plain drops.
if (section(7, 'held drops')) {
  const FLYER_ID = -1000;
  const page = await (await freshContext({ viewport: { width: 900, height: 900 } })).newPage();
  // Every wait here is finite: Playwright actions and waits give up after 15 s, and each case is
  // capped as a whole, so a stuck case reports FAIL and the next one runs.
  page.setDefaultTimeout(15_000);
  const CASE_MS = 90_000;
  const bounded = async (name: string, run: () => Promise<void>) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cap = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`no result in ${CASE_MS / 1000} s`)), CASE_MS); });
    try {
      await Promise.race([run(), cap]);
    } catch (err) {
      check(false, `${name}: ${(err as Error).message.split('\n')[0]}`);
    } finally {
      clearTimeout(timer);
      await page.evaluate(() => { window.__voltline?.timeScale(1); window.__voltline?.stop(); }).catch(() => {});
    }
  };
  /** Waits up to `ms` for the controller to be idle; false (not a throw) if it never is. */
  const idleWithin = (ms: number) =>
    page.waitForFunction(() => window.__voltline!.controller.snapshot().busy === false, undefined, { timeout: ms }).then(() => true, () => false);
  const slotAt = async (slot: number) => {
    const box = (await page.locator('canvas').boundingBox())!;
    const c = traySlotCenter(computeLayout(box.width, box.height), slot);
    return { x: box.x + c.x, y: box.y + c.y };
  };
  const snap = () => page.evaluate(() => window.__voltline!.controller.snapshot());
  const played = () => page.evaluate(() => window.__voltline!.audio().played.filter((k) => k === 'swap-invalid').length);
  /** A mouse drag from a slot to a cell; `beforeUp` runs with the button still down. */
  const mouseDrag = async (slot: number, to: Pos, beforeUp?: () => Promise<void>) => {
    const from = await slotAt(slot);
    const c = await center(page, to);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(c.x, c.y, { steps: 8 });
    await beforeUp?.();
    await page.mouse.up();
    return c;
  };
  /** The player's own flyers share the id, so the held one is told apart by where it is. */
  const flyerNear = (f: FrameSample | undefined, c: { cx: number; cy: number; cell: number }) =>
    f?.tray.find((q) => q.id === FLYER_ID && Math.hypot(q.x - c.cx, q.y - c.cy) < 0.2 * c.cell);
  /** Opens the fixture, plays slot 0 onto a plain cell in slow motion, and drags slot 0 again while it plays. */
  const holdOnto = async (pick: (s1: GameState) => Pos) => {
    await page.goto(`${base}?fixture=held`);
    await page.waitForFunction(() => window.__voltline !== undefined);
    if (!await idleWithin(15_000)) throw new Error('the fixture never went idle');
    const s0 = await state(page);
    const first = { row: 4, col: 4 };
    const s1 = applyMove(s0, { type: 'place', slot: 0, at: first }).state;
    const target = pick(s1);
    // Slow enough (the 220 ms drop takes 22 s) that the second drag ends long before the first
    // drop has played, however slow the headless frames; callers speed time back up.
    await page.evaluate(() => window.__voltline!.timeScale(0.01));
    await mouseDrag(0, first);
    let beforeUp = { busy: false, moves: -1 };
    await page.evaluate(() => window.__voltline!.record());
    const c = await mouseDrag(0, target, async () => { beforeUp = await snap(); });
    await page.waitForTimeout(150);
    const frames = await page.evaluate(() => window.__voltline!.stop());
    const s = await snap();
    return { s0, s1, target, c, busyBeforeUp: beforeUp.busy && beforeUp.moves === 1, heldBusy: s.busy, movesWhileHeld: s.moves, heldFlyer: flyerNear(frames.at(-1), c) };
  };
  /** Samples frames until no flyer is drawn (or 6 s). */
  const untilFlyerGone = async () => {
    const frames: FrameSample[] = [];
    await page.evaluate(() => window.__voltline!.record());
    for (const t0 = Date.now(); Date.now() - t0 < 6000;) {
      await page.waitForTimeout(250);
      frames.push(...await page.evaluate(() => { const f = window.__voltline!.stop(); window.__voltline!.record(); return f; }));
      if (frames.length && !frames[frames.length - 1].tray.some((q) => q.id === FLYER_ID)) break;
    }
    await page.evaluate(() => window.__voltline!.stop());
    return frames;
  };
  /** Frames per second over a run of samples, so a failure says whether the page was starved. */
  const fps = (frames: FrameSample[]) =>
    frames.length > 1 ? ((frames.length - 1) / ((frames.at(-1)!.t - frames[0].t) / 1000)).toFixed(0) : '0';
  const plainFor = (s1: GameState) => {
    for (let row = 1; row < 6; row++) for (let col = 1; col < 7; col++) {
      if ((row !== 4 || col !== 4) && canPlace(s1.board, s1.tray, 0, { row, col })) return { row, col };
    }
    throw new Error('no plain cell');
  };

  // Placed once idle.
  progress('section 7: placed');
  await bounded('held: placed', async () => {
    const r = await holdOnto(plainFor);
    check(r.busyBeforeUp && r.heldBusy, 'held: the second drop was made while the first still played');
    check(r.movesWhileHeld === 1, `held: nothing placed while the move plays (moves ${r.movesWhileHeld})`);
    check(!!r.heldFlyer, 'held: the flyer holds where it was let go');
    await page.evaluate(() => window.__voltline!.timeScale(1));
    await page.waitForFunction(() => window.__voltline!.controller.state.moves === 2, undefined, { timeout: 5000 }).catch(() => {});
    check(await idleWithin(10_000), 'held: the board goes idle after the held drop');
    const s2 = await state(page);
    const placed = s2.board[r.target.row][r.target.col];
    check(s2.moves === 2 && placed?.kind === 'gem' && placed.color === r.s1.tray[0], 'held: placed on its cell once the board was idle');
    const after = await untilFlyerGone();
    check(after.length > 0 && !after.at(-1)!.tray.some((q) => q.id === FLYER_ID), 'held: no flyer left behind');
  });

  // Refused once idle (a rock): shakes, plays the refusal cue, flies home.
  progress('section 7: refused');
  await bounded('held onto a rock', async () => {
    const r = await holdOnto(() => ({ row: 0, col: 0 }));
    const before = await played();
    await page.evaluate(() => window.__voltline!.timeScale(0.2));
    const frames = await untilFlyerGone();
    await page.evaluate(() => window.__voltline!.timeScale(1));
    check(r.busyBeforeUp && !!r.heldFlyer, 'held onto a rock: held while the first drop played');
    const near = frames.map((f) => flyerNear(f, r.c)).filter((q): q is NonNullable<typeof q> => q !== undefined);
    const swing = near.length ? Math.max(...near.map((q) => q.x)) - Math.min(...near.map((q) => q.x)) : 0;
    const s2 = await state(page);
    check(s2.moves === 1, 'held onto a rock: refused once idle');
    check(swing > 0.07 * r.c.cell, `held onto a rock: shakes where it was dropped (${(swing / r.c.cell).toFixed(3)} cell, ${fps(frames)} fps)`);
    check(!frames.at(-1)?.tray.some((q) => q.id === FLYER_ID), 'held onto a rock: then flies home and is gone');
    const audioState = await page.evaluate(() => window.__voltline!.audio().state);
    if (audioState === 'running') check((await played()) - before === 1, 'held onto a rock: plays swap-invalid once');
    else console.log(`skip held onto a rock: sound (audio ${audioState})`);
  });

  // Cancelled by a new game and by AI mode: home without a sound, nothing placed.
  for (const [name, act] of [
    ['a new game', () => page.evaluate(() => { void window.__voltline!.controller.newGame(); })],
    ['AI mode', () => page.evaluate(() => window.__voltline!.controller.setAI(true))],
  ] as const) {
    progress(`section 7: cancelled by ${name}`);
    await bounded(`held, then ${name}`, async () => {
      const r = await holdOnto(plainFor);
      check(r.busyBeforeUp && !!r.heldFlyer, `held, then ${name}: held while the first drop played`);
      const before = await played();
      await act();
      // Cancelled at once, not at idle: still at 0.01× and with the first drop still playing, the
      // flyer has already left the drop point on its way home (a cancel that waited for idle, or
      // a hold that went on to place, would leave it sitting there).
      await page.evaluate(() => window.__voltline!.record());
      await page.waitForTimeout(1500);
      const early = await page.evaluate(() => window.__voltline!.stop());
      const stillBusy = (await snap()).busy;
      check(stillBusy && early.length > 0 && !flyerNear(early.at(-1), r.c) && !!early.at(-1)!.tray.some((q) => q.id === FLYER_ID),
        `held, then ${name}: the flyer leaves for home at once, while the first drop still plays (${fps(early)} fps)`);
      await page.evaluate(() => window.__voltline!.timeScale(1));
      const frames = await untilFlyerGone();
      check(!frames.at(-1)?.tray.some((q) => q.id === FLYER_ID), `held, then ${name}: the flyer goes home (${fps(frames)} fps)`);
      check((await played()) === before, `held, then ${name}: no refusal sound`);
      if (name === 'AI mode') await page.evaluate(() => window.__voltline!.controller.setAI(false));
      check(await idleWithin(10_000), `held, then ${name}: the board goes idle`);
    });
  }
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall input checks passed');
process.exit(fails.length ? 1 : 0);
