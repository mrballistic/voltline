// Feel check for the gravity animation (Task 13): plays real moves by clicking the canvas and
// verifies, from per-frame sprite samples, what the old build got wrong:
//   - every fall and refill in a round starts on the same frame;
//   - each falls monotonically (accelerating) to its cell, and never shows at its destination early;
//   - refills appear above the top edge, one cell apart, as if the column continued upward;
//   - landings squash and rebound; nothing overlaps in a column; nothing blinks out unless it popped.
// Then it captures a slow-motion frame sequence of one cascade, saves a contact sheet, and plays
// a dozen more moves by clicking, checking sprites match the model after each.
//
//   npx tsx scripts/feel-check.ts [baseUrl] [outDir]
//   (defaults: http://localhost:5173/ and .playwright-mcp/feel; start `npm run dev` first,
//   the debug handle it uses exists only in the dev build)
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import type { Move, Pos, Step } from '../src/engine';
import type { DebugHandle, FrameSample } from '../src/app/debug';
import { ANIM } from '../src/render/constants';

const args = process.argv.slice(2);
const base = args[0] ?? 'http://localhost:5173/';
const out = resolve(args[1] ?? '.playwright-mcp/feel');
const SEED = 1234;
const SLOW = 0.08; // time scale for the frame capture: 1 captured frame ≈ a few ms of game time
mkdirSync(out, { recursive: true });

declare global { interface Window { __voltline?: DebugHandle } }

const fails: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) fails.push(msg); };

async function open(page: Page, seed: number) {
  await page.goto(`${base}?seed=${seed}`);
  await page.waitForFunction(() => window.__voltline !== undefined);
  await idle(page);
}

const idle = (page: Page) => page.waitForFunction(() => window.__voltline!.controller.snapshot().busy === false);

async function clickCell(page: Page, p: Pos) {
  const box = (await page.locator('canvas').boundingBox())!;
  const g = await page.evaluate(() => window.__voltline!.geometry());
  await page.mouse.click(box.x + g.boardX + (p.col + 0.5) * g.cellPx, box.y + g.boardY + (p.row + 0.5) * g.cellPx);
}

async function clickSwap(page: Page, m: Move) {
  if (m.type !== 'swap') throw new Error('swap expected');
  await clickCell(page, m.a);
  await clickCell(page, m.b);
}

interface Mover { id: number; col: number; fromRow: number; toRow: number; spawn: boolean }

/** Checks one cascade's frames against its script. Returns a short report. */
function analyze(label: string, frames: FrameSample[], script: Step[], g: { boardX: number; boardY: number; cellPx: number },
  timeScale: number) {
  const cell = g.cellPx;
  const yOf = (row: number) => g.boardY + (row + 0.5) * cell;
  const at = (f: FrameSample, id: number) => f.sprites.find((s) => s.id === id);
  const cleared = new Set(script.flatMap((s) => (s.t === 'clear' ? s.cleared.map((c) => c.id) : [])));
  const rounds = script.filter((s): s is Extract<Step, { t: 'fall' }> => s.t === 'fall');
  const report: string[] = [];
  const dts = frames.slice(1).map((f, i) => f.t - frames[i].t).sort((a, b) => a - b);
  report.push(`${label}: ${frames.length} frames, frame ms p50 ${dts[dts.length >> 1].toFixed(1)} p95 ${dts[Math.floor(dts.length * 0.95)].toFixed(1)}`);

  // Each round is searched only after the one before it has fully settled (its landing squash
  // and rebound move pieces too), and round 0 only after the swap that started it.
  const frameMs = dts[dts.length >> 1];
  const swap = script.find((s): s is Extract<Step, { t: 'swap' }> => s.t === 'swap');
  const swapIds: number[] = swap ? [...swap.ids] : [];
  const moved = (i: number, id: number) => {
    const a0 = at(frames[0], id);
    const s = at(frames[i], id);
    return !!a0 && !!s && (Math.abs(s.x - a0.x) > 0.25 || Math.abs(s.y - a0.y) > 0.25);
  };
  const swapStart = Math.max(0, frames.findIndex((_, i) => swapIds.some((id) => moved(i, id))));
  const swapEnd = swapStart + Math.ceil(ANIM.swapMs / timeScale / frameMs);
  let searchFrom = swapStart + Math.floor(ANIM.swapMs / timeScale / frameMs);

  rounds.forEach((round, ri) => {
    const movers: Mover[] = [
      ...round.falls.map((f) => ({ id: f.id, col: f.to.col, fromRow: f.from.row, toRow: f.to.row, spawn: false })),
      ...round.spawns.map((s) => ({ id: s.piece.id, col: s.to.col, fromRow: s.fromRow, toRow: s.to.row, spawn: true })),
    ];
    if (movers.length === 0) return;
    const starts = new Map<number, number>();
    let lastLanded = searchFrom;
    for (const m of movers) {
      const from = yOf(m.fromRow);
      const to = yOf(m.toRow);
      let start = -1;
      for (let i = searchFrom; i < frames.length && start < 0; i++) {
        const s = at(frames[i], m.id);
        if (s !== undefined && s.y > from + 1e-3) start = i;
      }
      if (start < 0) { fails.push(`${label} round ${ri}: piece ${m.id} never moved`); continue; }
      starts.set(m.id, start);
      // A swapped piece can fall straight back into the cell it was swapped out of.
      for (let i = swapIds.includes(m.id) ? swapEnd + 1 : 0; i < start; i++) {
        const s = at(frames[i], m.id);
        // A refill exists only from its fall's first frame, and then exactly at its spawn cell.
        if (m.spawn) check(s === undefined || Math.abs(s.y - from) < 1e-3, `${label} round ${ri}: refill ${m.id} drawn before its fall`);
        else if (s && Math.abs(s.y - to) < 0.5) fails.push(`${label} round ${ri}: piece ${m.id} at its destination before falling`);
      }
      if (m.spawn) check(frames.find((f) => at(f, m.id))!.sprites.find((x) => x.id === m.id)!.y < g.boardY, `${label} round ${ri}: refill ${m.id} first drawn inside the board`);
      let prev = -Infinity;
      let prevStep = 0;
      let landed = -1;
      for (let i = start; i < frames.length; i++) {
        const s = at(frames[i], m.id);
        if (!s) break;
        if (s.y >= to - 0.25) { landed = i; break; }
        check(s.y >= prev - 0.01, `${label} round ${ri}: piece ${m.id} moved up while falling`);
        // Constant gravity: each frame's step is at least the last one (allowing for frame jitter).
        const step = s.y - prev;
        if (prev > -Infinity && frames[i].t - frames[i - 1].t > 0.8 * frameMs) {
          check(step >= prevStep * 0.6 - 0.5, `${label} round ${ri}: piece ${m.id} decelerated mid-fall`);
        }
        if (prev > -Infinity) prevStep = step;
        check(Math.abs(s.x - (g.boardX + (m.col + 0.5) * cell)) < 0.5, `${label}: piece ${m.id} drifted sideways while falling`);
        prev = s.y;
      }
      check(landed > start, `${label} round ${ri}: piece ${m.id} never reached its cell`);
      if (landed > 0) {
        lastLanded = Math.max(lastLanded, landed);
        const win = frames.slice(landed, landed + Math.ceil(ANIM.landMs / timeScale / frameMs) + 2)
          .map((f) => at(f, m.id)).filter((x) => x !== undefined);
        check(Math.min(...win.map((x) => x.sy)) < 0.97, `${label} round ${ri}: piece ${m.id} landed without a squash`);
        check(Math.min(...win.map((x) => x.y)) < to - 0.03 * cell, `${label} round ${ri}: piece ${m.id} landed without a rebound`);
      }
    }
    searchFrom = lastLanded + Math.ceil(ANIM.landMs / timeScale / frameMs) + 1;
    const startFrames = new Set(starts.values());
    check(startFrames.size === 1, `${label} round ${ri}: falls started on ${startFrames.size} different frames (${[...startFrames].join(',')})`);
    if (startFrames.size > 1 && process.env.FEEL_DEBUG) {
      for (const m of movers) {
        const st = starts.get(m.id)!;
        const ys = frames.slice(st - 3, st + 2).map((f) => at(f, m.id)?.y.toFixed(3));
        process.stderr.write(`    id ${m.id} ${m.spawn ? 'spawn' : 'fall'} ${m.fromRow}->${m.toRow} start ${st} from ${yOf(m.fromRow).toFixed(3)} ys ${ys.join(' ')}\n`);
      }
    }
    const s0 = [...startFrames][0];
    const cols = new Map<number, number[]>();
    for (const sp of round.spawns) {
      const s = at(frames[s0], sp.piece.id);
      if (s) cols.set(sp.to.col, [...(cols.get(sp.to.col) ?? []), s.y]);
    }
    for (const [col, ys] of cols) {
      ys.sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) {
        check(Math.abs(ys[i] - ys[i - 1] - cell) < 0.5, `${label} round ${ri}: refills in column ${col} not one cell apart`);
      }
    }
    report.push(`  round ${ri}: ${round.falls.length} falls + ${round.spawns.length} refills in ${new Set(movers.map((m) => m.col)).size} columns, all started on frame ${[...startFrames].join(',')}`);
  });

  // Nothing blinks: a sprite only leaves after collapsing in a pop; no column ever overlaps.
  for (let i = 1; i < frames.length; i++) {
    const now = new Set(frames[i].sprites.map((s) => s.id));
    for (const s of frames[i - 1].sprites) {
      if (now.has(s.id)) continue;
      check(cleared.has(s.id) && s.sx < 0.5, `${label}: sprite ${s.id} vanished at frame ${i} (scale ${s.sx.toFixed(2)})`);
    }
    for (const s of frames[i].sprites) {
      check(s.visible && s.alpha > 0.99, `${label}: sprite ${s.id} hidden or faded at frame ${i}`);
    }
    const byCol = new Map<number, number[]>();
    for (const s of frames[i].sprites) {
      if (s.sx < 0.6) continue; // a popping piece shrinking in place
      if (i <= swapEnd && swapIds.includes(s.id)) continue; // the swapped pair crosses by design
      const col = Math.round((s.x - g.boardX) / cell - 0.5);
      byCol.set(col, [...(byCol.get(col) ?? []), s.y]);
    }
    for (const [col, ys] of byCol) {
      ys.sort((a, b) => a - b);
      for (let k = 1; k < ys.length; k++) {
        check(ys[k] - ys[k - 1] > 0.8 * cell, `${label}: overlap in column ${col} at frame ${i} (${(ys[k] - ys[k - 1]).toFixed(1)} px)`);
      }
    }
  }
  return report;
}

async function cascadeRun(page: Page, label: string, timeScale = 1) {
  const c = await page.evaluate(() => window.__voltline!.cascadeMove(2));
  if (!c) throw new Error(`${label}: no cascading move on this board`);
  await page.evaluate(() => window.__voltline!.record());
  await clickSwap(page, c.move);
  await page.waitForFunction(() => window.__voltline!.controller.snapshot().busy === true);
  await idle(page);
  const frames = await page.evaluate(() => window.__voltline!.stop());
  const g = await page.evaluate(() => window.__voltline!.geometry());
  const rounds = c.script.filter((s) => s.t === 'fall').length;
  return [`${label}: move ${JSON.stringify(c.move)} → ${rounds} fall rounds`, ...analyze(label, frames, c.script, g, timeScale)];
}

/** Every sprite on its model cell at rest, one per piece. */
async function checkAtRest(page: Page, label: string) {
  const r = await page.evaluate(() => {
    const h = window.__voltline!;
    const g = h.geometry();
    h.record();
    return { g, board: h.controller.state.board.map((row) => row.map((p) => p?.id ?? null)) };
  });
  await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
  const frames = await page.evaluate(() => window.__voltline!.stop());
  const f = frames[frames.length - 1];
  check(f.sprites.length === 64, `${label}: ${f.sprites.length} sprites, expected 64`);
  r.board.forEach((row, ri) => row.forEach((id, ci) => {
    const s = f.sprites.find((x) => x.id === id);
    const ok = s && Math.abs(s.x - (r.g.boardX + (ci + 0.5) * r.g.cellPx)) < 0.5
      && Math.abs(s.y - (r.g.boardY + (ri + 0.5) * r.g.cellPx)) < 0.5 && s.sx === 1 && s.sy === 1;
    check(!!ok, `${label}: piece ${id} not at rest on (${ri}, ${ci})`);
  }));
}

/** Slow-motion capture of one cascade: screenshots as fast as Playwright takes them. */
async function capture(page: Page) {
  const c = await page.evaluate(() => window.__voltline!.cascadeMove(2));
  if (!c) throw new Error('capture: no cascading move');
  const box = (await page.locator('canvas').boundingBox())!;
  const g = await page.evaluate(() => window.__voltline!.geometry());
  const pad = 12;
  const clip = { x: box.x + g.boardX - pad, y: box.y + g.boardY - pad, width: g.cellPx * 8 + 2 * pad, height: g.cellPx * 9.4 + 2 * pad };
  await page.evaluate((k) => window.__voltline!.timeScale(k), SLOW);
  await clickSwap(page, c.move);
  const shots: string[] = [];
  for (let i = 0; i < 400; i++) {
    const busy = await page.evaluate(() => window.__voltline!.controller.snapshot().busy);
    if (!busy && i > 0) break;
    const path = `${out}/frame-${String(i).padStart(3, '0')}.png`;
    await page.screenshot({ path, clip });
    shots.push(path);
  }
  await page.evaluate(() => window.__voltline!.timeScale(1));
  return shots;
}

/** A grid of downscaled frames in one PNG, for looking at a sequence at a glance. */
async function contactSheet(page: Page, shots: string[], cols: number, path: string) {
  const { readFileSync } = await import('node:fs');
  const data = shots.map((p) => readFileSync(p).toString('base64'));
  const sheet = await page.evaluate(async ([imgs, n]) => {
    const els = await Promise.all((imgs as string[]).map(async (s) => {
      const img = new Image();
      img.src = `data:image/png;base64,${s}`;
      await img.decode();
      return img;
    }));
    const w = 240;
    const h = Math.round((els[0].height / els[0].width) * w);
    const rows = Math.ceil(els.length / (n as number));
    const cv = document.createElement('canvas');
    cv.width = w * (n as number); cv.height = h * rows;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.font = '14px sans-serif'; ctx.fillStyle = '#fff';
    els.forEach((img, i) => {
      const x = (i % (n as number)) * w;
      const y = Math.floor(i / (n as number)) * h;
      ctx.drawImage(img, x, y, w, h);
      ctx.fillText(String(i), x + 4, y + 16);
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, [data, cols] as const);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(path, Buffer.from(sheet, 'base64'));
}

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  // tsx compiles with keepNames, which wraps inner functions in a `__name` helper the page lacks.
  await ctx.addInitScript('window.__name = (f) => f');
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  const report: string[] = [];
  await open(page, SEED);
  report.push(...await cascadeRun(page, 'cascade'));
  await checkAtRest(page, 'after cascade');

  // Twelve more moves by clicking, plus a deselect and an invalid swap along the way.
  const moves0 = await page.evaluate(() => window.__voltline!.controller.state.moves);
  await clickCell(page, { row: 0, col: 0 });
  await clickCell(page, { row: 0, col: 0 });
  check(await page.evaluate(() => window.__voltline!.controller.snapshot().selected === null), 'tapping the selected cell did not deselect');
  for (let n = 0; n < 12; n++) {
    const c = await page.evaluate(() => window.__voltline!.cascadeMove(1));
    if (!c) break;
    await clickSwap(page, c.move);
    await idle(page);
    await checkAtRest(page, `move ${n + 1}`);
  }
  const moves1 = await page.evaluate(() => window.__voltline!.controller.state.moves);
  report.push(`clicked moves: ${moves1 - moves0}`);
  check(moves1 - moves0 >= 10, `only ${moves1 - moves0} moves played by clicking`);

  // Reduced motion: same physics, shortened.
  const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await rctx.addInitScript('window.__name = (f) => f');
  const rpage = await rctx.newPage();
  rpage.on('pageerror', (e) => errors.push(`reduced: ${e.message}`));
  await open(rpage, SEED);
  report.push(...await cascadeRun(rpage, 'reduced-motion cascade', ANIM.reducedMotionTimeScale));
  await rctx.close();

  // Slow-motion frames of a cascade on a fresh board.
  await open(page, SEED + 1);
  const shots = await capture(page);
  report.push(`captured ${shots.length} slow-motion frames (time scale ${SLOW})`);
  process.stdout.write(`${report.join('\n')}\n`);
  report.length = 0;
  const step = Math.max(1, Math.ceil(shots.length / 48));
  const sheetPage = await ctx.newPage();
  await contactSheet(sheetPage, shots.filter((_, i) => i % step === 0), 8, `${out}/contact-sheet.png`);
  await ctx.close();

  fails.push(...errors);
  if (report.length) process.stdout.write(`${report.join('\n')}\n`);
  if (fails.length) {
    process.stderr.write(`FAIL (${fails.length})\n${[...new Set(fails)].slice(0, 40).join('\n')}\n`);
    process.exitCode = 1;
  } else process.stdout.write(`OK: frames in ${out}\n`);
} finally {
  await browser.close();
}
