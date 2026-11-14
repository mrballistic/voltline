import type { MatchShape } from './types';

export const TRAY_CAPACITY = 5;
export const TRAY_THRESHOLD = 10;
export const ROCK_START_LEVEL = 5;
// Past this level rocks come faster (and, from STINGY_START_LEVEL, refills turn stingy).
const HARD_LEVEL = 8;

export function rockChance(level: number): number {
  if (level < ROCK_START_LEVEL) return 0;
  if (level <= HARD_LEVEL) return 0.03 + 0.01 * (level - ROCK_START_LEVEL);
  return Math.min(0.06 + 0.015 * (level - HARD_LEVEL), 0.18);
}

export const STINGY_START_LEVEL = 9;

// Chance that a refill gem which would complete a 3-in-a-row is re-rolled once to a color that
// doesn't (see gravity.ts).
export function stinginess(level: number): number {
  if (level < STINGY_START_LEVEL) return 0;
  return Math.min(0.1 * (level - HARD_LEVEL), 0.6);
}

export const MATCH_BASE: Record<MatchShape, number> = { line3: 100, line4: 200, line5: 500, cross: 300 };
export const BLAST_PIECE_BASE = 20;
export const CHAIN_MULT = [1, 2, 4, 8, 16, 32];

export function comboMult(groups: number): number {
  if (groups >= 4) return 2.5;
  if (groups === 3) return 2;
  if (groups === 2) return 1.5;
  return 1;
}

// Points needed to clear level n. Spec §5.7 started at 1000 + 750·(n−1); the Task 9 benchmark showed
// even the first-productive-move baseline reached level 13 in 400 moves (the AI 21), so the step is
// 2500 and the AI now typically reaches level 12–14.
export function levelTarget(level: number): number {
  return 1000 + 2500 * (level - 1);
}
