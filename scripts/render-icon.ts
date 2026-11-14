// Renders the desktop app icon: src-tauri/icons/source.svg (the V mark; a copy of the design
// master docs/design/voltline-chrome/logo-app-icon.svg, which this script checks) -> a 1024 px PNG
// with a transparent background (in a temp dir), then regenerates every icon size Tauri bundles from it.
//
//   npx tsx scripts/render-icon.ts
//
// Chromium (via Playwright) does the rasterizing because the art leans on SVG blur
// filters, which simpler converters draw poorly or not at all.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const ICONS = resolve(import.meta.dirname, '../src-tauri/icons');
const SVG = resolve(ICONS, 'source.svg');
const MASTER = resolve(import.meta.dirname, '../docs/design/voltline-chrome/logo-app-icon.svg');
const TMP = mkdtempSync(join(tmpdir(), 'voltline-icon-'));
const PNG = join(TMP, 'icon-1024.png');
const SIZE = 1024;

// The copy must carry the master's art: same markup once comments and the size attributes are dropped.
const art = (svg: string) => svg.replace(/<!--[\s\S]*?-->/g, '').replace(/ (width|height)="1024"(?= )/g, '').replace(/\s+/g, ' ').trim();
if (art(readFileSync(SVG, 'utf8')) !== art(readFileSync(MASTER, 'utf8'))) {
  throw new Error(`${SVG} has drifted from ${MASTER}; copy the master over it first`);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  const svg = readFileSync(SVG, 'utf8');
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`,
  );
  await page.screenshot({ path: PNG, omitBackground: true, clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
} finally {
  await browser.close();
}

execFileSync('npx', ['tauri', 'icon', PNG, '--output', ICONS], { stdio: 'inherit' });
// Desktop only: drop the mobile icon sets `tauri icon` also writes.
for (const dir of ['android', 'ios']) rmSync(resolve(ICONS, dir), { recursive: true, force: true });
rmSync(TMP, { recursive: true, force: true });
