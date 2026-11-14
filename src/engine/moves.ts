import { BOARD_SIZE } from './types';
import type { Board, Color, GameState, Move, Piece, Pos } from './types';
import { placementCreatesMatch, swapCreatesMatch } from './matches';
import { canPlace } from './tray';

export function isAdjacent(a: Pos, b: Pos): boolean {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

export function pieceAt(board: Board, p: Pos): Piece | null {
  return board[p.row]?.[p.col] ?? null;
}

/**
 * The swap rule shared by move listing and `applyMove`; adjacency is the caller's check.
 * A prism swaps legally with any gem or prism and never with a rock (spec §5.3), even when
 * the rock would complete a rock line.
 */
export function isLegalSwap(board: Board, a: Pos, b: Pos): boolean {
  const p = pieceAt(board, a);
  const q = pieceAt(board, b);
  if (!p || !q) return false;
  if (p.kind === 'prism' || q.kind === 'prism') return p.kind !== 'rock' && q.kind !== 'rock';
  return swapCreatesMatch(board, a, b);
}

// Each adjacent pair once, `a` before `b` in row-major order.
function* legalSwaps(board: Board): Generator<Move> {
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const a = { row, col };
      for (const b of [{ row, col: col + 1 }, { row: row + 1, col }]) {
        if (b.row < BOARD_SIZE && b.col < BOARD_SIZE && isLegalSwap(board, a, b)) {
          yield { type: 'swap', a, b };
        }
      }
    }
  }
}

// Slot order, then row-major; a color held in several slots is listed for its lowest slot only.
function* placements(state: GameState, matchingOnly: boolean): Generator<Move> {
  const seen = new Set<Color>();
  for (let slot = 0; slot < state.tray.length; slot++) {
    const color = state.tray[slot];
    if (seen.has(color)) continue;
    seen.add(color);
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const at = { row, col };
        if (!canPlace(state.board, state.tray, slot, at)) continue;
        if (matchingOnly && !placementCreatesMatch(state.board, color, at)) continue;
        yield { type: 'place', slot, at };
      }
    }
  }
}

function* productive(state: GameState): Generator<Move> {
  yield* legalSwaps(state.board);
  yield* placements(state, true);
}

export function productiveMoves(state: GameState): Move[] {
  return [...productive(state)];
}

export function allowedMoves(state: GameState): Move[] {
  return [...legalSwaps(state.board), ...placements(state, false)];
}

/** `productiveMoves(state).length`, but stops listing once it reaches `cap`. */
export function countProductiveMoves(state: GameState, cap: number): number {
  const moves = productive(state);
  let n = 0;
  while (n < cap && !moves.next().done) n++;
  return n;
}

export function isGameOver(state: GameState): boolean {
  return countProductiveMoves(state, 1) === 0;
}
