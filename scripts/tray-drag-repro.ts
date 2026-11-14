// Reproduction for the tray drag bug (Voltline 1.1 Task 3), against the dev server:
//   [BROWSER=chromium|webkit|firefox] [DPR=2] [SEQ=1] npx tsx scripts/tray-drag-repro.ts [baseUrl]
// Drives real mouse drags from each tray slot of `?fixture=tray` onto every kind of cell and
// logs, per drop, whether input called `place` (and with which cell) and whether the
// controller took it. SEQ=1 instead plays drags one after another on one page (including one
// started while the previous drop still plays) and probes where a press picks up a slot.
// The pass/fail version of these paths is section 6 of scripts/input-check.ts.
import { chromium, firefox, webkit, type Page } from '@playwright/test';
import { computeLayout, traySlotCenter } from '../src/render/layout';
import type { GameState, Pos } from '../src/engine';
import type { DebugHandle } from '../src/app/debug';

declare global { interface Window { __voltline?: DebugHandle; __calls?: unknown[] } }
const base = process.argv[2] ?? 'http://localhost:5183/';

async function open(p: Page) {
  await p.goto(`${base}?fixture=tray`);
  await p.waitForFunction(() => window.__voltline !== undefined);
  await p.waitForFunction(() => window.__voltline!.controller.snapshot().busy === false);
  await p.evaluate(() => {
    const c = window.__voltline!.controller as unknown as Record<string, (...a: unknown[]) => unknown>;
    window.__calls = [];
    for (const name of ['place', 'tapSlot', 'tapCell', 'swap']) {
      const orig = c[name].bind(c);
      c[name] = (...a: unknown[]) => { window.__calls!.push([name, ...a]); return orig(...a); };
    }
  });
}

async function geom(p: Page) {
  const box = (await p.locator('canvas').boundingBox())!;
  const l = computeLayout(box.width, box.height);
  const cell = (c: Pos, dx = 0, dy = 0) => ({
    x: box.x + l.board.x + (c.col + 0.5) * l.cellPx + dx * l.cellPx,
    y: box.y + l.board.y + (c.row + 0.5) * l.cellPx + dy * l.cellPx,
  });
  const slot = (s: number) => { const c = traySlotCenter(l, s); return { x: box.x + c.x, y: box.y + c.y }; };
  return { box, l, cell, slot };
}

interface Case { name: string; slot: number; to: Pos; dx?: number; dy?: number; steps: number; offCanvas?: boolean; grab?: { dx: number; dy: number } }

const browser = await ({ chromium, firefox, webkit }[process.env.BROWSER ?? 'chromium'] ?? chromium).launch();
const dpr = Number(process.env.DPR ?? 1);
const page = await (await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: dpr })).newPage();
const rows: string[] = [];
const run = async (c: Case) => {
  await open(page);
  const g = await geom(page);
  const s0 = (await page.evaluate(() => window.__voltline!.controller.state)) as GameState;
  const from = g.slot(c.slot);
  const fromGrab = c.grab ? { x: from.x + c.grab.dx * g.l.tray.slotPx, y: from.y + c.grab.dy * g.l.tray.slotPx } : from;
  const to = g.cell(c.to, c.dx ?? 0, c.dy ?? 0);
  await page.mouse.move(fromGrab.x, fromGrab.y);
  await page.mouse.down();
  if (c.offCanvas) {
    await page.mouse.move(g.box.x + g.box.width + 40, to.y, { steps: 6 });
  }
  await page.mouse.move(to.x, to.y, { steps: c.steps });
  await page.mouse.up();
  await page.waitForTimeout(50);
  const calls = await page.evaluate(() => window.__calls);
  await page.waitForFunction(() => window.__voltline!.controller.snapshot().busy === false);
  const s1 = (await page.evaluate(() => window.__voltline!.controller.state)) as GameState;
  const target = s0.board[c.to.row][c.to.col];
  const tdesc = !target ? 'empty' : target.kind === 'gem' ? `${target.color}${target.special === 'none' ? '' : '/' + target.special}` : target.kind;
  const took = s1.moves > s0.moves;
  rows.push(`${took ? 'TOOK   ' : 'REFUSED'} ${c.name.padEnd(34)} slot ${c.slot} (${s0.tray[c.slot]}) -> (${c.to.row},${c.to.col}) ${tdesc.padEnd(14)} calls ${JSON.stringify(calls)}`);
};

const S = await (async () => { await open(page); return (await page.evaluate(() => window.__voltline!.controller.state)) as GameState; })();
const plainOther = (slot: number): Pos => {
  for (let row = 1; row < 7; row++) for (let col = 1; col < 7; col++) {
    const t = S.board[row][col];
    if (t?.kind === 'gem' && t.special === 'none' && t.color !== S.tray[slot]) return { row, col };
  }
  throw new Error('none');
};
const sameColor = (slot: number): Pos => {
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const t = S.board[row][col];
    if (t?.kind === 'gem' && t.special === 'none' && t.color === S.tray[slot]) return { row, col };
  }
  throw new Error('none');
};

if (process.env.SEQ) {
  // Same page, one drag after another at a human pace: plain, refused, plain, ... and a drag
  // started while the previous placement is still playing.
  await open(page);
  const g = await geom(page);
  const log: string[] = [];
  const drag = async (slot: number, to: Pos, waitIdle: boolean) => {
    if (waitIdle) await page.waitForFunction(() => window.__voltline!.controller.snapshot().busy === false);
    const before = (await page.evaluate(() => window.__voltline!.controller.state)) as GameState;
    const busy = await page.evaluate(() => window.__voltline!.controller.snapshot().busy);
    await page.evaluate(() => { window.__calls = []; });
    const a = g.slot(slot); const b = g.cell(to);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(30);
    const calls = await page.evaluate(() => window.__calls);
    const after = (await page.evaluate(() => window.__voltline!.controller.state)) as GameState;
    log.push(`${after.moves > before.moves ? 'TOOK   ' : 'REFUSED'} busyAtDown=${busy} slot ${slot} (${before.tray[slot]}) -> (${to.row},${to.col}) calls ${JSON.stringify(calls)}`);
  };
  await drag(0, { row: 3, col: 3 }, true); // rock: refused
  await drag(0, { row: 1, col: 1 }, false); // immediately after a refusal
  await drag(0, { row: 1, col: 2 }, false); // immediately after an accepted place (still playing)
  await drag(0, { row: 1, col: 2 }, true); // once idle
  await drag(1, { row: 2, col: 4 }, true); // charge: refused
  await drag(1, { row: 4, col: 5 }, false);
  console.log(log.join('\n'));
  // Pickup probes: press across slot 2 horizontally and report which presses start a gesture.
  const picks: string[] = [];
  for (let k = -0.8; k <= 0.81; k += 0.1) {
    await open(page);
    const gg = await geom(page);
    const c = gg.slot(2);
    const x = c.x + k * gg.l.cellPx;
    const b = gg.cell({ row: 1, col: 1 });
    await page.mouse.move(x, c.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(30);
    const calls = await page.evaluate(() => window.__calls);
    picks.push(`press at slot2 ${k >= 0 ? '+' : ''}${k.toFixed(1)} cell: ${JSON.stringify(calls)}`);
  }
  console.log(picks.join('\n'));
  await browser.close();
  process.exit(0);
}

for (let slot = 0; slot < 5; slot++) {
  const plain = plainOther(slot);
  await run({ name: 'plain other color, slow', slot, to: plain, steps: 25 });
  await run({ name: 'plain other color, fast', slot, to: plain, steps: 2 });
  await run({ name: 'plain other color, one jump', slot, to: plain, steps: 1 });
  await run({ name: 'same color', slot, to: sameColor(slot), steps: 10 });
  await run({ name: 'charge', slot, to: { row: 2, col: 4 }, steps: 10 });
  await run({ name: 'arc', slot, to: { row: 5, col: 1 }, steps: 10 });
  await run({ name: 'prism', slot, to: { row: 6, col: 6 }, steps: 10 });
  await run({ name: 'rock corner', slot, to: { row: 0, col: 0 }, steps: 10 });
  await run({ name: 'rock mid', slot, to: { row: 3, col: 3 }, steps: 10 });
  await run({ name: 'edge (0,7)', slot, to: { row: 0, col: 7 }, steps: 10 });
  await run({ name: 'edge (7,1) bottom row', slot, to: { row: 7, col: 1 }, steps: 10 });
  await run({ name: 'near boundary +0.45', slot, to: plain, dx: 0.45, dy: 0.45, steps: 10 });
  await run({ name: 'off canvas and back', slot, to: plain, steps: 10, offCanvas: true });
  await run({ name: 'grab slot corner', slot, to: plain, steps: 10, grab: { dx: 0.4, dy: -0.4 } });
}
console.log(rows.join('\n'));
await browser.close();
