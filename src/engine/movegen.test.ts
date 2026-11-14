import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, COLORS } from './types';
import type { Board, Color, GameState, Move, Piece, Pos } from './types';
import { cloneBoard, createBoard } from './board';
import { findMatches, swapCreatesMatch } from './matches';
import { countProductiveMoves, isGameOver, productiveMoves } from './moves';
import { applyMove } from './resolve';
import { Rng } from './rng';
import { makeState } from './testing';
import { canPlace } from './tray';

// Reference oracle: the original full-scan move generation (board copy + findMatches per check).
const touches = (cells: Pos[], p: Pos) => cells.some((c) => c.row === p.row && c.col === p.col);

function refSwapCreatesMatch(board: Board, a: Pos, b: Pos): boolean {
  const copy = cloneBoard(board);
  const t = copy[a.row][a.col];
  copy[a.row][a.col] = copy[b.row][b.col];
  copy[b.row][b.col] = t;
  return findMatches(copy).some((g) => touches(g.cells, a) || touches(g.cells, b));
}

function refIsLegalSwap(board: Board, a: Pos, b: Pos): boolean {
  const p = board[a.row][a.col];
  const q = board[b.row][b.col];
  if (!p || !q) return false;
  if (p.kind === 'prism' || q.kind === 'prism') return p.kind !== 'rock' && q.kind !== 'rock';
  return refSwapCreatesMatch(board, a, b);
}

function refPlacementMatches(board: Board, color: Color, at: Pos): boolean {
  const copy = cloneBoard(board);
  copy[at.row][at.col] = { id: -1, kind: 'gem', color, special: 'none' };
  return findMatches(copy).some((g) => touches(g.cells, at));
}

function refProductiveMoves(state: GameState): Move[] {
  const out: Move[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const a = { row, col };
      for (const b of [{ row, col: col + 1 }, { row: row + 1, col }]) {
        if (b.row < BOARD_SIZE && b.col < BOARD_SIZE && refIsLegalSwap(state.board, a, b)) out.push({ type: 'swap', a, b });
      }
    }
  }
  const seen = new Set<Color>();
  state.tray.forEach((color, slot) => {
    if (seen.has(color)) return;
    seen.add(color);
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const at = { row, col };
        if (canPlace(state.board, state.tray, slot, at) && refPlacementMatches(state.board, color, at)) {
          out.push({ type: 'place', slot, at });
        }
      }
    }
  });
  return out;
}

// Small palettes make dense boards (existing runs, many matching swaps); the rest sprinkle
// empties, rocks, prisms and specials.
function randomBoard(rng: Rng): Board {
  const palette = COLORS.slice(0, 2 + rng.int(6));
  let id = 1;
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, (): Piece | null => {
      const roll = rng.next();
      if (roll < 0.03) return null;
      if (roll < 0.08) return { id: id++, kind: 'rock' };
      if (roll < 0.11) return { id: id++, kind: 'prism' };
      const special = rng.next() < 0.12 ? rng.pick(['charge', 'arc'] as const) : 'none';
      return { id: id++, kind: 'gem', color: rng.pick(palette), special };
    }),
  );
}

function sprinkle(board: Board, rng: Rng): Board {
  const out = cloneBoard(board);
  for (let n = rng.int(5); n > 0; n--) {
    const row = rng.int(BOARD_SIZE);
    const col = rng.int(BOARD_SIZE);
    const p = out[row][col]!;
    const roll = rng.next();
    if (roll < 0.3) out[row][col] = { id: p.id, kind: 'prism' };
    else if (roll < 0.5) out[row][col] = { id: p.id, kind: 'rock' };
    else if (p.kind === 'gem') out[row][col] = { ...p, special: rng.pick(['charge', 'arc'] as const) };
  }
  return out;
}

function randomTray(rng: Rng): Color[] {
  if (rng.next() < 0.6) return [];
  return Array.from({ length: 1 + rng.int(4) }, () => rng.pick(COLORS));
}

function* fixtures(): Generator<GameState> {
  for (let seed = 1; seed <= 300; seed++) {
    const rng = new Rng(seed);
    yield makeState(randomBoard(rng), { tray: randomTray(rng) });
  }
  for (const level of [1, 10, 14, 20]) {
    for (let seed = 1; seed <= 50; seed++) {
      const rng = new Rng(seed * 31 + level);
      const { board } = createBoard(rng, level, 1);
      yield makeState(sprinkle(board, rng), { level, tray: randomTray(rng) });
    }
  }
  // Boards from real play: cascades, refills and created specials.
  for (let seed = 1; seed <= 10; seed++) {
    const rng = new Rng(seed + 1000);
    let s = makeState(createBoard(rng, 12, 1).board, { level: 12, tray: ['red', 'blue', 'cyan'] });
    for (let ply = 0; ply < 8 && !s.over; ply++) {
      yield s;
      const moves = refProductiveMoves(s);
      s = applyMove({ ...s, rngState: rng.int(2 ** 32) }, moves[rng.int(moves.length)]).state;
    }
  }
}

describe('move generation fast path', () => {
  it('matches the full-scan reference on 500+ random boards', () => {
    let boards = 0;
    let swapsChecked = 0;
    let productiveSeen = 0;
    for (const s of fixtures()) {
      boards++;
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          const a = { row, col };
          for (const b of [{ row, col: col + 1 }, { row: row + 1, col }]) {
            if (b.row >= BOARD_SIZE || b.col >= BOARD_SIZE) continue;
            swapsChecked++;
            expect(swapCreatesMatch(s.board, a, b)).toBe(refSwapCreatesMatch(s.board, a, b));
          }
        }
      }
      const ref = refProductiveMoves(s);
      productiveSeen += ref.length;
      expect(productiveMoves(s)).toEqual(ref);
      for (const cap of [0, 1, 3, 20, 1000]) expect(countProductiveMoves(s, cap)).toBe(Math.min(ref.length, cap));
      expect(isGameOver(s)).toBe(ref.length === 0);
    }
    expect(boards).toBeGreaterThanOrEqual(500);
    expect(swapsChecked).toBe(boards * 112);
    expect(productiveSeen).toBeGreaterThan(boards); // the fixtures are not all dead boards
  }, 30_000); // ~580 boards; can take ~7 s on a CI runner with coverage on
});
