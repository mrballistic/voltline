// Renders the social share image, public/og-image.png (1200x630), the one Open Graph and
// Twitter cards point at. It plays the dev `prism` fixture in slow motion at 2x device pixels,
// keeps the frame where every lightning bolt is drawn, and lays it out beside the V mark, the
// wordmark and a one-line pitch, in the game's own fonts.
//
//   npx tsx scripts/og-image.ts [baseUrl]      (start `npm run dev` first; dev build only)
//
// OG_FRAME picks the slow-motion frame (default 26: every bolt drawn to a still-whole star);
// OG_KEEP=1 also writes the raw board frames to .playwright-mcp/og-frames for choosing one.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { DECLINED_CONSENT } from './consent';
import { fixture } from '../src/app/devFixtures';
import { ANIM } from '../src/render/constants';
import type { Pos } from '../src/engine';
import type { DebugHandle } from '../src/app/debug';

declare global { interface Window { __voltline?: DebugHandle } }

const base = process.argv[2] ?? 'http://localhost:5173/';
const FRAME = Number(process.env.OG_FRAME ?? 26);
const KEEP = process.env.OG_KEEP === '1';
const SLOW = 0.06; // effects-check's time scale; device-scale shots are slower, so frame numbers differ from its sheet
const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'public/og-image.png');
const FRAMES_DIR = resolve(ROOT, '.playwright-mcp/og-frames');

async function clickCell(page: Page, p: Pos) {
  const box = (await page.locator('canvas').boundingBox())!;
  const g = await page.evaluate(() => window.__voltline!.geometry());
  await page.mouse.click(box.x + g.boardX + (p.col + 0.5) * g.cellPx, box.y + g.boardY + (p.row + 0.5) * g.cellPx);
}

/** The Prism firing, as a PNG of the board at device resolution. */
async function boardFrame(page: Page): Promise<Buffer> {
  await page.goto(`${base}?seed=1&fixture=prism`);
  await page.waitForFunction(() => window.__voltline !== undefined);
  await page.waitForFunction(() => window.__voltline!.controller.snapshot().busy === false);
  const box = (await page.locator('canvas').boundingBox())!;
  const g = await page.evaluate(() => window.__voltline!.geometry());
  const pad = g.cellPx * 0.25;
  const clip = { x: box.x + g.boardX - pad, y: box.y + g.boardY - pad, width: g.cellPx * 8 + 2 * pad, height: g.cellPx * 8 + 2 * pad };
  const { move } = fixture('prism');
  if (move.type !== 'swap') throw new Error('the prism fixture should be a swap');
  await page.evaluate((k) => window.__voltline!.timeScale(k), SLOW);
  await clickCell(page, move.a);
  await clickCell(page, move.b);
  await page.waitForTimeout((0.9 * ANIM.swapMs) / SLOW);
  if (KEEP) mkdirSync(FRAMES_DIR, { recursive: true });
  let chosen: Buffer | undefined;
  for (let i = 0; i <= FRAME; i++) {
    const shot = await page.screenshot({ clip, scale: 'device' });
    if (KEEP) writeFileSync(resolve(FRAMES_DIR, `prism-${String(i).padStart(3, '0')}.png`), shot);
    if (i === FRAME) chosen = shot;
  }
  return chosen!;
}

const font = (pkg: string, file: string) =>
  readFileSync(resolve(ROOT, `node_modules/@fontsource/${pkg}/files/${file}`)).toString('base64');

function card(board: Buffer): string {
  const mark = readFileSync(resolve(ROOT, 'public/logo-mark.svg'), 'utf8');
  return `<!doctype html><html><head><style>
@font-face { font-family: Orbitron; font-weight: 700; src: url(data:font/woff2;base64,${font('orbitron', 'orbitron-latin-700-normal.woff2')}) format('woff2'); }
@font-face { font-family: Rajdhani; font-weight: 500; src: url(data:font/woff2;base64,${font('rajdhani', 'rajdhani-latin-500-normal.woff2')}) format('woff2'); }
@font-face { font-family: Rajdhani; font-weight: 600; src: url(data:font/woff2;base64,${font('rajdhani', 'rajdhani-latin-600-normal.woff2')}) format('woff2'); }
html, body { margin: 0; }
.card { width: 1200px; height: 630px; box-sizing: border-box; display: flex; align-items: center; gap: 56px; padding: 0 56px 0 72px;
  background: radial-gradient(ellipse at 78% 50%, #16163a 0%, #0a0a11 62%), #0a0a11; color: #e8ecff; overflow: hidden; position: relative; }
.card::before { content: ''; position: absolute; inset: 0; opacity: 0.5;
  background-image: linear-gradient(rgba(120,140,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(120,140,255,0.06) 1px, transparent 1px);
  background-size: 48px 48px; }
.text { position: relative; flex: 1 1 auto; }
.brand { display: flex; align-items: center; gap: 22px; }
.brand svg { width: 92px; height: 92px; flex: none; }
.word { font-family: Orbitron; font-weight: 700; font-size: 76px; letter-spacing: 0.12em; color: #4dd8ff; text-shadow: 0 0 24px rgba(77,216,255,0.55); }
.word .v { margin-right: -0.12em; }
.pitch { margin: 34px 0 0; font-family: Rajdhani; font-weight: 600; font-size: 38px; line-height: 1.18; color: #e8ecff; max-width: 520px; }
.foot { margin-top: 30px; font-family: Rajdhani; font-weight: 500; font-size: 26px; letter-spacing: 0.04em; color: #9aa3d6; }
.foot b { color: #ff4fd8; font-weight: 600; }
.foot .url { display: inline-block; margin-top: 6px; color: #4dd8ff; letter-spacing: 0.06em; }
.board { position: relative; flex: none; width: 540px; height: 540px; border-radius: 18px; overflow: hidden;
  border: 2px solid rgba(77,216,255,0.35); box-shadow: 0 0 60px rgba(77,216,255,0.25), 0 30px 60px rgba(0,0,0,0.6); }
.board img { width: 100%; height: 100%; display: block; }
</style></head><body><div class="card">
  <div class="text">
    <div class="brand">${mark.replace(/<svg /, '<svg aria-hidden="true" ')}<div class="word"><span class="v">V</span>oltline</div></div>
    <p class="pitch">A neon match-three with chain reactions and an AI that plays like a strong human.</p>
    <div class="foot">Free in your browser <b>·</b> Mac app<br><span class="url">voltline.mrballistic.com</span></div>
  </div>
  <div class="board"><img src="data:image/png;base64,${board.toString('base64')}" alt=""></div>
</div></body></html>`;
}

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const game = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await game.addInitScript(DECLINED_CONSENT);
  // tsx compiles with keepNames, which wraps inner functions in a `__name` helper the page lacks.
  await game.addInitScript('window.__name = (f) => f');
  const board = await boardFrame(game);
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })).newPage();
  await page.setContent(card(board));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  process.stdout.write(`wrote ${OUT} (frame ${FRAME})\n`);
} finally {
  await browser.close();
}
