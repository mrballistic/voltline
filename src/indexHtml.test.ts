// index.html's head carries the page's search and social metadata and its JSON-LD. Crawlers read
// it raw (no JavaScript), so it is checked from source here: absolute URLs, a share image that
// exists at the size the tags declare, and structured data that parses.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SITE = 'https://voltline.mrballistic.com/';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const meta = (attr: 'name' | 'property', key: string) => {
  const m = new RegExp(`<meta ${attr}="${key.replace(/[.:]/g, '\\$&')}" content="([^"]*)"`).exec(html);
  return m ? m[1] : undefined;
};

/** Width and height from a JPEG's first start-of-frame marker. */
const jpegSize = (buf: Buffer) => {
  for (let i = 2; i < buf.length - 9; ) {
    if (buf[i] !== 0xff) throw new Error('not a JPEG marker');
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('no start-of-frame');
};

/** Width and height from a PNG's IHDR chunk. */
const pngSize = (buf: Buffer) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });

describe('index.html metadata', () => {
  it('has a description, canonical URL and theme color', () => {
    expect(meta('name', 'description')?.length).toBeGreaterThan(50);
    expect(html).toContain(`<link rel="canonical" href="${SITE}" />`);
    expect(meta('name', 'theme-color')).toBe('#0a0a11');
  });

  it('has a full Open Graph and Twitter card with absolute URLs', () => {
    for (const key of ['og:type', 'og:site_name', 'og:url', 'og:title', 'og:description', 'og:image', 'og:image:alt']) {
      expect(meta('property', key), key).toBeTruthy();
    }
    expect(meta('property', 'og:url')).toBe(SITE);
    expect(meta('property', 'og:image')).toBe(`${SITE}og-image.jpg`);
    expect(meta('property', 'og:image:type')).toBe('image/jpeg');
    expect(meta('name', 'twitter:description')).toBe(meta('property', 'og:description'));
    expect(meta('name', 'twitter:image:alt')).toBe(meta('property', 'og:image:alt'));
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    expect(meta('name', 'twitter:image')).toBe(meta('property', 'og:image'));
    expect(meta('name', 'twitter:title')).toBe(meta('property', 'og:title'));
  });

  it('declares the share image at its real size', () => {
    const file = readFileSync(new URL('../public/og-image.jpg', import.meta.url));
    const size = jpegSize(file);
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(file.length).toBeLessThan(300_000); // WhatsApp drops larger preview images
    expect(meta('property', 'og:image:width')).toBe(String(size.width));
    expect(meta('property', 'og:image:height')).toBe(String(size.height));
  });

  it('has JSON-LD that parses and describes a free VideoGame', () => {
    const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    expect(block).not.toBeNull();
    const data = JSON.parse(block![1]) as { '@context': string; '@graph': Record<string, unknown>[] };
    expect(data['@context']).toBe('https://schema.org');
    const game = data['@graph'].find((n) => n['@type'] === 'VideoGame')!;
    expect(game).toMatchObject({ name: 'Voltline', url: SITE, isAccessibleForFree: true, image: `${SITE}og-image.jpg` });
    expect(game.gamePlatform).toEqual(['Web browser', 'macOS']);
    // Every @id it points at is defined in the graph.
    const ids = new Set(data['@graph'].map((n) => n['@id']));
    for (const ref of html.match(/"@id": "[^"]+"/g)!.map((s) => s.slice(8, -1))) expect(ids.has(ref), ref).toBe(true);
  });

  it('links raster icons as well as the SVG, and each file exists at its size', () => {
    for (const href of ['./favicon.ico', './icon.svg', './apple-touch-icon.png', './site.webmanifest']) {
      expect(html, href).toContain(`href="${href}"`);
      expect(() => readFileSync(new URL(`../public/${href.slice(2)}`, import.meta.url)), href).not.toThrow();
    }
    expect(pngSize(readFileSync(new URL('../public/apple-touch-icon.png', import.meta.url)))).toEqual({ width: 180, height: 180 });
    const manifest = JSON.parse(readFileSync(new URL('../public/site.webmanifest', import.meta.url), 'utf8')) as { icons: { src: string; sizes: string }[] };
    for (const icon of manifest.icons.filter((i) => i.src.endsWith('.png'))) {
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngSize(readFileSync(new URL(`../public/${icon.src}`, import.meta.url))), icon.src).toEqual({ width: w, height: h });
    }
    // An .ico starts with reserved 0, type 1 (icon), then the image count.
    const ico = readFileSync(new URL('../public/favicon.ico', import.meta.url));
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 3]);
    // Each 16-byte directory entry starts with its width and height (one byte each).
    expect([0, 1, 2].map((k) => [ico[6 + 16 * k], ico[7 + 16 * k]])).toEqual([[16, 16], [32, 32], [48, 48]]);
  });

  it('has a robots.txt that allows crawling and points at a sitemap listing the canonical URL', () => {
    const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8');
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).not.toMatch(/^Disallow: \/\s*$/m);
    expect(robots).toMatch(new RegExp(`^Sitemap: ${SITE}sitemap\\.xml$`, 'm'));
    const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
    expect(sitemap).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])).toEqual([SITE]);
  });

  it('keeps every user-facing string in curly punctuation', () => {
    for (const key of ['description']) expect(meta('name', key)).not.toMatch(/['"]/);
    for (const key of ['og:title', 'og:description', 'og:image:alt']) expect(meta('property', key)).not.toMatch(/['"]/);
  });
});
