import { describe, expect, it } from 'vitest';
import { comboMult, levelTarget, rockChance } from './rules';

describe('rules boundaries', () => {
  it('rockChance steps in at level 10 and caps at 0.10', () => {
    expect(rockChance(9)).toBe(0);
    expect(rockChance(10)).toBeCloseTo(0.03);
    expect(rockChance(17)).toBeCloseTo(0.1);
    expect(rockChance(30)).toBeCloseTo(0.1);
  });
  it('comboMult by group count', () => {
    expect([0, 1, 2, 3, 4, 5].map(comboMult)).toEqual([1, 1, 1.5, 2, 2.5, 2.5]);
  });
  it('levelTarget grows by 2500', () => {
    expect(levelTarget(1)).toBe(1000);
    expect(levelTarget(3)).toBe(6000);
  });
});
