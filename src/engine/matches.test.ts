import { describe, expect, it } from 'vitest';
import { findMatches, matchKeyOf, swapCreatesMatch } from './matches';
import { boardToString, parseBoard } from './testing';

const pad = (rows: string[]) => {
  const out = rows.map((r) => r.trim());
  while (out.length < 8) out.push('. . . . . . . .');
  return out.join('\n');
};

describe('matches', () => {
  it('finds horizontal and vertical line3', () => {
    const b = parseBoard(pad(['R R R . . . . .', 'B . . . . . . .', 'B . . . . . . .', 'B . . . . . . .']));
    const g = findMatches(b);
    expect(g).toHaveLength(2);
    expect(g.map((x) => [x.key, x.shape, x.cells.length]).sort()).toEqual([
      ['blue', 'line3', 3],
      ['red', 'line3', 3],
    ]);
  });

  it('line4 and line5 classified', () => {
    const b = parseBoard(pad(['R R R R . . . .', 'B B B B B . . .', 'G G G G G G . .']));
    const shapes = findMatches(b).map((x) => x.shape).sort();
    expect(shapes).toEqual(['line4', 'line5', 'line5']);
  });

  it('L and T are one cross group', () => {
    const l = parseBoard(pad(['R R R . . . . .', 'R . . . . . . .', 'R . . . . . . .']));
    const g = findMatches(l);
    expect(g).toHaveLength(1);
    expect(g[0].cells).toHaveLength(5);
    expect(g[0].shape).toBe('cross');
    const t = parseBoard(pad(['. R . . . . . .', 'R R R . . . . .', '. R . . . . . .']));
    const gt = findMatches(t);
    expect(gt).toHaveLength(1);
    expect(gt[0].shape).toBe('cross');
    expect(gt[0].cells).toHaveLength(5);
  });

  it('cross containing a 5-run is line5', () => {
    const b = parseBoard(pad(['R R R R R . . .', 'R . . . . . . .', 'R . . . . . . .']));
    const g = findMatches(b);
    expect(g).toHaveLength(1);
    expect(g[0].shape).toBe('line5');
    expect(g[0].cells).toHaveLength(7);
  });

  it('different colors never merge', () => {
    const b = parseBoard(pad(['R R R . . . . .', 'B . . . . . . .', 'B . . . . . . .', 'B . . . . . . .']));
    expect(findMatches(b)).toHaveLength(2);
    const adj = parseBoard(pad(['R R R . . . . .', 'B B B . . . . .']));
    expect(findMatches(adj)).toHaveLength(2);
  });

  it('separate parallel runs are separate groups, cells sorted row-major', () => {
    const b = parseBoard(pad(['R R R . . . . .', '. . . . . . . .', 'R R R . . . . .']));
    expect(findMatches(b)).toHaveLength(2);
    const t = parseBoard(pad(['. R . . . . . .', 'R R R . . . . .', '. R . . . . . .']));
    const cells = findMatches(t)[0].cells;
    expect(cells).toEqual([...cells].sort((p, q) => p.row - q.row || p.col - q.col));
  });

  it('rocks match as rock key', () => {
    const b = parseBoard(pad(['X X X . . . . .']));
    const g = findMatches(b);
    expect(g).toHaveLength(1);
    expect(g[0].key).toBe('rock');
    expect(matchKeyOf(b[0][0])).toBe('rock');
  });

  it('prism and empty cells break runs', () => {
    const b = parseBoard(pad(['R R P R R . . .', 'B B . B B . . .']));
    expect(findMatches(b)).toHaveLength(0);
    expect(matchKeyOf(b[0][2])).toBeNull();
    expect(matchKeyOf(null)).toBeNull();
  });

  it('charge and arc gems match by color', () => {
    const b = parseBoard(pad(['Rc R Ra . . . . .']));
    const g = findMatches(b);
    expect(g).toHaveLength(1);
    expect(g[0].key).toBe('red');
  });

  it('swapCreatesMatch true and false cases, input unchanged', () => {
    const b = parseBoard(pad(['R R B R . . . .', '. . R . . . . .']));
    const before = JSON.parse(JSON.stringify(b));
    const snap = boardToString(b);
    expect(swapCreatesMatch(b, { row: 0, col: 2 }, { row: 1, col: 2 })).toBe(true);
    expect(swapCreatesMatch(b, { row: 0, col: 0 }, { row: 1, col: 0 })).toBe(false);
    expect(b).toEqual(before);
    expect(boardToString(b)).toBe(snap);
  });

  it('swapCreatesMatch ignores matches not touching the swap', () => {
    const b = parseBoard(pad(['R R R . . . . .', '. . . . B G . .']));
    expect(swapCreatesMatch(b, { row: 1, col: 4 }, { row: 1, col: 5 })).toBe(false);
  });
});
