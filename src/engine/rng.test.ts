import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

describe('Rng', () => {
  it('same seed gives same sequence', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('state round-trips', () => {
    const r = new Rng(7);
    for (let i = 0; i < 10; i++) r.next();
    const c = new Rng(r.state);
    for (let i = 0; i < 50; i++) expect(c.next()).toBe(r.next());
  });

  it('int stays in range', () => {
    const r = new Rng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 10000; i++) {
      const v = r.int(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(7);
  });
});
