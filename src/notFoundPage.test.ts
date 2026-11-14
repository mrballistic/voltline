// public/404.html is standalone (no build step), so its chrome rules are checked from source here
// rather than in a test beside it: anything in public/ ships as-is.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../public/404.html', import.meta.url), 'utf8');
const rule = (selector: string) => {
  // A rule whose whole selector is `selector` (not one listed after a comma).
  const m = new RegExp(`(?:^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(html);
  return m ? m[1] : '';
};

describe('404 page', () => {
  it('gives the button a 48 px target', () => {
    expect(rule('a.btn')).toMatch(/min-height:\s*48px/);
  });

  it('uses the app’s yellow focus ring', () => {
    expect(rule('a.btn:focus-visible')).toMatch(/outline:\s*2px solid #ffe14d;\s*outline-offset:\s*3px/);
  });
});
