import { describe, expect, it } from 'vitest';
import { scoreRound } from './scoring';
import type { MatchGroup } from './types';

const g = (shape: MatchGroup['shape']): MatchGroup => ({ key: 'red', shape, cells: [] });

describe('scoreRound', () => {
  it('single line3 at chain 0 scores 100', () => {
    expect(scoreRound([g('line3')], 0, 0)).toEqual({ points: 100, combo: 1 });
  });
  it('two groups at chain 2 score (100+200)*4*1.5 = 1800', () => {
    expect(scoreRound([g('line3'), g('line4')], 0, 2)).toEqual({ points: 1800, combo: 1.5 });
  });
  it('chain caps at 32x', () => {
    expect(scoreRound([g('line3')], 0, 9).points).toBe(3200);
  });
  it('blast-only pieces score 20 each', () => {
    expect(scoreRound([], 3, 0)).toEqual({ points: 60, combo: 1 });
  });
  it('zero groups and zero pieces score nothing', () => {
    expect(scoreRound([], 0, 0)).toEqual({ points: 0, combo: 1 });
  });
});
