import { describe, expect, it } from 'vitest';
import { mostCommonColor, resolveBlasts, specialCell, specialFor } from './specials';
import { parseBoard } from './testing';
import type { MatchGroup, Pos } from './types';

const pad = (rows: string[]) => {
  const out = rows.map((r) => r.trim());
  while (out.length < 8) out.push('. . . . . . . .');
  return out.join('\n');
};

// A full board with no specials, prisms or rocks: every cell is a plain gem.
const FULL = [
  'R B Y G M O C R',
  'B Y G M O C R B',
  'Y G M O C R B Y',
  'G M O C R B Y G',
  'M O C R B Y G M',
  'O C R B Y G M O',
  'C R B Y G M O C',
  'R B Y G M O C R',
];

const withToken = (rows: string[], row: number, col: number, tok: string): string => {
  const copy = rows.map((r) => r.split(' '));
  copy[row][col] = tok;
  return copy.map((r) => r.join(' ')).join('\n');
};

const key = (p: Pos) => `${p.row},${p.col}`;

describe('specials', () => {
  it('specialFor maps shapes', () => {
    expect(specialFor('line3')).toBeNull();
    expect(specialFor('line4')).toBe('charge');
    expect(specialFor('cross')).toBe('arc');
    expect(specialFor('line5')).toBe('prism');
  });

  it('specialCell prefers moved cell', () => {
    const group: MatchGroup = {
      key: 'red', shape: 'line4',
      cells: [2, 3, 4, 5].map((col) => ({ row: 0, col })),
    };
    expect(specialCell(group, [{ row: 1, col: 5 }, { row: 0, col: 5 }])).toEqual({ row: 0, col: 5 });
  });

  it('specialCell center for line4 is lower-left of middle', () => {
    const group: MatchGroup = {
      key: 'red', shape: 'line4',
      cells: [2, 3, 4, 5].map((col) => ({ row: 0, col })),
    };
    expect(specialCell(group, [{ row: 1, col: 1 }])).toEqual({ row: 0, col: 3 });
    expect(specialCell({ ...group, shape: 'line3', cells: group.cells.slice(0, 3) }, [])).toEqual({
      row: 0, col: 3,
    });
    const vertical: MatchGroup = { key: 'red', shape: 'line4', cells: [2, 3, 4, 5].map((row) => ({ row, col: 1 })) };
    expect(specialCell(vertical, [])).toEqual({ row: 4, col: 1 });
    const vertical3: MatchGroup = { key: 'red', shape: 'line3', cells: [2, 3, 4].map((row) => ({ row, col: 1 })) };
    expect(specialCell(vertical3, [])).toEqual({ row: 3, col: 1 });
  });

  it('specialCell for cross is intersection', () => {
    // T shape: row 0 cols 1-3, plus column 2 rows 0-2.
    const t: MatchGroup = {
      key: 'red', shape: 'cross',
      cells: [
        { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 },
        { row: 1, col: 2 }, { row: 2, col: 2 },
      ],
    };
    expect(specialCell(t, [])).toEqual({ row: 0, col: 2 });
    // L shape with the corner at the bottom-right.
    const l: MatchGroup = {
      key: 'blue', shape: 'cross',
      cells: [
        { row: 3, col: 6 }, { row: 4, col: 6 },
        { row: 5, col: 4 }, { row: 5, col: 5 }, { row: 5, col: 6 },
      ],
    };
    expect(specialCell(l, [])).toEqual({ row: 5, col: 6 });
  });

  it('mostCommonColor counts gems, breaks ties by color order, null when none', () => {
    expect(mostCommonColor(parseBoard(pad(['B B R R Ga . . X'])))).toBe('red');
    expect(mostCommonColor(parseBoard(pad(['B Bc B R R . . .'])))).toBe('blue');
    expect(mostCommonColor(parseBoard(pad(['X X P . . . . .'])))).toBeNull();
  });

  it('charge clears 3x3 clipped at corner', () => {
    const b = parseBoard(withToken(FULL, 0, 0, 'Rc'));
    const { blasts, cells } = resolveBlasts(b, [{ at: { row: 0, col: 0 }, kind: 'charge' }], new Set());
    expect(blasts).toHaveLength(1);
    expect(blasts[0]).toMatchObject({ kind: 'charge', at: { row: 0, col: 0 }, order: 0 });
    expect(cells.map(key).sort()).toEqual(['0,0', '0,1', '1,0', '1,1']);
  });

  it('arc clears row and column', () => {
    const b = parseBoard(withToken(FULL, 3, 4, 'Ra'));
    const { blasts, cells } = resolveBlasts(b, [{ at: { row: 3, col: 4 }, kind: 'arc' }], new Set());
    expect(blasts).toHaveLength(1);
    expect(cells).toHaveLength(15);
    for (const c of cells) expect(c.row === 3 || c.col === 4).toBe(true);
  });

  it('excludes already-cleared cells from the result', () => {
    const b = parseBoard(withToken(FULL, 3, 4, 'Ra'));
    const already = new Set(['3,3', '3,4', '3,5']);
    const { cells } = resolveBlasts(b, [{ at: { row: 3, col: 4 }, kind: 'arc' }], already);
    expect(cells).toHaveLength(12);
    for (const c of cells) expect(already.has(key(c))).toBe(false);
  });

  it('charge catching an arc chains with order 1', () => {
    let src = withToken(FULL, 4, 4, 'Rc');
    src = withToken(src.split('\n'), 5, 5, 'Ba');
    const b = parseBoard(src);
    const { blasts, cells } = resolveBlasts(b, [{ at: { row: 4, col: 4 }, kind: 'charge' }], new Set());
    expect(blasts.map((x) => [x.kind, x.order, key(x.at)])).toEqual([
      ['charge', 0, '4,4'],
      ['arc', 1, '5,5'],
    ]);
    // 3x3 (9) plus row 5 and column 5 outside the 3x3 (5 + 5).
    expect(cells).toHaveLength(19);
  });

  it('prism caught in blast clears most common color', () => {
    const b = parseBoard(pad([
      'Rc P . . . . . .',
      '. . . . . . . .',
      'B B B . . . . .',
      'B B . . . R R R',
      '. . . . X X . .',
    ]));
    const { blasts, cells } = resolveBlasts(b, [{ at: { row: 0, col: 0 }, kind: 'charge' }], new Set());
    expect(blasts.map((x) => [x.kind, x.order, x.color])).toEqual([
      ['charge', 0, undefined],
      ['prism', 1, 'blue'],
    ]);
    const keys = cells.map(key).sort();
    expect(keys).toEqual(['0,0', '0,1', '2,0', '2,1', '2,2', '3,0', '3,1'].sort());
  });

  it('prism blast never includes rocks', () => {
    const b = parseBoard(pad([
      'P R X R . . . .',
      'X R . . . . . .',
      'R X Rc . . . . .',
    ]));
    const { blasts, cells } = resolveBlasts(b, [{ at: { row: 0, col: 0 }, kind: 'prism', color: 'red' }], new Set());
    expect(blasts[0]).toMatchObject({ kind: 'prism', color: 'red', order: 0 });
    const prismCells = blasts[0].cells.map(key).sort();
    expect(prismCells).toEqual(['0,0', '0,1', '0,3', '1,1', '2,0', '2,2'].sort());
    // The red charge it caught does reach rocks.
    expect(blasts[1]).toMatchObject({ kind: 'charge', order: 1 });
    expect(blasts[1].cells.map(key)).toEqual(['2,1']);
    expect(cells).toHaveLength(7);
  });

  it('a prism seeded on rocks clears itself and every rock, and nothing chains from them', () => {
    const b = parseBoard(pad([
      'P X R X . . . .',
      'Rc X . . . . . .',
      'R Ba X P . . . .',
    ]));
    const { blasts, cells } = resolveBlasts(b, [{ at: { row: 0, col: 0 }, kind: 'prism', color: 'rock' }], new Set());
    // Only the rocks and the seed: the charge, the arc and the other prism sit untouched.
    expect(blasts).toEqual([{
      kind: 'prism', at: { row: 0, col: 0 }, order: 0, color: 'rock',
      cells: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 3 }, { row: 1, col: 1 }, { row: 2, col: 2 }],
    }]);
    expect(cells.map(key)).toEqual(['0,0', '0,1', '0,3', '1,1', '2,2']);
  });

  it('a prism caught in a blast still targets the most common color, never rocks', () => {
    const b = parseBoard(pad(['Rc P X X X . . .', 'R . . . . . . .']));
    const { blasts } = resolveBlasts(b, [{ at: { row: 0, col: 0 }, kind: 'charge' }], new Set());
    expect(blasts[1]).toMatchObject({ kind: 'prism', color: 'red', order: 1 });
  });

  it('prism with no gems on the board clears only itself', () => {
    const b = parseBoard(pad(['Rc P X . . . . .']));
    const { blasts } = resolveBlasts(
      parseBoard(pad(['P X . . . . . .'])),
      [{ at: { row: 0, col: 0 }, kind: 'prism' }],
      new Set(),
    );
    expect(blasts[0].cells.map(key)).toEqual(['0,0']);
    // A caught prism on a board whose only gem is already being cleared still targets it.
    const r = resolveBlasts(b, [{ at: { row: 0, col: 0 }, kind: 'charge' }], new Set(['0,0']));
    expect(r.blasts[1]).toMatchObject({ kind: 'prism', color: 'red' });
  });

  it('supernova clears everything', () => {
    const b = parseBoard(pad(['R . X P . . . .', '. Bc . . . . . .']));
    const { blasts, cells } = resolveBlasts(b, [{ at: { row: 0, col: 3 }, kind: 'supernova' }], new Set());
    expect(blasts[0].kind).toBe('supernova');
    expect(cells.map(key).sort()).toEqual(['0,0', '0,2', '0,3', '1,1']);
  });

  it('no cell appears twice across chained blasts', () => {
    let rows = FULL;
    for (const [r, c, t] of [[2, 2, 'Rc'], [3, 3, 'Ba'], [3, 6, 'Gc'], [6, 3, 'Ma']] as const) {
      rows = withToken(rows, r, c, t).split('\n');
    }
    const b = parseBoard(rows.join('\n'));
    const { blasts, cells } = resolveBlasts(b, [{ at: { row: 2, col: 2 }, kind: 'charge' }], new Set());
    expect(blasts.length).toBe(4);
    const all = blasts.flatMap((x) => x.cells.map(key));
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(cells.map(key)).size).toBe(cells.length);
    expect(cells.length).toBe(all.length);
  });
});
