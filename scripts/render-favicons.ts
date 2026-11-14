// Renders the raster favicons for browsers and tools that can't use public/icon.svg:
//   public/favicon.ico          16, 32 and 48 px, from public/icon.svg (the thick small-size mark)
//   public/apple-touch-icon.png 180 px, iOS home screen
//   public/icon-192.png, icon-512.png  for public/site.webmanifest
// The large ones put public/logo-mark.svg (the full mark, pads included) on the page color,
// full bleed and centered inside the middle 64%, so iOS's rounding and Android's maskable
// crop never touch it.
//
//   npx tsx scripts/render-favicons.ts       (needs ImageMagick's `magick` for the .ico)
//
// Chromium (via Playwright) rasterizes the SVGs so gradients and strokes match the browser.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const PUBLIC = resolve(import.meta.dirname, '../public');
const BG = '#0a0a11';
const small = readFileSync(resolve(PUBLIC, 'icon.svg'), 'utf8');
const mark = readFileSync(resolve(PUBLIC, 'logo-mark.svg'), 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'voltline-favicons-'));

const smallPage = (px: number) =>
  `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${px}px;height:${px}px}</style>${small}`;
const largePage = (px: number) =>
  `<!doctype html><style>html,body{margin:0}body{width:${px}px;height:${px}px;background:${BG};display:grid;place-items:center}` +
  `svg{width:${Math.round(px * 0.64)}px;height:${Math.round(px * 0.64)}px}</style>${mark}`;

const browser = await chromium.launch();
try {
  const shot = async (html: string, px: number, path: string, transparent: boolean) => {
    const page = await browser.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
    await page.setContent(html);
    await page.screenshot({ path, omitBackground: transparent, clip: { x: 0, y: 0, width: px, height: px } });
    await page.close();
  };
  const icoParts: string[] = [];
  for (const px of [16, 32, 48]) {
    const p = join(tmp, `ico-${px}.png`);
    await shot(smallPage(px), px, p, true);
    icoParts.push(p);
  }
  execFileSync('magick', [...icoParts, resolve(PUBLIC, 'favicon.ico')]);
  await shot(largePage(180), 180, resolve(PUBLIC, 'apple-touch-icon.png'), false);
  await shot(largePage(192), 192, resolve(PUBLIC, 'icon-192.png'), false);
  await shot(largePage(512), 512, resolve(PUBLIC, 'icon-512.png'), false);
  process.stdout.write('wrote favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png\n');
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}
