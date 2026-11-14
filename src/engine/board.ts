import { BOARD_SIZE, COLORS } from './types';
import type { Board, Piece } from './types';
import { rockChance } from './rules';
import { matchKeyOf, swapCreatesMatch } from './matches';
import type { Rng } from './rng';

export function cloneBoard(b: Board): Board {
  return b.map((row) => row.slice());
}

export function randomPiece(rng: Rng, level: number, id: number): Piece {
  if (rng.next() < rockChance(level)) return { id, kind: 'rock' };
  return { id, kind: 'gem', color: rng.pick(COLORS), special: 'none' };
}

function hasProductiveSwap(board: Board): boolean {
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const here = { row, col };
      if (col + 1 < BOARD_SIZE && swapCreatesMatch(board, here, { row, col: col + 1 })) return true;
      if (row + 1 < BOARD_SIZE && swapCreatesMatch(board, here, { row: row + 1, col })) return true;
    }
  }
  return false;
}

function fillBoard(rng: Rng, level: number, firstId: number): { board: Board; nextId: number } {
  const board: Board = Array.from({ length: BOARD_SIZE }, () => Array<Piece | null>(BOARD_SIZE).fill(null));
  let id = firstId;
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      let piece = randomPiece(rng, level, id);
      for (;;) {
        const key = matchKeyOf(piece);
        const left =
          col >= 2 && key !== null &&
          matchKeyOf(board[row][col - 1]) === key && matchKeyOf(board[row][col - 2]) === key;
        const up =
          row >= 2 && key !== null &&
          matchKeyOf(board[row - 1][col]) === key && matchKeyOf(board[row - 2][col]) === key;
        if (!left && !up) break;
        piece = randomPiece(rng, level, id);
      }
      board[row][col] = piece;
      id++;
    }
  }
  return { board, nextId: id };
}

export function createBoard(rng: Rng, level: number, firstId: number): { board: Board; nextId: number } {
  for (let attempt = 0; ; attempt++) {
    // After 100 attempts, drop rocks (level 1 rate is 0) so a productive board is easy to hit.
    const result = fillBoard(rng, attempt < 100 ? level : 1, firstId);
    if (hasProductiveSwap(result.board)) return result;
  }
}
