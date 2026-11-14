// Sound wiring check (Task 18), against the dev server, by proxy (no one listens):
//   npx tsx scripts/audio-check.ts [baseUrl]   (start `npm run dev` first)
// Counts every AudioBufferSourceNode.start in the page and reads the engine's own log of the
// files it started (window.__voltline.audio()). Checks: silent before the first input; the first
// tap unlocks and plays `select`; moves, Hint, the AI switch and mute play their cues; a hidden
// tab starts nothing, even with a move playing, and coming back plays no backlog. Fails on any
// console error, or any warning other than the dev-only "[audio] missing" ones, which it lists.
// No AudioContext exists before the first gesture (the engine only fetches until then), so its
// state reads `none`. Playwright's Chromium would let a context run without a gesture whatever the
// autoplay flags, so the browser's own gate isn't observable here; the engine's is.
import { chromium, type Page } from '@playwright/test';
import { DECLINED_CONSENT } from './consent';
import type { DebugHandle } from '../src/app/debug';

declare global { interface Window { __voltline?: DebugHandle; __starts?: number } }
const base = process.argv[2] ?? 'http://localhost:5173/';

const fails: string[] = [];
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };
const audio = (p: Page) => p.evaluate(() => ({ ...window.__voltline!.audio(), starts: window.__starts ?? 0 }));
const idle = (p: Page) => p.waitForFunction(() => window.__voltline!.controller.snapshot().busy === false);
const count = (keys: string[]) => keys.reduce<Record<string, number>>((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {});

const browser = await chromium.launch();
const errors: string[] = [];
const missing: string[] = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.on('console', (m) => {
  const text = m.text();
  if (text.startsWith('[audio] missing')) missing.push(text.replace(/^.*\//, ''));
  else if (m.type() === 'error' || (m.type() === 'warning' && !text.includes('GL Driver Message'))) errors.push(`${m.type()}: ${text}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
// Every real source start, whatever started it.
const countStarts = () => {
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
    window.__starts = (window.__starts ?? 0) + 1;
    return start.apply(this, args);
  };
};
await page.addInitScript(countStarts);
await page.addInitScript(DECLINED_CONSENT);
await page.goto(`${base}?seed=7`);
await page.waitForFunction(() => window.__voltline !== undefined);
await idle(page);
await page.waitForTimeout(500); // let the files decode

const a0 = await audio(page);
check(a0.starts === 0 && a0.played.length === 0, `silent before any input (${a0.starts} starts)`);
check(a0.state === 'none', `no audio context before the first gesture (${a0.state})`);

const box = (await page.locator('canvas').boundingBox())!;
const g = await page.evaluate(() => window.__voltline!.geometry());
const at = (row: number, col: number) => ({ x: box.x + g.boardX + (col + 0.5) * g.cellPx, y: box.y + g.boardY + (row + 0.5) * g.cellPx });
const tap = (row: number, col: number) => page.mouse.click(at(row, col).x, at(row, col).y);

// 1. The first tap creates the context, and its own select still plays (held until the context
// runs and the file decodes). A second tap on the same cell deselects (quiet).
await tap(0, 0);
await page.waitForFunction(() => window.__voltline!.audio().state === 'running');
await page.waitForTimeout(300);
const first = await audio(page);
check(first.played.join() === 'select', `the first tap’s own select played once (${first.played.join(', ') || 'nothing'})`);
await tap(0, 0);
await tap(3, 3);
const a1 = await audio(page);
check(a1.state === 'running', `context running after the first tap (${a1.state})`);
check(a1.played.filter((k) => k === 'select').length >= 1, `select played on tap: ${a1.played.join(', ')}`);
await tap(3, 3);

// 2. A few moves, clicked: swaps, matches, landings, maybe specials.
for (let n = 0; n < 6; n++) {
  const m = await page.evaluate(() => window.__voltline!.cascadeMove(1)?.move ?? null);
  if (!m || m.type !== 'swap') break;
  await tap(m.a.row, m.a.col);
  await tap(m.b.row, m.b.col);
  await page.waitForTimeout(50);
  await idle(page);
}
const a2 = await audio(page);
const moved = count(a2.played.slice(a1.played.length));
console.log('     move cues:', JSON.stringify(moved));
check((moved.swap ?? 0) >= 1 && (moved.match ?? 0) >= 1 && Object.keys(moved).some((k) => k.startsWith('land')),
  'moves played swap, match and land');

// 3. Hint (ui-click, hint-scan, hint-lock), the AI switch and mute (ui-toggle).
await page.getByRole('button', { name: 'Hint' }).click();
await page.waitForTimeout(1600);
await tap(0, 0); // clears the hint
await tap(0, 0);
// Exact: a loose “AI” label match would also find the dock (“AI mode”) and the speed group.
const ai = page.getByRole('switch', { name: 'AI', exact: true });
await ai.click();
await page.waitForTimeout(150);
await ai.click();
await idle(page);
// The button is always named “Mute”; aria-pressed says whether sound is off.
const mute = page.getByRole('button', { name: 'Mute' });
check(await mute.getAttribute('aria-pressed') === 'false', 'Mute starts unpressed');
await mute.click();
await page.waitForTimeout(100);
check(await mute.getAttribute('aria-pressed') === 'true', 'Mute is pressed while muted');
const mutedBefore = await audio(page);
await tap(2, 2); // muted: no select
await tap(2, 2);
await page.waitForTimeout(100);
const mutedAfter = await audio(page);
check(mutedAfter.starts === mutedBefore.starts, `muted taps start nothing (${mutedAfter.starts - mutedBefore.starts})`);
await mute.click();
await page.waitForTimeout(100);
check(await mute.getAttribute('aria-pressed') === 'false', 'Mute is unpressed again after unmuting');
const a3 = await audio(page);
const ui = count(a3.played.slice(a2.played.length));
console.log('     ui cues:', JSON.stringify(ui));
check((ui['ui-click'] ?? 0) >= 1 && (ui['hint-scan'] ?? 0) >= 1 && (ui['hint-lock'] ?? 0) >= 1, 'Hint played ui-click, hint-scan, hint-lock');
check((ui['ui-toggle'] ?? 0) >= 3, `AI on, AI off and unmute played ui-toggle (${ui['ui-toggle'] ?? 0})`);

// 4. Hidden tab: the context suspends, a move playing meanwhile starts nothing, and the return
// plays no backlog. (Headless pages never really hide, so the page is told it is hidden.)
// A string, so tsx's name helpers never reach the page.
const setHidden = (hidden: boolean) => page.evaluate(`(() => {
  const h = ${hidden};
  Object.defineProperty(document, 'hidden', { configurable: true, get() { return h; } });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get() { return h ? 'hidden' : 'visible'; } });
  document.dispatchEvent(new Event('visibilitychange'));
})()`);
await setHidden(true);
await page.waitForFunction(() => window.__voltline!.audio().state === 'suspended');
const h0 = await audio(page);
await page.evaluate(() => {
  const m = window.__voltline!.cascadeMove(1)?.move;
  if (m) void window.__voltline!.controller.submit(m);
});
await page.waitForTimeout(50);
await idle(page);
await page.waitForTimeout(300);
const h1 = await audio(page);
check(h1.starts === h0.starts && h1.played.length === h0.played.length, `hidden tab started nothing during a move (${h1.starts - h0.starts})`);
await setHidden(false);
await page.waitForFunction(() => window.__voltline!.audio().state === 'running');
await page.waitForTimeout(500);
const h2 = await audio(page);
check(h2.starts === h1.starts, `no backlog on return (${h2.starts - h1.starts} starts)`);
await tap(4, 4);
await page.waitForTimeout(100);
const h3 = await audio(page);
check(h3.starts > h2.starts, 'sound is back after the tab returns');
await tap(4, 4);

// 5. Touch: a phone-sized touch page; one tap creates the context on its pointerup, and its select plays.
const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
phone.on('pageerror', (e) => errors.push(`phone pageerror: ${e.message}`));
await phone.addInitScript(countStarts);
await phone.addInitScript(DECLINED_CONSENT);
await phone.goto(`${base}?seed=7`);
await phone.waitForFunction(() => window.__voltline !== undefined);
await idle(phone);
await phone.waitForTimeout(500);
check((await audio(phone)).state === 'none', 'touch: no audio context before the first tap');
const pbox = (await phone.locator('canvas').boundingBox())!;
const pg = await phone.evaluate(() => window.__voltline!.geometry());
await phone.touchscreen.tap(pbox.x + pg.boardX + 2.5 * pg.cellPx, pbox.y + pg.boardY + 2.5 * pg.cellPx);
await phone.waitForFunction(() => window.__voltline!.audio().state === 'running');
await phone.waitForTimeout(300);
const touched = await audio(phone);
check(touched.played.join() === 'select' && touched.starts === 1, `touch: the first tap’s select played once (${touched.played.join(', ') || 'nothing'})`);
await phone.close();

// The engine's log and the real source starts agree.
check(h3.starts === h3.played.length, `every logged cue is a real source start (${h3.played.length} vs ${h3.starts})`);
console.log('     all cues:', JSON.stringify(count(h3.played)));
console.log(`     missing files (dev warnings, expected): ${missing.length ? missing.join(', ') : 'none'}`);
check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);

await browser.close();
if (fails.length) {
  console.log(`\n${fails.length} failed`);
  process.exit(1);
}
console.log('\nall ok');
