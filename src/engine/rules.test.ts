import { describe, expect, it } from 'vitest';
import { comboMult, levelTarget, rockChance, stinginess } from './rules';

describe('rules boundaries', () => {
  it('rockChance steps in at level 5, climbs faster past 8 and caps at 0.18', () => {
    expect(rockChance(4)).toBe(0);
    expect(rockChance(5)).toBeCloseTo(0.03);
    expect(rockChance(8)).toBeCloseTo(0.06);
    expect(rockChance(9)).toBeCloseTo(0.075);
    expect(rockChance(16)).toBeCloseTo(0.18);
    expect(rockChance(30)).toBeCloseTo(0.18);
  });
  it('stinginess starts at level 9 and caps at 0.6', () => {
    expect(stinginess(1)).toBe(0);
    expect(stinginess(8)).toBe(0);
    expect(stinginess(9)).toBeCloseTo(0.1);
    expect(stinginess(14)).toBeCloseTo(0.6);
    expect(stinginess(20)).toBeCloseTo(0.6);
  });
  it('comboMult by group count', () => {
    expect([0, 1, 2, 3, 4, 5].map(comboMult)).toEqual([1, 1, 1.5, 2, 2.5, 2.5]);
  });
  it('levelTarget grows by 2500', () => {
    expect(levelTarget(1)).toBe(1000);
    expect(levelTarget(3)).toBe(6000);
  });
});
