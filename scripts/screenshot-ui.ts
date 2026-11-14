// Captures the chrome screenshots the README and the chrome spec list (docs/superpowers/specs/
// 2026-11-13-voltline-chrome-design.md, “Docs and screenshots”):
//   app-phone, app-desktop, ai-mode-running, ui-tray-full, ui-level-up, ui-game-over,
//   how-to-play-phone, how-to-play-desktop (all .webp) and 404 (.png).
// Plus `dock-fit`, a check rather than a screenshot to publish: with AI mode on, the AI dock's
// contents fit inside it, its targets stay 44 px, and toggling AI never changes its height, at
// phone sizes where the board (and so `--vl-board-px`) shrinks with the height.
/* eslint-disable @typescript-eslint/no-explicit-any -- pokes private controller fields in the dev build */
//
//   npx tsx scripts/screenshot-ui.ts [baseUrl] [outDir] [--publish] [--only name,name]
//   (start `npm run dev` first; dev build only)
//
// Drives the dev-only window.__voltline handle: it seeds the controller with a crafted state, so
// the real UI renders each state. PNGs go to outDir (default /tmp/voltline-ui); `--publish` also
// writes them to docs/screenshots/ under the same names (WebP via `cwebp -q 80`, 404 as PNG).
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--only');
const base = positional[0] ?? 'http://localhost:5173/';
const out = resolve(positional[1] ?? '/tmp/voltline-ui');
const only = option('--only')?.split(',');
const PUBLISH = resolve(import.meta.dirname, '../docs/screenshots');
mkdirSync(out, { recursive: true });

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const SEED = 7;
// The module path is a variable so tsc doesn't try to resolve the dev server's `/src/...` URL.
const TESTING_URL = '/src/engine/testing.ts';

const browser = await chromium.launch();
const errors: string[] = [];

async function open(b: Browser, viewport: { width: number; height: number }, path = `?seed=${SEED}`): Promise<Page> {
  const page = await (await b.newContext({ viewport, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}${path}`);
  if (path.startsWith('?')) {
    await page.waitForSelector('canvas');
    await page.waitForFunction(() => '__voltline' in window);
    await page.waitForTimeout(2500);
  }
  return page;
}

/** Replaces the controller's state, as `newGame` would, and redeals the board. */
const seed = (page: Page, cells: Record<string, string>, over: Record<string, unknown>) => page.evaluate(async ({ cells, over, url }) => {
  const t = await import(/* @vite-ignore */ url);
  const c = (window as any).__voltline.controller;
  c._state = t.makeState(t.boardWith(cells), over);
  c.shown = c.shownFrom(c._state);
  await c.d.player.show({ board: c._state.board, tray: c._state.tray });
  c.d.onChange(c.snapshot());
}, { cells, over, url: TESTING_URL });

const shots: Record<string, () => Promise<void>> = {
  // The idle board, seed 7, at both sizes.
  'app-desktop': async () => {
    const page = await open(browser, DESKTOP);
    await page.screenshot({ path: `${out}/app-desktop.png` });
    await page.context().close();
  },
  'app-phone': async () => {
    const page = await open(browser, PHONE);
    await page.screenshot({ path: `${out}/app-phone.png` });
    await page.context().close();
  },

  // AI mode on Slow, caught while it shows its arrows before a move.
  'ai-mode-running': async () => {
    const page = await open(browser, DESKTOP);
    await page.getByRole('switch', { name: 'AI' }).check();
    await page.getByRole('button', { name: 'Slow' }).click();
    await page.mouse.move(0, 0);
    await page.waitForFunction(() => (window as any).__voltline.controller.snapshot().aiMoves >= 2, undefined, { timeout: 30_000 });
    // The next ranking: once it lands, the arrows reveal over 1 s before the move.
    await page.waitForFunction(() => (window as any).__voltline.controller.snapshot().aiThinking, undefined, { timeout: 15_000, polling: 20 });
    await page.waitForFunction(() => !(window as any).__voltline.controller.snapshot().aiThinking, undefined, { timeout: 15_000, polling: 20 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/ai-mode-running.png` });
    await page.context().close();
  },

  // Tray full: five spare pieces, the yellow tray border and the persistent notice.
  'ui-tray-full': async () => {
    const page = await open(browser, DESKTOP);
    await seed(page, {}, { score: 1840, tray: ['red', 'blue', 'yellow', 'green', 'cyan'] });
    await page.evaluate(() => { const c = (window as any).__voltline.controller; c.notice = { kind: 'tray-full' }; c.d.onChange(c.snapshot()); });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/ui-tray-full.png` });
    await page.context().close();
  },

  // Level up: a real move that crosses the target; capture while “Level 2!” is up.
  'ui-level-up': async () => {
    const page = await open(browser, DESKTOP);
    await seed(page, { '4,2': 'R', '4,3': 'R', '3,4': 'R' }, { score: 950, tray: ['magenta', 'orange'] });
    await page.evaluate(() => {
      (window as any).__voltline.controller.swap({ row: 3, col: 4 }, { row: 4, col: 4 });
    });
    await page.waitForFunction(() => document.body.innerText.includes('Level 2!'), undefined, { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/ui-level-up.png` });
    await page.context().close();
  },

  // Game over: the dialog with a new best.
  'ui-game-over': async () => {
    const page = await open(browser, DESKTOP);
    await seed(page, {}, { score: 12480, level: 4, levelStartScore: 8750, levelTarget: 10000, tray: ['red', 'cyan'] });
    await page.evaluate(() => {
      const c = (window as any).__voltline.controller;
      c.shown.over = true; c.newBest = true; c.prefs.bestPlayer = 12480; c.d.onChange(c.snapshot());
    });
    await page.waitForSelector('#game-over-title');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/ui-game-over.png` });
    await page.context().close();
  },

  // How to play: tapped open on the phone; opened from the keyboard on desktop, so Got it shows the focus ring.
  'how-to-play-phone': async () => {
    const page = await open(browser, PHONE);
    await page.getByRole('button', { name: 'How to play' }).click();
    await page.waitForSelector('#how-to-play-title');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/how-to-play-phone.png` });
    await page.context().close();
  },
  'how-to-play-desktop': async () => {
    const page = await open(browser, DESKTOP);
    await page.getByRole('button', { name: 'How to play' }).focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('#how-to-play-title');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/how-to-play-desktop.png` });
    await page.context().close();
  },

  'dock-fit': async () => {
    for (const viewport of [{ width: 320, height: 700 }, { width: 360, height: 640 }, { width: 360, height: 700 },
      { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      const page = await open(browser, viewport);
      const dock = page.getByRole('group', { name: 'AI mode' });
      const offHeight = (await dock.boundingBox())!.height;
      await page.getByRole('switch', { name: 'AI' }).check();
      await page.waitForTimeout(400);
      // A long counter, so the widest text the dock will hold is measured.
      await page.evaluate(() => { const c = (window as any).__voltline.controller; c.aiMoves = 12345; c.d.onChange(c.snapshot()); });
      await page.waitForTimeout(100);
      const m = await dock.evaluate((el) => {
        const d = el.getBoundingClientRect();
        const kids = [...el.querySelectorAll('button, label, span')].map((k) => k.getBoundingClientRect());
        const targets = [...el.querySelectorAll('button, label')].map((k) => k.getBoundingClientRect().height);
        return {
          dock: { left: d.left, right: d.right, width: d.width, height: d.height },
          scroll: el.scrollWidth, client: el.clientWidth,
          outside: kids.filter((k) => k.width > 0 && (k.left < d.left - 0.5 || k.right > d.right + 0.5 || k.top < d.top - 0.5 || k.bottom > d.bottom + 0.5)).length,
          minTarget: Math.min(...targets),
          page: document.documentElement.clientWidth,
        };
      });
      const label = `${viewport.width}x${viewport.height}`;
      const box = (await dock.boundingBox())!;
      await page.screenshot({ path: `${out}/dock-fit-${label}.png`, clip: { x: 0, y: Math.max(0, box.y - 60), width: viewport.width, height: Math.min(viewport.height - Math.max(0, box.y - 60), box.height + 70) } });
      const problems = [
        m.scroll > m.client && `contents ${m.scroll} px in a ${m.client} px dock`,
        m.outside > 0 && `${m.outside} elements outside the dock`,
        m.minTarget < 44 && `a ${m.minTarget} px target`,
        m.dock.left < 0 || m.dock.right > m.page ? 'dock wider than the page' : false,
        Math.abs(m.dock.height - offHeight) > 0.5 && `height ${offHeight} off, ${m.dock.height} on`,
      ].filter(Boolean);
      process.stdout.write(`dock-fit ${label}: dock ${Math.round(m.dock.width)}×${Math.round(m.dock.height)}, contents ${m.scroll} ${problems.length ? `FAIL ${problems.join('; ')}` : 'ok'}\n`);
      if (problems.length) errors.push(`dock-fit ${label}: ${problems.join('; ')}`);
      await page.context().close();
    }
  },

  // The standalone 404 page, at the size of the shot it replaces.
  404: async () => {
    const page = await open(browser, { width: 800, height: 560 }, '404.html');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/404.png`, animations: 'disabled' });
    await page.context().close();
  },
};

try {
  for (const [name, shoot] of Object.entries(shots)) {
    if (only && !only.includes(name)) continue;
    await shoot();
    process.stdout.write(`${out}/${name}.png\n`);
    if (!flag('--publish') || name === 'dock-fit') continue;
    if (name === '404') copyFileSync(`${out}/404.png`, `${PUBLISH}/404.png`);
    else execFileSync('cwebp', ['-quiet', '-q', '80', `${out}/${name}.png`, '-o', `${PUBLISH}/${name}.webp`]);
  }
} finally {
  await browser.close();
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
