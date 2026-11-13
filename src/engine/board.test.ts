import { describe, expect, it } from 'vitest';
import { createBoard } from './board';
import { findMatches, swapCreatesMatch } from './matches';
import { Rng } from './rng';
import { BOARD_SIZE } from './types';
import type { Board } from './types';

function hasProductive(board: Board): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (c + 1 < BOARD_SIZE && swapCreatesMatch(board, { row: r, col: c }, { row: r, col: c + 1 })) return true;
      if (r + 1 < BOARD_SIZE && swapCreatesMatch(board, { row: r, col: c }, { row: r + 1, col: c })) return true;
    }
  }
  return false;
}

function countRocks(board: Board): number {
  return board.flat().filter((p) => p?.kind === 'rock').length;
}

describe('createBoard', () => {
  it('has no matches and a productive swap', () => {
    for (const level of [1, 15]) {
      for (let seed = 1; seed <= 200; seed++) {
        const { board } = createBoard(new Rng(seed), level, 1);
        expect(findMatches(board)).toEqual([]);
        expect(hasProductive(board)).toBe(true);
        expect(board.flat().every((p) => p !== null)).toBe(true);
      }
    }
  });

  it('is deterministic per seed', () => {
    const a = createBoard(new Rng(42), 12, 1);
    const b = createBoard(new Rng(42), 12, 1);
    expect(a).toEqual(b);
  });

  it('has no rocks below level 10', () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(countRocks(createBoard(new Rng(seed), 9, 1).board)).toBe(0);
    }
  });

  it('has rocks at level 15', () => {
    let rocks = 0;
    for (let seed = 1; seed <= 200; seed++) rocks += countRocks(createBoard(new Rng(seed), 15, 1).board);
    const fraction = rocks / (200 * BOARD_SIZE * BOARD_SIZE);
    expect(fraction).toBeGreaterThan(0.04);
    expect(fraction).toBeLessThan(0.12);
  });

  it('assigns sequential ids from firstId', () => {
    const { board, nextId } = createBoard(new Rng(3), 1, 100);
    expect(nextId).toBe(100 + 64);
    const ids = board.flat().map((p) => p!.id).sort((x, y) => x - y);
    expect(ids[0]).toBe(100);
    expect(new Set(ids).size).toBe(64);
  });
});
