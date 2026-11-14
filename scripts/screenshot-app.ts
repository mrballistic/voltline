// Full-app screenshots (chrome plus board) at desktop and phone sizes; fails on console errors.
//   npx tsx scripts/screenshot-app.ts [baseUrl] [outDir]   (start `npm run dev` first)
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { DECLINED_CONSENT } from './consent';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = resolve(process.argv[3] ?? 'docs/screenshots');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const errors: string[] = [];
for (const [name, width, height] of [['app-desktop', 1440, 900], ['app-phone', 390, 844]] as const) {
  const page = await (await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })).newPage();
  await page.addInitScript(DECLINED_CONSENT);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`${base}?seed=7`);
  await page.waitForSelector('canvas');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}.png` });
}
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
