import { describe, expect, it } from 'vitest';
import { applyGravity } from './gravity';
import { Rng } from './rng';
import { BOARD_SIZE } from './types';
import type { Board } from './types';
import { parseBoard } from './testing';

function gapBoard(): Board {
  const b = parseBoard(
    ['R B Y G M O C R', 'B Y G M O C R B', 'Y G M O C R B Y', 'G M O C R B Y G',
     'M O C R B Y G M', 'O C R B Y G M O', 'C R B Y G M O C', 'R B Y G M O C R'].join('\n'),
  );
  b[2][0] = null;
  b[5][0] = null;
  return b;
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
});
