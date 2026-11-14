import { BOARD_SIZE, COLORS } from './types';
import type { Blast, BlastKind, Board, Color, MatchGroup, MatchKey, MatchShape, Pos } from './types';
import { matchKeyOf } from './matches';

/** A prism seed's `color` is what it clears (`'rock'` for every rock); unset, the most common color. */
export interface BlastSeed { at: Pos; kind: BlastKind; color?: MatchKey }

const keyOf = (p: Pos) => `${p.row},${p.col}`;

export function specialFor(shape: MatchShape): 'charge' | 'arc' | 'prism' | null {
  switch (shape) {
    case 'line4': return 'charge';
    case 'cross': return 'arc';
    case 'line5': return 'prism';
    default: return null;
  }
}

// The straight run of group cells through `p` along (dr, dc), row-major.
function runThrough(set: Set<string>, p: Pos, dr: number, dc: number): Pos[] {
  const run: Pos[] = [p];
  for (let s = -1; s <= 1; s += 2) {
    for (let k = 1; ; k++) {
      const q = { row: p.row + s * dr * k, col: p.col + s * dc * k };
      if (!set.has(keyOf(q))) break;
      run.push(q);
    }
  }
  return run.sort((a, b) => a.row - b.row || a.col - b.col);
}

function sortedCells(group: MatchGroup): Pos[] {
  return [...group.cells].sort((a, b) => a.row - b.row || a.col - b.col);
}

function crossCenter(group: MatchGroup): Pos | null {
  const set = new Set(group.cells.map(keyOf));
  for (const p of sortedCells(group)) {
    if (runThrough(set, p, 0, 1).length >= 3 && runThrough(set, p, 1, 0).length >= 3) return p;
  }
  return null;
}

// Middle of the group's longest straight run. Ties: left for a row, lower on screen
// (higher row index) for a column.
function lineCenter(group: MatchGroup): Pos {
  const set = new Set(group.cells.map(keyOf));
  let best: Pos[] = [];
  for (const p of sortedCells(group)) {
    for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
      const run = runThrough(set, p, dr, dc);
      if (run.length > best.length) best = run;
    }
  }
  const vertical = best.length > 1 && best[0].col === best[1].col;
  return best[vertical ? Math.floor(best.length / 2) : Math.floor((best.length - 1) / 2)];
}

export function specialCell(group: MatchGroup, moved: Pos[]): Pos {
  const inGroup = new Set(group.cells.map(keyOf));
  const hit = moved.find((m) => inGroup.has(keyOf(m)));
  if (hit) return { row: hit.row, col: hit.col };
  const center = (group.shape === 'cross' ? crossCenter(group) : null) ?? lineCenter(group);
  return { row: center.row, col: center.col };
}

export function mostCommonColor(board: Board): Color | null {
  const counts = new Map<Color, number>();
  for (const row of board) {
    for (const p of row) if (p?.kind === 'gem') counts.set(p.color, (counts.get(p.color) ?? 0) + 1);
  }
  let best: Color | null = null;
  let bestCount = 0;
  for (const c of COLORS) {
    const n = counts.get(c) ?? 0;
    if (n > bestCount) { best = c; bestCount = n; }
  }
  return best;
}

// Every non-null cell a blast reaches, row-major.
function blastArea(board: Board, kind: BlastKind, at: Pos, color: MatchKey | undefined): Pos[] {
  const area: Pos[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const p = board[row][col];
      if (!p) continue;
      const self = row === at.row && col === at.col;
      const reached =
        kind === 'supernova' ? true
        : kind === 'charge' ? Math.abs(row - at.row) <= 1 && Math.abs(col - at.col) <= 1
        : kind === 'arc' ? row === at.row || col === at.col
        : self || (color !== undefined && matchKeyOf(p) === color);
      if (reached) area.push({ row, col });
    }
  }
  return area;
}

/**
 * Breadth-first blast chaining. Pure: reads `board`, never mutates it.
 * Specials sitting in `alreadyCleared` cells are the caller's to seed; they are
 * neither re-cleared nor re-triggered here.
 */
export function resolveBlasts(
  board: Board,
  seeds: BlastSeed[],
  alreadyCleared: Set<string>,
): { blasts: Blast[]; cells: Pos[] } {
  const claimed = new Set(alreadyCleared);
  const triggered = new Set(seeds.map((s) => keyOf(s.at)));
  const queue: { kind: BlastKind; at: Pos; color?: MatchKey; order: number }[] = seeds.map((s) => ({
    kind: s.kind, at: s.at, order: 0,
    color: s.kind === 'prism' ? (s.color ?? mostCommonColor(board) ?? undefined) : undefined,
  }));
  const blasts: Blast[] = [];
  const cells: Pos[] = [];

  for (let i = 0; i < queue.length; i++) {
    const { kind, at, color, order } = queue[i];
    const mine: Pos[] = [];
    for (const pos of blastArea(board, kind, at, color)) {
      const k = keyOf(pos);
      if (claimed.has(k)) continue;
      claimed.add(k);
      mine.push(pos);
      if (triggered.has(k)) continue;
      const p = board[pos.row][pos.col];
      if (p?.kind === 'prism') {
        triggered.add(k);
        queue.push({ kind: 'prism', at: pos, order: order + 1, color: mostCommonColor(board) ?? undefined });
      } else if (p?.kind === 'gem' && p.special !== 'none') {
        triggered.add(k);
        queue.push({ kind: p.special, at: pos, order: order + 1 });
      }
    }
    const blast: Blast = { kind, at, cells: mine, order };
    if (color !== undefined) blast.color = color;
    blasts.push(blast);
    cells.push(...mine);
  }
  return { blasts, cells };
}
