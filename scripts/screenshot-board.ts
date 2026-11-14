// Visual check of the static board: screenshots at desktop and phone sizes, a breathing check
// (two shots ~1.7 s apart must differ in the halos; with reduced motion they must not), and a
// shot of the reference art for side-by-side comparison. Fails on any console error.
//
//   npx tsx scripts/screenshot-board.ts [baseUrl] [outDir] [--csp]
//   (defaults: http://localhost:5173/ and .playwright-mcp/; start `npm run dev` first)
//   --csp serves every page under a strict CSP without 'unsafe-eval', as production will; run it
//   against `npm run preview` (the dev server itself needs eval for HMR).
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { DECLINED_CONSENT } from './consent';
import { computeLayout } from '../src/render/layout';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const strictCsp = process.argv.includes('--csp');
const base = args[0] ?? 'http://localhost:5173/';
const out = resolve(args[1] ?? '.playwright-mcp');
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:";

async function context(browser: Browser, opts: Parameters<Browser['newContext']>[0]) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(DECLINED_CONSENT);
  if (strictCsp) {
    await ctx.route('**/*', async (route) => {
      if (route.request().resourceType() !== 'document') return route.continue();
      const res = await route.fetch();
      await route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': CSP } });
    });
  }
  return ctx;
}
const SEED = 1234;
const BREATH_GAP_MS = 1700;
mkdirSync(out, { recursive: true });

const errors: string[] = [];
function watch(page: Page, label: string) {
  page.on('console', (m) => {
    // The CSP probe below is refused on purpose; the app itself has no inline scripts.
    if (strictCsp && m.text().startsWith('Executing inline script violates')) return;
    if (m.type() === 'error') errors.push(`${label}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
}

/** Mean absolute per-channel difference and share of pixels that changed by more than 8/255. */
async function diff(page: Page, a: Buffer, b: Buffer) {
  // tsx compiles with keepNames, which wraps inner functions in a `__name` helper the page lacks.
  await page.evaluate('window.__name = (f) => f');
  return page.evaluate(async ([a64, b64]) => {
    const load = async (s: string) => {
      const img = new Image();
      img.src = `data:image/png;base64,${s}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const [p, q] = await Promise.all([load(a64), load(b64)]);
    let sum = 0, changed = 0;
    for (let i = 0; i < p.length; i += 4) {
      const d = Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]);
      sum += d / 3;
      if (d / 3 > 8) changed++;
    }
    const px = p.length / 4;
    return { mean: sum / px, changedShare: changed / px };
  }, [a.toString('base64'), b.toString('base64')] as const);
}

async function boardClip(page: Page) {
  // The board is the canvas' centered square; clip to the canvas for the diff.
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  return box;
}

async function shoot(browser: Browser, name: string, viewport: { width: number; height: number }, dpr: number,
  reducedMotion: 'reduce' | 'no-preference' = 'no-preference') {
  const ctx = await context(browser, { viewport, deviceScaleFactor: dpr, reducedMotion });
  const page = await ctx.newPage();
  watch(page, name);
  await page.goto(`${base}?seed=${SEED}`);
  await page.locator('canvas').waitFor();
  // DevTools evaluation bypasses CSP, so probe with a page-inserted inline script instead:
  // under the policy it must be refused (the same script-src that refuses eval).
  if (strictCsp && await page.evaluate(`(() => { const s = document.createElement('script');
    s.textContent = 'window.__cspProbe = 1'; document.head.append(s); return window.__cspProbe === 1; })()`)) {
    errors.push(`${name}: CSP not enforced`);
  }
  await page.waitForTimeout(800);
  const clip = await boardClip(page);
  const a = await page.screenshot({ path: `${out}/${name}.png` });
  await page.waitForTimeout(BREATH_GAP_MS);
  const b = await page.screenshot({ path: `${out}/${name}-b.png` });
  const d = await diff(page, a, b);
  const pieces = await page.evaluate(() => document.querySelectorAll('canvas').length);
  await ctx.close();
  return { name, clip, canvases: pieces, ...d };
}

async function reference(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 720 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const url = pathToFileURL(resolve('docs/superpowers/specs/assets/voltline-pieces-reference.html')).href;
  await page.goto(url);
  // Todd's chosen setting.
  await page.locator('#k').evaluate((el: HTMLInputElement) => { el.value = '17'; el.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(500);
  await page.locator('.stage').screenshot({ path: `${out}/reference-17.png` });
  await ctx.close();
}

/** The dev-only showcase page (reference layout, or specials), clipped to board + tray. */
async function showcase(browser: Browser, mode: 'reference' | 'specials') {
  const viewport = { width: 1440, height: 900 };
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  watch(page, `showcase-${mode}`);
  await page.goto(`${base}scripts/board-showcase.html?mode=${mode}`);
  await page.waitForSelector('body[data-ready]');
  await page.waitForTimeout(800);
  const l = computeLayout(viewport.width, viewport.height);
  const pad = 16;
  const bottom = mode === 'specials' ? l.tray.y + l.tray.h : l.board.y + l.board.size;
  await page.screenshot({
    path: `${out}/showcase-${mode}.png`,
    clip: { x: l.board.x - pad, y: l.board.y - pad, width: l.board.size + 2 * pad, height: bottom - l.board.y + 2 * pad },
  });
  await ctx.close();
}

/** Resize desktop → phone → desktop: textures are rebuilt for the new cell size, nothing is lost. */
async function resizeCheck(browser: Browser) {
  const ctx = await context(browser, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  watch(page, 'resize');
  await page.goto(`${base}?seed=${SEED}`);
  await page.locator('canvas').waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/board-resized.png` });
  await ctx.close();
}

// Headless Chromium defaults to SwiftShader (software GL), which drops a 2× desktop canvas to a
// few fps and makes the breathing check meaningless; ask for the real GPU (Metal on macOS).
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const results = [
    await shoot(browser, 'board-desktop', { width: 1440, height: 900 }, 2),
    await shoot(browser, 'board-phone', { width: 390, height: 844 }, 2),
    await shoot(browser, 'board-reduced-motion', { width: 1440, height: 900 }, 1, 'reduce'),
  ];
  // The reference art is a local file and the showcase is dev-only, so neither runs under --csp.
  if (!strictCsp) {
    await reference(browser);
    await showcase(browser, 'reference');
    await showcase(browser, 'specials');
  }
  await resizeCheck(browser);
  for (const r of results) {
    process.stdout.write(`${r.name}: canvases=${r.canvases} canvas=${Math.round(r.clip.width)}x${Math.round(r.clip.height)} `
      + `breath diff mean=${r.mean.toFixed(3)} changed=${(r.changedShare * 100).toFixed(2)}%\n`);
  }
  const [desk, phone, still] = results;
  const fails: string[] = [];
  if (desk.changedShare < 0.002) fails.push('desktop halos did not visibly breathe');
  if (phone.changedShare < 0.002) fails.push('phone halos did not visibly breathe');
  if (still.changedShare > 0.0005) fails.push('reduced motion still animates');
  if (results.some((r) => r.canvases !== 1)) fails.push('expected exactly one canvas');
  fails.push(...errors);
  if (fails.length) {
    process.stderr.write(`FAIL\n${fails.join('\n')}\n`);
    process.exitCode = 1;
  } else process.stdout.write(`OK: screenshots in ${out}\n`);
} finally {
  await browser.close();
}
