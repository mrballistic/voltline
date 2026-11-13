import type { Board, MatchGroup, MatchKey, MatchShape, Piece, Pos } from './types';
import { BOARD_SIZE } from './types';

export function matchKeyOf(p: Piece | null): MatchKey | null {
  if (!p) return null;
  if (p.kind === 'gem') return p.color;
  if (p.kind === 'rock') return 'rock';
  return null;
}

interface Run { key: MatchKey; cells: Pos[] }

function collectRuns(board: Board): Run[] {
  const runs: Run[] = [];
  for (const horizontal of [true, false]) {
    for (let line = 0; line < BOARD_SIZE; line++) {
      let i = 0;
      while (i < BOARD_SIZE) {
        const at = (k: number): Pos => (horizontal ? { row: line, col: k } : { row: k, col: line });
        const first = at(i);
        const key = matchKeyOf(board[first.row][first.col]);
        let j = i + 1;
        if (key) {
          while (j < BOARD_SIZE) {
            const q = at(j);
            if (matchKeyOf(board[q.row][q.col]) !== key) break;
            j++;
          }
          if (j - i >= 3) {
            const cells: Pos[] = [];
            for (let k = i; k < j; k++) cells.push(at(k));
            runs.push({ key, cells });
          }
        }
        i = j;
      }
    }
  }
  return runs;
}

export function findMatches(board: Board): MatchGroup[] {
  const runs = collectRuns(board);
  const parent = runs.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const owner = new Map<string, number>();
  runs.forEach((run, i) => {
    for (const c of run.cells) {
      const k = `${c.row},${c.col}`;
      const o = owner.get(k);
      if (o === undefined) owner.set(k, i);
      else parent[find(i)] = find(o);
    }
  });
  const byRoot = new Map<number, number[]>();
  runs.forEach((_, i) => {
    const r = find(i);
    byRoot.set(r, [...(byRoot.get(r) ?? []), i]);
  });
  const groups: MatchGroup[] = [];
  for (const idxs of byRoot.values()) {
    const seen = new Set<string>();
    const cells: Pos[] = [];
    let longest = 0;
    for (const i of idxs) {
      longest = Math.max(longest, runs[i].cells.length);
      for (const c of runs[i].cells) {
        const k = `${c.row},${c.col}`;
        if (!seen.has(k)) { seen.add(k); cells.push(c); }
      }
    }
    cells.sort((p, q) => p.row - q.row || p.col - q.col);
    const shape: MatchShape =
      longest >= 5 ? 'line5' : idxs.length >= 2 ? 'cross' : longest === 4 ? 'line4' : 'line3';
    groups.push({ key: runs[idxs[0]].key, cells, shape });
  }
  groups.sort((g, h) => g.cells[0].row - h.cells[0].row || g.cells[0].col - h.cells[0].col);
  return groups;
}

export function swapCreatesMatch(board: Board, a: Pos, b: Pos): boolean {
  const copy = board.map((r) => r.slice());
  const t = copy[a.row][a.col];
  copy[a.row][a.col] = copy[b.row][b.col];
  copy[b.row][b.col] = t;
  const touches = (c: Pos) =>
    (c.row === a.row && c.col === a.col) || (c.row === b.row && c.col === b.col);
  return findMatches(copy).some((g) => g.cells.some(touches));
}
