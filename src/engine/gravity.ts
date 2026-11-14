import { BOARD_SIZE, COLORS } from './types';
import type { Board, Fall, Piece, Pos, Spawn } from './types';
import { cloneBoard, randomPiece } from './board';
import { placementCreatesMatch } from './matches';
import { stinginess } from './rules';
import type { Rng } from './rng';

// A refill gem that would complete a run with the pieces already settled on `board` is, with
// probability `stinginess(level)`, re-rolled once to a color that wouldn't. Rocks are never re-rolled.
// Below the stingy levels this draws exactly what `randomPiece` alone would.
function refill(board: Board, rng: Rng, level: number, id: number, at: Pos): Piece {
  const piece = randomPiece(rng, level, id);
  const odds = stinginess(level);
  if (piece.kind !== 'gem' || odds === 0 || !placementCreatesMatch(board, piece.color, at)) return piece;
  if (rng.next() >= odds) return piece;
  const safe = COLORS.filter((c) => !placementCreatesMatch(board, c, at));
  return safe.length === 0 ? piece : { ...piece, color: rng.pick(safe) };
}

export function applyGravity(
  board: Board,
  rng: Rng,
  level: number,
  nextId: number,
): { board: Board; falls: Fall[]; spawns: Spawn[]; nextId: number } {
  const out = cloneBoard(board);
  const falls: Fall[] = [];
  const spawns: Spawn[] = [];
  // Every column falls first, so the stinginess check sees all settled pieces; the empty cells
  // left on top are null until their refill lands.
  const empty: number[] = [];
  for (let col = 0; col < BOARD_SIZE; col++) {
    let target = BOARD_SIZE - 1;
    for (let row = BOARD_SIZE - 1; row >= 0; row--) {
      const p = board[row][col];
      if (!p) continue;
      out[target][col] = p;
      if (target !== row) falls.push({ id: p.id, from: { row, col }, to: { row: target, col } });
      target--;
    }
    for (let row = 0; row <= target; row++) out[row][col] = null;
    empty.push(target + 1);
  }
  // Refills: column by column left to right, top row first.
  let id = nextId;
  for (let col = 0; col < BOARD_SIZE; col++) {
    const k = empty[col];
    for (let row = 0; row < k; row++) {
      const piece = refill(out, rng, level, id++, { row, col });
      out[row][col] = piece;
      spawns.push({ piece, to: { row, col }, fromRow: row - k });
    }
  }
  return { board: out, falls, spawns, nextId: id };
}
