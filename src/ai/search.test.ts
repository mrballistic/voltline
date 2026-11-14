import { describe, expect, it } from 'vitest';
import { applyMove, newGame, productiveMoves } from '../engine';
import type { GameState, Move } from '../engine';
import { boardWith, makeState } from '../engine/testing';
import { hashVisible } from './hash';
import { rankMoves } from './search';
import { TOP_PLACEMENTS, W } from './weights';

const swap = (r1: number, c1: number, r2: number, c2: number): Move => ({
  type: 'swap', a: { row: r1, col: c1 }, b: { row: r2, col: c2 },
});

// A mid-game state reached by always playing the first productive move.
function midGame(seed: number, plies: number): GameState {
  let s = newGame(seed);
  for (let i = 0; i < plies && !s.over; i++) s = applyMove(s, productiveMoves(s)[0]).state;
  return s;
}

describe('hashVisible', () => {
  it('ignores ids, rng and seed but sees the tray', () => {
    const s = makeState(boardWith());
    const renumbered = { ...s, board: s.board.map((row) => row.map((p) => p && { ...p, id: p.id + 100 })) };
    expect(hashVisible(renumbered)).toBe(hashVisible(s));
    expect(hashVisible({ ...s, rngState: 999, seed: 42 })).toBe(hashVisible(s));
    expect(hashVisible({ ...s, tray: ['red'] })).not.toBe(hashVisible(s));
  });
});

describe('rankMoves', () => {
  it('returns only productive moves', () => {
    const s = midGame(7, 5);
    const ranked = rankMoves(s);
    const productive = productiveMoves(s);
    expect(productive.length).toBeGreaterThan(1);
    expect(ranked.map((r) => r.move)).toHaveLength(productive.length);
    expect(ranked.map((r) => r.move)).toEqual(expect.arrayContaining(productive));
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].value).toBeGreaterThanOrEqual(ranked[i].value);
  });

  it('empty on dead board', () => {
    expect(rankMoves(makeState(boardWith()))).toEqual([]);
  });

  it('ignores the hidden rng', () => {
    const s = midGame(11, 3);
    expect(rankMoves({ ...s, rngState: 1, seed: 1 })).toEqual(rankMoves({ ...s, rngState: 999, seed: 5 }));
  });

  it('ignores the hidden rng at stingy levels', () => {
    // Stingy refills re-roll from the rng the rollouts are given, which is the AI's own.
    const s = { ...midGame(11, 3), level: 14 };
    expect(rankMoves({ ...s, rngState: 1, seed: 1 })).toEqual(rankMoves({ ...s, rngState: 999, seed: 5 }));
  });

  it('same state same ranking', () => {
    const s = midGame(3, 4);
    const again = structuredClone(s);
    expect(rankMoves(s)).toEqual(rankMoves(again));
  });

  it('prefers a 5-line over a 3-line', () => {
    // Row 7 reads R R Y R R with a red above the yellow: (6,2)↓ makes a red 5-line (a prism).
    // Row 0 reads R R Y with a red below the yellow: (1,2)↑ makes a plain red 3-line.
    const s = makeState(boardWith({ '7,1': 'R', '7,3': 'R', '7,4': 'R', '6,2': 'R', '0,1': 'R', '1,2': 'R' }));
    const line5 = swap(6, 2, 7, 2);
    const line3 = swap(0, 2, 1, 2);
    expect(productiveMoves(s)).toEqual(expect.arrayContaining([line5, line3]));
    const ranked = rankMoves(s);
    expect(ranked[0].move).toEqual(line5);
    expect(ranked[0].expectedPoints).toBeGreaterThanOrEqual(500);
    expect(ranked.slice(1).map((r) => r.move)).toContainEqual(line3);
  });

  it('ranks prism↔rock swaps and prefers them on a rock-heavy board', () => {
    // The prism at (0,1) touches rocks (0,0) and (1,1) and a gem (0,2); nothing else on the board
    // moves. Swapping with a rock clears all ten rocks, swapping with the gem only its color.
    const rocks = ['0,0', '1,1', '2,3', '3,1', '3,5', '4,7', '5,0', '5,2', '6,4', '7,6'];
    const s = makeState(boardWith({ '0,1': 'P', ...Object.fromEntries(rocks.map((k) => [k, 'X'])) }));
    const withRock = [swap(0, 0, 0, 1), swap(0, 1, 1, 1)];
    const withGem = swap(0, 1, 0, 2);
    expect(productiveMoves(s)).toEqual([withRock[0], withGem, withRock[1]]);
    const ranked = rankMoves(s);
    expect(ranked.map((r) => r.move).slice(0, 2)).toEqual(expect.arrayContaining(withRock));
    expect(ranked[2].move).toEqual(withGem);
    expect(ranked[0].expectedPoints).toBeGreaterThanOrEqual(20 * (rocks.length + 1));
  });

  it('avoids a move that ends the game when another exists', () => {
    // (2,4)↔(2,5) makes a magenta column at the top of col 4 and leaves the blue setup in row 3
    // alone. (3,4)↔(3,5) clears blue in row 3, which drops col 5 and breaks the magenta setup,
    // so most refills leave no productive move at all.
    const s = makeState(boardWith({ '3,4': 'B', '3,7': 'B', '1,4': 'M' }));
    const safe = swap(2, 4, 2, 5);
    const fatal = swap(3, 4, 3, 5);
    expect(productiveMoves(s)).toEqual([safe, fatal]);
    const ranked = rankMoves(s);
    expect(ranked.map((r) => r.move)).toEqual([safe, fatal]);
    // Most fatal rollouts end the game; few safe ones do (a refill can still wipe the blue setup).
    expect(ranked[1].value).toBeLessThan(W.gameOver / 2);
    expect(ranked[0].value).toBeGreaterThan(W.gameOver / 5);
  });

  it('values are in point units', () => {
    // The only move: (2,0)↔(2,1) completes a red column 0, rows 0–2; the drop always leaves a move.
    const s = makeState(boardWith({ '1,0': 'R', '3,2': 'C', '0,3': 'B' }));
    expect(productiveMoves(s)).toEqual([swap(2, 0, 2, 1)]);
    const [only, ...rest] = rankMoves(s);
    expect(rest).toEqual([]);
    expect(only.expectedPoints).toBeGreaterThanOrEqual(100);
    expect(Number.isFinite(only.value)).toBe(true);
    expect(only.value).toBeGreaterThanOrEqual(only.expectedPoints - W.trayPieceSpent - W.belowFloorPenalty);
  });

  it('a board with no productive swap is saved by a matching placement', () => {
    // Row 0 reads R R Y …: no swap matches anywhere, but placing the tray red on (0,2) does.
    const s = makeState(boardWith({ '0,1': 'R' }), { tray: ['red'] });
    const productive = productiveMoves(s);
    expect(productive.some((m) => m.type === 'swap')).toBe(false);
    expect(productive).toContainEqual({ type: 'place', slot: 0, at: { row: 0, col: 2 } });
    const [best] = rankMoves(s);
    expect(best.move.type).toBe('place');
    expect(applyMove(s, best.move).script.some((step) => step.t === 'clear')).toBe(true);
  });

  it('full tray: every placement is ranked, only the top few are rolled out', () => {
    const s = { ...midGame(1, 9), tray: ['red', 'blue', 'yellow', 'green', 'magenta'] as GameState['tray'] };
    const productive = productiveMoves(s);
    const placements = productive.filter((m) => m.type === 'place');
    expect(placements.length).toBeGreaterThan(TOP_PLACEMENTS);
    const rolled = new Map<string, number>();
    const ranked = rankMoves(s, { onRollout: (m) => rolled.set(JSON.stringify(m), (rolled.get(JSON.stringify(m)) ?? 0) + 1) });
    expect(ranked.map((r) => r.move)).toHaveLength(productive.length);
    expect(ranked.map((r) => r.move)).toEqual(expect.arrayContaining(productive));
    const rolledPlacements = [...rolled.keys()].filter((k) => JSON.parse(k).type === 'place');
    expect(rolledPlacements).toHaveLength(TOP_PLACEMENTS);
    const swapCount = productive.length - placements.length;
    expect(rolled.size).toBe(swapCount + TOP_PLACEMENTS); // every swap is rolled out too
    expect(new Set(rolled.values()).size).toBe(1); // with one shared rollout count
    expect(rankMoves(s)).toEqual(ranked); // the hook doesn't change the result
  });
});
