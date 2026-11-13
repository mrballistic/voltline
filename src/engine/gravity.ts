import { BOARD_SIZE } from './types';
import type { Board, Fall, Piece, Spawn } from './types';
import { cloneBoard, randomPiece } from './board';
import type { Rng } from './rng';

export function applyGravity(
  board: Board,
  rng: Rng,
  level: number,
  nextId: number,
): { board: Board; falls: Fall[]; spawns: Spawn[]; nextId: number } {
  const out = cloneBoard(board);
  const falls: Fall[] = [];
  const spawns: Spawn[] = [];
  let id = nextId;
  for (let col = 0; col < BOARD_SIZE; col++) {
    let target = BOARD_SIZE - 1;
    for (let row = BOARD_SIZE - 1; row >= 0; row--) {
      const p = board[row][col];
      if (!p) continue;
      out[target][col] = p;
      if (target !== row) falls.push({ id: p.id, from: { row, col }, to: { row: target, col } });
      target--;
    }
    const k = target + 1;
    for (let row = 0; row < k; row++) {
      const piece: Piece = randomPiece(rng, level, id++);
      out[row][col] = piece;
      spawns.push({ piece, to: { row, col }, fromRow: row - k });
    }
  }
  return { board: out, falls, spawns, nextId: id };
}
