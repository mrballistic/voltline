import { describe, expect, it } from 'vitest';
import { Ticker } from 'pixi.js';
import { gsap } from 'gsap';
import { driveGsapFrom } from './clock';

const FRAME = 1000 / 60;

function manualTicker(): Ticker & { frame(): void } {
  const t = new Ticker();
  t.autoStart = false;
  t.stop();
  let now = 0;
  t.update(now);
  return Object.assign(t, { frame: () => t.update((now += FRAME)) });
}

describe('driveGsapFrom', () => {
  it('advances GSAP exactly by the Pixi ticker, frame for frame', () => {
    const ticker = manualTicker();
    const stop = driveGsapFrom(ticker);
    const o = { y: 0 };
    gsap.to(o, { y: 60, duration: 1, ease: 'none' });
    for (let i = 0; i < 30; i++) ticker.frame();
    expect(o.y).toBeCloseTo(30, 0);
    stop();
  });

  it('only the newest ticker drives, and the old one hands back cleanly', () => {
    const a = manualTicker();
    const b = manualTicker();
    const stopA = driveGsapFrom(a);
    const stopB = driveGsapFrom(b);
    const o = { y: 0 };
    gsap.to(o, { y: 60, duration: 1, ease: 'none' });
    for (let i = 0; i < 15; i++) { a.frame(); b.frame(); }
    expect(o.y).toBeCloseTo(15, 0);
    stopB();
    for (let i = 0; i < 15; i++) a.frame();
    expect(o.y).toBeCloseTo(30, 0);
    stopA();
    stopA();
  });
});
