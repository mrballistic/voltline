// Effects check (Task 14): opens each dev fixture (`?fixture=charge|arc|prism|supernova`), plays
// its one move by clicking, and captures slow-motion frames of the effect for viewing. Then it
// plays the supernova at full speed for 2 s, sampling requestAnimationFrame deltas and each
// frame's work (tweens, effects, render; from the debug handle's profiler), and fails if the
// 95th-percentile frame work is 16.7 ms or more or any frame was dropped.
//
// Why work and not the rAF delta: with vsync on, every delta is the display's ~16.7 ms however
// cheap the frame (timer granularity rounds it to 16.6–16.8), so the delta can only show drops.
//
//   npx tsx scripts/effects-check.ts [baseUrl] [outDir]
//   (defaults: http://localhost:5173/ and .playwright-mcp/effects; start `npm run dev` first,
//   the fixtures and the debug handle exist only in the dev build)
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import type { Pos } from '../src/engine';
import type { DebugHandle } from '../src/app/debug';
import { FIXTURE_NAMES, fixture, type FixtureName } from '../src/app/devFixtures';
import { ANIM } from '../src/render/constants';

const args = process.argv.slice(2);
const base = args[0] ?? 'http://localhost:5173/';
const out = resolve(args[1] ?? '.playwright-mcp/effects');
const SLOW = 0.06; // time scale for the frame capture
const FRAMES = Number(process.env.FX_FRAMES ?? 40);
const P95_LIMIT_MS = 16.7;
mkdirSync(out, { recursive: true });

declare global { interface Window { __voltline?: DebugHandle } }

const fails: string[] = [];

async function open(page: Page, name: FixtureName) {
  await page.goto(`${base}?seed=1&fixture=${name}`);
  await page.waitForFunction(() => window.__voltline !== undefined);
  await page.waitForFunction(() => window.__voltline!.controller.snapshot().busy === false);
}

async function clickCell(page: Page, p: Pos) {
  const box = (await page.locator('canvas').boundingBox())!;
  const g = await page.evaluate(() => window.__voltline!.geometry());
  await page.mouse.click(box.x + g.boardX + (p.col + 0.5) * g.cellPx, box.y + g.boardY + (p.row + 0.5) * g.cellPx);
}

async function play(page: Page, name: FixtureName) {
  const { move } = fixture(name);
  if (move.type !== 'swap') throw new Error('swap expected');
  await clickCell(page, move.a);
  await clickCell(page, move.b);
}

async function boardClip(page: Page) {
  const box = (await page.locator('canvas').boundingBox())!;
  const g = await page.evaluate(() => window.__voltline!.geometry());
  const pad = g.cellPx * 0.6;
  return { x: box.x + g.boardX - pad, y: box.y + g.boardY - pad, width: g.cellPx * 8 + 2 * pad, height: g.cellPx * 8 + 2 * pad };
}

/** Slow-motion frames of one fixture's effect. */
async function capture(page: Page, name: FixtureName) {
  await open(page, name);
  const clip = await boardClip(page);
  await page.evaluate((k) => window.__voltline!.timeScale(k), SLOW);
  await play(page, name);
  // Skip most of the swap: the effects start when it ends.
  await page.waitForTimeout((0.9 * ANIM.swapMs) / SLOW);
  for (let i = 0; i < FRAMES; i++) {
    await page.screenshot({ path: `${out}/${name}-${String(i).padStart(3, '0')}.png`, clip, scale: 'css' });
  }
  await page.evaluate(() => window.__voltline!.timeScale(1));
}

/** A grid of downscaled frames in one PNG, for looking at a sequence at a glance. */
async function contactSheet(page: Page, name: FixtureName) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const data = Array.from({ length: FRAMES }, (_, i) => readFileSync(`${out}/${name}-${String(i).padStart(3, '0')}.png`).toString('base64'));
  const sheet = await page.evaluate(async (imgs) => {
    const els = await Promise.all(imgs.map(async (s) => {
      const img = new Image();
      img.src = `data:image/png;base64,${s}`;
      await img.decode();
      return img;
    }));
    const n = 5;
    const w = 320;
    const rows = Math.ceil(els.length / n);
    const cv = document.createElement('canvas');
    cv.width = w * n; cv.height = w * rows;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.font = '16px sans-serif'; ctx.fillStyle = '#fff';
    els.forEach((img, i) => {
      const x = (i % n) * w;
      const y = Math.floor(i / n) * w;
      ctx.drawImage(img, x, y, w, w);
      ctx.fillText(String(i), x + 4, y + 18);
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, data);
  writeFileSync(`${out}/${name}-sheet.png`, Buffer.from(sheet, 'base64'));
}

/** rAF deltas and per-frame work for `ms` from the moment the supernova swap is clicked. */
async function frameTimes(page: Page, ms: number): Promise<{ dts: number[]; work: number[] }> {
  await open(page, 'supernova');
  await page.evaluate((dur) => {
    const w = window as unknown as { __dts?: number[]; __dtsDone?: boolean };
    w.__dts = [];
    w.__dtsDone = false;
    window.__voltline!.profile();
    let last = performance.now();
    const t0 = last;
    const tick = (now: number) => {
      w.__dts!.push(now - last);
      last = now;
      if (now - t0 < dur) requestAnimationFrame(tick);
      else w.__dtsDone = true;
    };
    requestAnimationFrame(tick);
  }, ms);
  await play(page, 'supernova');
  await page.waitForFunction(() => (window as unknown as { __dtsDone?: boolean }).__dtsDone === true, undefined, { timeout: ms + 5000 });
  return page.evaluate(() => ({
    dts: (window as unknown as { __dts: number[] }).__dts.slice(1),
    work: window.__voltline!.stopProfile(),
  }));
}

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))];

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  // tsx compiles with keepNames, which wraps inner functions in a `__name` helper the page lacks.
  await ctx.addInitScript('window.__name = (f) => f');
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') fails.push(m.text()); });
  page.on('pageerror', (e) => fails.push(e.message));

  const only = process.env.FX_ONLY?.split(',') as FixtureName[] | undefined;
  if (!process.env.FX_SKIP_CAPTURE) {
    const sheets = await ctx.newPage();
    for (const name of only ?? FIXTURE_NAMES) {
      await capture(page, name);
      await contactSheet(sheets, name);
    }
  }

  await ctx.close();

  // Frame check at full speed, in a fresh context (no slow-motion leftovers).
  if (!process.env.FX_SKIP_PERF) {
    const pctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await pctx.addInitScript('window.__name = (f) => f');
    const perf = await pctx.newPage();
    perf.on('pageerror', (e) => fails.push(e.message));
    const { dts, work } = await frameTimes(perf, 2000);
    const dropped = dts.filter((d) => d > 1.5 * (1000 / 60)).length;
    const p95 = pct(work, 0.95);
    process.stdout.write(`supernova frame check (2 s): ${dts.length} frames, rAF delta p50 ${pct(dts, 0.5).toFixed(1)} p95 ${pct(dts, 0.95).toFixed(1)} max ${Math.max(...dts).toFixed(1)} ms, ${dropped} dropped; frame work p50 ${pct(work, 0.5).toFixed(2)} p95 ${p95.toFixed(2)} max ${Math.max(...work).toFixed(2)} ms\n`);
    if (p95 >= P95_LIMIT_MS) fails.push(`p95 frame work ${p95.toFixed(2)} ms is not under ${P95_LIMIT_MS} ms`);
    if (dropped > 0) fails.push(`${dropped} dropped frames during the supernova`);
    await pctx.close();
  }

  if (fails.length) {
    process.stderr.write(`FAIL (${fails.length})\n${[...new Set(fails)].join('\n')}\n`);
    process.exitCode = 1;
  } else process.stdout.write(`OK: frames in ${out}\n`);
} finally {
  await browser.close();
}
