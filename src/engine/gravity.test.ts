import { describe, expect, it } from 'vitest';
import { randomPiece } from './board';
import { applyGravity } from './gravity';
import { placementCreatesMatch } from './matches';
import { Rng } from './rng';
import { BOARD_SIZE } from './types';
import type { Board, Piece } from './types';
import { boardWith, parseBoard } from './testing';

function gapBoard(): Board {
  const b = parseBoard(
    ['R B Y G M O C R', 'B Y G M O C R B', 'Y G M O C R B Y', 'G M O C R B Y G',
     'M O C R B Y G M', 'O C R B Y G M O', 'C R B Y G M O C', 'R B Y G M O C R'].join('\n'),
  );
  b[2][0] = null;
  b[5][0] = null;
  return b;
}

// One empty cell at (0,0) sitting on two reds: a red refill there completes a vertical run.
function redTrapBoard(): Board {
  const b = boardWith({ '1,0': 'R', '2,0': 'R' });
  b[0][0] = null;
  return b;
}

// Several gaps across columns, so a pass spawns many pieces.
function holeyBoard(): Board {
  const b = boardWith();
  for (const [row, col] of [[0, 0], [3, 0], [6, 2], [7, 2], [2, 4], [0, 7], [1, 7], [4, 7]]) b[row][col] = null;
  return b;
}

// What a pass draws with no stinginess: one `randomPiece` per spawn, in spawn order.
function plainSpawns(seed: number, level: number, count: number, firstId: number): Piece[] {
  const rng = new Rng(seed);
  return Array.from({ length: count }, (_, i) => randomPiece(rng, level, firstId + i));
}

describe('applyGravity', () => {
  it('compacts a column and spawns above', () => {
    const board = gapBoard();
    const before = board.map((r) => r.slice());
    const col = before.map((r) => r[0]);
    const res = applyGravity(board, new Rng(1), 1, 100);
    expect(board).toEqual(before);
    expect(res.board.flat().every((p) => p !== null)).toBe(true);
    const survivors = col.filter((p) => p !== null).map((p) => p!.id);
    expect(res.board.map((r) => r[0]!.id).slice(2)).toEqual(survivors);
    expect([...res.falls].sort((a, b) => a.from.row - b.from.row)).toEqual([
      { id: col[0]!.id, from: { row: 0, col: 0 }, to: { row: 2, col: 0 } },
      { id: col[1]!.id, from: { row: 1, col: 0 }, to: { row: 3, col: 0 } },
      { id: col[3]!.id, from: { row: 3, col: 0 }, to: { row: 4, col: 0 } },
      { id: col[4]!.id, from: { row: 4, col: 0 }, to: { row: 5, col: 0 } },
    ]);
    expect(res.spawns.map((s) => [s.to.row, s.fromRow])).toEqual([[0, -2], [1, -1]]);
    expect(res.spawns.every((s) => s.to.col === 0)).toBe(true);
  });

  it('assigns spawn ids sequentially from nextId', () => {
    const board = gapBoard();
    board[0][3] = null;
    const res = applyGravity(board, new Rng(1), 1, 100);
    expect(res.spawns.map((s) => s.piece.id)).toEqual([100, 101, 102]);
    expect(res.spawns.map((s) => s.to.col)).toEqual([0, 0, 3]);
    expect(res.nextId).toBe(103);
  });

  it('full column produces no falls or spawns', () => {
    const board = parseBoard(Array(BOARD_SIZE).fill('R B Y G M O C R').join('\n'));
    const res = applyGravity(board, new Rng(1), 1, 100);
    expect([...res.falls].sort((a, b) => a.from.row - b.from.row)).toEqual([]);
    expect(res.spawns).toEqual([]);
    expect(res.nextId).toBe(100);
  });

  it('stingy refills avoid ready matches at high levels', () => {
    const board = redTrapBoard();
    const at = { row: 0, col: 0 };
    const redShare = (level: number): number => {
      let reds = 0;
      for (let seed = 1; seed <= 500; seed++) {
        const [spawn] = applyGravity(board, new Rng(seed), level, 100).spawns;
        if (spawn.piece.kind === 'gem' && spawn.piece.color === 'red') reds++;
      }
      return reds / 500;
    };
    const low = redShare(1);
    const high = redShare(14);
    expect(low).toBeGreaterThan(0.1);
    expect(high).toBeLessThan(low * 0.6);

    for (let seed = 1; seed <= 500; seed++) {
      const [plain] = plainSpawns(seed, 14, 1, 100);
      const [spawn] = applyGravity(board, new Rng(seed), 14, 100).spawns;
      if (plain.kind === 'rock') {
        // Rocks are never re-rolled.
        expect(spawn.piece).toEqual(plain);
      } else if (spawn.piece.kind === 'gem' && plain.kind === 'gem' && spawn.piece.color !== plain.color) {
        // A re-roll only replaces a run-completing color, and only with a safe one.
        expect(placementCreatesMatch(board, plain.color, at)).toBe(true);
        expect(placementCreatesMatch(board, spawn.piece.color, at)).toBe(false);
        expect(spawn.piece.id).toBe(plain.id);
      }
    }
  });

  it('no stinginess below level 9', () => {
    const board = holeyBoard();
    const count = board.flat().filter((p) => p === null).length;
    let rockless = 0;
    for (let seed = 1; seed <= 200; seed++) {
      for (const level of [1, 8]) {
        const pieces = applyGravity(board, new Rng(seed), level, 100).spawns.map((s) => s.piece);
        expect(pieces).toEqual(plainSpawns(seed, level, count, 100));
      }
      // Rocks aside, levels 1 and 8 spawn the same pieces from the same rng state.
      const at8 = applyGravity(board, new Rng(seed), 8, 100);
      if (at8.spawns.every((s) => s.piece.kind !== 'rock')) {
        rockless++;
        expect(at8).toEqual(applyGravity(board, new Rng(seed), 1, 100));
      }
    }
    expect(rockless).toBeGreaterThan(50);
  });

  it('replay stays deterministic', () => {
    const board = holeyBoard();
    for (let seed = 1; seed <= 50; seed++) {
      const r1 = new Rng(seed);
      const r2 = new Rng(seed);
      expect(applyGravity(board, r1, 14, 100)).toEqual(applyGravity(board, r2, 14, 100));
      expect(r1.state).toBe(r2.state);
    }
  });
});
