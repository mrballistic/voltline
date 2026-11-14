import { describe, expect, it } from 'vitest';
import { allowedMoves, isAdjacent, isGameOver, productiveMoves } from './moves';
import { boardWith, makeState } from './testing';
import type { Move } from './types';

const swap = (r1: number, c1: number, r2: number, c2: number): Move => ({
  type: 'swap', a: { row: r1, col: c1 }, b: { row: r2, col: c2 },
});
const place = (slot: number, row: number, col: number): Move => ({ type: 'place', slot, at: { row, col } });
const places = (ms: Move[]) => ms.filter((m) => m.type === 'place');
const swaps = (ms: Move[]) => ms.filter((m) => m.type === 'swap');

describe('moves', () => {
  it('isAdjacent is orthogonal distance one', () => {
    expect(isAdjacent({ row: 3, col: 3 }, { row: 3, col: 4 })).toBe(true);
    expect(isAdjacent({ row: 3, col: 3 }, { row: 2, col: 3 })).toBe(true);
    expect(isAdjacent({ row: 3, col: 3 }, { row: 4, col: 4 })).toBe(false);
    expect(isAdjacent({ row: 3, col: 3 }, { row: 3, col: 3 })).toBe(false);
    expect(isAdjacent({ row: 3, col: 3 }, { row: 3, col: 5 })).toBe(false);
  });

  it('productive swaps found on a fixture with exactly two', () => {
    // Row 7 reads R R Y and row 6 reads M O R R: (6,2)↓ completes row 7, (7,1)↑ completes row 6.
    const s = makeState(boardWith({ '7,1': 'R', '6,2': 'R' }));
    expect(productiveMoves(s)).toEqual([swap(6, 1, 7, 1), swap(6, 2, 7, 2)]);
  });

  it('prism swap is productive with a gem and with a rock', () => {
    const s = makeState(boardWith({ '3,3': 'P', '3,4': 'X' }));
    expect(productiveMoves(s)).toEqual([swap(2, 3, 3, 3), swap(3, 2, 3, 3), swap(3, 3, 3, 4), swap(3, 3, 4, 3)]);
  });

  it('a board whose only productive move is prism↔rock is not game over', () => {
    // The prism sits in the corner with rocks on both sides; the dead board around it has no match.
    const s = makeState(boardWith({ '0,0': 'P', '0,1': 'X', '1,0': 'X' }));
    expect(productiveMoves(s)).toEqual([swap(0, 0, 0, 1), swap(0, 0, 1, 0)]);
    expect(isGameOver(s)).toBe(false);
  });

  it('prism + prism swap is productive', () => {
    const s = makeState(boardWith({ '3,3': 'P', '3,4': 'P' }));
    expect(productiveMoves(s)).toContainEqual(swap(3, 3, 3, 4));
  });

  it('placement listed only if it makes a match', () => {
    // Red at (0,1) sits next to red (0,0) and two above red (2,1).
    const s = makeState(boardWith({ '0,1': 'R' }), { tray: ['red'] });
    expect(productiveMoves(s)).toEqual([place(0, 0, 2), place(0, 1, 1)]);
  });

  it('allowedMoves includes non-matching placements, productiveMoves excludes them', () => {
    const s = makeState(boardWith({ '0,1': 'R' }), { tray: ['red'] });
    const allowed = allowedMoves(s);
    let nonRed = 0;
    for (const row of s.board) for (const p of row) if (p?.kind === 'gem' && p.color !== 'red') nonRed++;
    expect(places(allowed)).toHaveLength(nonRed);
    expect(allowed).toContainEqual(place(0, 5, 5));
    expect(productiveMoves(s)).not.toContainEqual(place(0, 5, 5));
    expect(swaps(allowed)).toEqual(swaps(productiveMoves(s)));
  });

  it('same-color tray slots deduplicated', () => {
    const s = makeState(boardWith(), { tray: ['red', 'blue', 'red'] });
    const slots = new Set(places(allowedMoves(s)).map((m) => (m.type === 'place' ? m.slot : -1)));
    expect([...slots].sort()).toEqual([0, 1]);
  });

  it('game over when no productive move even with dud placements available', () => {
    const s = makeState(boardWith(), { tray: ['red'] });
    expect(allowedMoves(s).length).toBeGreaterThan(0);
    expect(productiveMoves(s)).toEqual([]);
    expect(isGameOver(s)).toBe(true);
  });

  it('not over when only a matching tray placement exists', () => {
    const s = makeState(boardWith({ '0,1': 'R' }), { tray: ['red'] });
    expect(swaps(productiveMoves(s))).toEqual([]);
    expect(isGameOver(s)).toBe(false);
    expect(isGameOver({ ...s, tray: [] })).toBe(true);
  });
});
