import { describe, expect, it } from 'vitest';
import { applyMove, newGame } from './resolve';
import { productiveMoves } from './moves';
import { findMatches } from './matches';
import { levelTarget } from './rules';
import { boardWith, makeState } from './testing';
import type { Board, GameState, Move, Pos, Step } from './types';

const P = (row: number, col: number): Pos => ({ row, col });
const swap = (a: Pos, b: Pos): Move => ({ type: 'swap', a, b });
const key = (p: Pos) => `${p.row},${p.col}`;
const idAt = (b: Board, p: Pos) => b[p.row][p.col]!.id;
const types = (script: Step[]) => script.map((s) => s.t);
const clears = (script: Step[]) => script.filter((s) => s.t === 'clear');
const scores = (script: Step[]) => script.filter((s) => s.t === 'score');
const cellsOfColor = (b: Board, color: string): Pos[] => {
  const out: Pos[] = [];
  b.forEach((row, r) => row.forEach((p, c) => { if (p?.kind === 'gem' && p.color === color) out.push(P(r, c)); }));
  return out;
};

// Row 7 reads R R Y with a red at (6,2): swapping (6,2)↔(7,2) makes red line3 at row 7, cols 0–2.
const LINE3 = { '7,1': 'R', '6,2': 'R' };
const LINE3_SWAP = swap(P(6, 2), P(7, 2));

function deepFreeze<T>(x: T): T {
  if (x && typeof x === 'object') {
    for (const v of Object.values(x)) deepFreeze(v);
    Object.freeze(x);
  }
  return x;
}

describe('applyMove', () => {
  it('invalid swap returns swap-invalid and same state', () => {
    const s = makeState(boardWith());
    const r = applyMove(s, swap(P(0, 0), P(0, 1)));
    expect(r.script).toEqual([{ t: 'swap-invalid', a: P(0, 0), b: P(0, 1), ids: [1, 2] }]);
    expect(r.state).toBe(s);

    const far = applyMove(s, swap(P(0, 0), P(0, 2)));
    expect(types(far.script)).toEqual(['swap-invalid']);
    expect(far.state).toBe(s);

    // A prism↔rock swap is legal only between neighbors.
    const rock = makeState(boardWith({ '3,3': 'P', '3,5': 'X' }));
    const pr = applyMove(rock, swap(P(3, 3), P(3, 5)));
    expect(types(pr.script)).toEqual(['swap-invalid']);
    expect(pr.state).toBe(rock);
  });

  it('line3 swap: swap, clear, score 100, fall in that order', () => {
    const s = makeState(boardWith(LINE3));
    const { state, script } = applyMove(s, LINE3_SWAP);
    expect(types(script).slice(0, 4)).toEqual(['swap', 'clear', 'score', 'fall']);
    expect(script[0]).toEqual({ t: 'swap', a: P(6, 2), b: P(7, 2), ids: [idAt(s.board, P(6, 2)), idAt(s.board, P(7, 2))] });
    const clear = script[1];
    if (clear.t !== 'clear') throw new Error('expected clear');
    expect(clear.chain).toBe(0);
    expect(clear.groups).toEqual([{ key: 'red', cells: [P(7, 0), P(7, 1), P(7, 2)], shape: 'line3' }]);
    expect(clear.blasts).toEqual([]);
    expect(clear.created).toEqual([]);
    expect(clear.cleared.map((c) => [key(c.at), c.cause, c.key])).toEqual([
      ['7,0', 'match', 'red'], ['7,1', 'match', 'red'], ['7,2', 'match', 'red'],
    ]);
    expect(clear.cleared[2].id).toBe(idAt(s.board, P(6, 2)));
    expect(script[2]).toEqual({ t: 'score', chain: 0, combo: 1, points: 100, total: 100 });
    const fall = script[3];
    if (fall.t !== 'fall') throw new Error('expected fall');
    expect(fall.spawns.map((sp) => key(sp.to))).toEqual(['0,0', '0,1', '0,2']);
    expect(fall.spawns.every((sp) => sp.fromRow === -1)).toBe(true);
    expect(fall.falls).toHaveLength(21);
    expect(state.moves).toBe(1);
    expect(state.score).toBeGreaterThanOrEqual(100);
    expect(state.counters.red).toBeGreaterThanOrEqual(3);
    expect(state.rngState).not.toBe(s.rngState);
  });

  it('line4 creates charge at moved cell with same id', () => {
    const s = makeState(boardWith({ '7,1': 'R', '7,3': 'R', '6,2': 'R' }));
    const clear = clears(applyMove(s, LINE3_SWAP).script)[0];
    expect(clear.groups.map((g) => g.shape)).toEqual(['line4']);
    expect(clear.created).toEqual([
      { at: P(7, 2), piece: { id: idAt(s.board, P(6, 2)), kind: 'gem', color: 'red', special: 'charge' } },
    ]);
    expect(clear.cleared.map((c) => key(c.at))).toEqual(['7,0', '7,1', '7,3']);
    expect(scores(applyMove(s, LINE3_SWAP).script)[0].points).toBe(200);
  });

  it('L creates arc', () => {
    // Column 2 rows 6–7 and row 5 cols 3–4 are red; red (4,2) swaps down into the corner.
    const s = makeState(boardWith({ '6,2': 'R', '7,2': 'R', '5,3': 'R', '5,4': 'R' }));
    const { script } = applyMove(s, swap(P(4, 2), P(5, 2)));
    const clear = clears(script)[0];
    expect(clear.groups.map((g) => g.shape)).toEqual(['cross']);
    expect(clear.created).toEqual([
      { at: P(5, 2), piece: { id: idAt(s.board, P(4, 2)), kind: 'gem', color: 'red', special: 'arc' } },
    ]);
    expect(clear.cleared).toHaveLength(4);
    expect(scores(script)[0].points).toBe(300);
  });

  it('5-line creates prism', () => {
    const s = makeState(boardWith({ '7,1': 'R', '7,3': 'R', '7,4': 'R', '6,2': 'R' }));
    const { script } = applyMove(s, LINE3_SWAP);
    const clear = clears(script)[0];
    expect(clear.groups.map((g) => g.shape)).toEqual(['line5']);
    expect(clear.created).toEqual([{ at: P(7, 2), piece: { id: idAt(s.board, P(6, 2)), kind: 'prism' } }]);
    expect(clear.cleared.map((c) => key(c.at))).toEqual(['7,0', '7,1', '7,3', '7,4']);
    expect(scores(script)[0].points).toBe(500);
  });

  it('matched charge detonates and blast-only pieces score 20', () => {
    const s = makeState(boardWith({ ...LINE3, '7,0': 'Rc' }));
    const { script } = applyMove(s, LINE3_SWAP);
    const clear = clears(script)[0];
    expect(clear.blasts).toEqual([{ kind: 'charge', at: P(7, 0), cells: [P(6, 0), P(6, 1)], order: 0 }]);
    expect(clear.cleared.map((c) => [key(c.at), c.cause, c.key])).toEqual([
      ['7,0', 'match', 'red'], ['7,1', 'match', 'red'], ['7,2', 'match', 'red'],
      ['6,0', 'blast', 'magenta'], ['6,1', 'blast', 'orange'],
    ]);
    expect(scores(script)[0]).toMatchObject({ chain: 0, combo: 1, points: 140 });
  });

  it('prism + gem clears that color', () => {
    const s = makeState(boardWith({ '3,3': 'P' }));
    const { script } = applyMove(s, swap(P(3, 3), P(3, 4)));
    const clear = clears(script)[0];
    // After the swap the prism sits at (3,4) and the cyan partner at (3,3).
    const cyan = [...cellsOfColor(s.board, 'cyan').filter((p) => key(p) !== '3,4'), P(3, 3)];
    expect(clear.groups).toEqual([]);
    expect(clear.blasts).toHaveLength(1);
    expect(clear.blasts[0]).toMatchObject({ kind: 'prism', at: P(3, 4), color: 'cyan', order: 0 });
    const cleared = clear.cleared.map((c) => key(c.at)).sort();
    expect(cleared).toEqual([...cyan.map(key), '3,4'].sort());
    expect(clear.cleared.find((c) => key(c.at) === '3,4')).toMatchObject({ cause: 'blast', key: 'prism' });
    expect(clear.cleared.every((c) => c.cause === 'blast')).toBe(true);
    expect(scores(script)[0].points).toBe(20 * (cyan.length + 1));
  });

  it('prism + rock clears the prism and every rock, and leaves specials alone', () => {
    const s = makeState(boardWith({ '3,3': 'P', '3,4': 'X', '0,0': 'X', '5,6': 'X', '7,7': 'X', '1,1': 'Rc', '6,2': 'Ba' }));
    const { script } = applyMove(s, swap(P(3, 3), P(3, 4)));
    expect(types(script).slice(0, 2)).toEqual(['swap', 'clear']);
    const clear = clears(script)[0];
    // After the swap the prism sits at (3,4) and the rock at (3,3).
    expect(clear.groups).toEqual([]);
    expect(clear.blasts).toEqual([{
      kind: 'prism', at: P(3, 4), order: 0, color: 'rock',
      cells: [P(0, 0), P(3, 3), P(3, 4), P(5, 6), P(7, 7)],
    }]);
    expect(clear.cleared.map((c) => [key(c.at), c.cause, c.key])).toEqual([
      ['0,0', 'blast', 'rock'], ['3,3', 'blast', 'rock'], ['3,4', 'blast', 'prism'],
      ['5,6', 'blast', 'rock'], ['7,7', 'blast', 'rock'],
    ]);
    expect(clear.created).toEqual([]);
    expect(scores(script)[0].points).toBe(20 * 5);
  });

  it('prism + rock also clears rocks the swap lines up, by match', () => {
    // The swap drops the rock at (2,3) between rocks (2,4) and (2,5); (6,6) is a lone rock.
    const s = makeState(boardWith({ '2,3': 'P', '3,3': 'X', '2,4': 'X', '2,5': 'X', '6,6': 'X' }));
    const { script } = applyMove(s, swap(P(2, 3), P(3, 3)));
    const clear = clears(script)[0];
    expect(clear.groups.map((g) => [g.key, g.cells.map(key)])).toEqual([['rock', ['2,3', '2,4', '2,5']]]);
    expect(clear.cleared.map((c) => [key(c.at), c.cause]).sort()).toEqual([
      ['2,3', 'match'], ['2,4', 'match'], ['2,5', 'match'], ['3,3', 'blast'], ['6,6', 'blast'],
    ]);
    expect(clear.blasts[0].cells).toEqual([P(3, 3), P(6, 6)]);
  });

  it('a prism + rock game replays to the same script and state', () => {
    const s = makeState(boardWith({ '3,3': 'P', '3,4': 'X', '0,0': 'X', '7,7': 'X' }), { level: 16, rngState: 12345 });
    const play = () => {
      let state = s;
      const scripts: Step[][] = [];
      for (let i = 0; i < 6 && !state.over; i++) {
        const move = i === 0 ? swap(P(3, 3), P(3, 4)) : productiveMoves(state)[0];
        const r = applyMove(state, move);
        scripts.push(r.script);
        state = r.state;
      }
      return { state, scripts };
    };
    const first = play();
    expect(clears(first.scripts[0])[0].blasts[0]).toMatchObject({ kind: 'prism', color: 'rock' });
    expect(play()).toEqual(first);
  });

  it('prism + prism supernova clears board', () => {
    const s = makeState(boardWith({ '3,3': 'P', '3,4': 'P' }));
    const { script } = applyMove(s, swap(P(3, 3), P(3, 4)));
    const clear = clears(script)[0];
    expect(clear.blasts).toHaveLength(1);
    expect(clear.blasts[0]).toMatchObject({ kind: 'supernova', at: P(3, 4), order: 0 });
    expect(new Set(clear.cleared.map((c) => key(c.at))).size).toBe(64);
    expect(clear.cleared.filter((c) => c.key === 'prism')).toHaveLength(2);
    expect(scores(script)[0].points).toBe(64 * 20);
  });

  it('prism + charge converts color then detonates', () => {
    const s = makeState(boardWith({ '3,3': 'P', '3,4': 'Cc' }));
    const { script } = applyMove(s, swap(P(3, 3), P(3, 4)));
    const clear = clears(script)[0];
    const cyanAfterSwap = [...cellsOfColor(s.board, 'cyan').filter((p) => key(p) !== '3,4'), P(3, 3)]
      .sort((p, q) => p.row - q.row || p.col - q.col);
    const idAfterSwap = (p: Pos) => (key(p) === '3,3' ? idAt(s.board, P(3, 4)) : idAt(s.board, p));
    expect(clear.created).toEqual(cyanAfterSwap.map((at) => ({
      at, piece: { id: idAfterSwap(at), kind: 'gem', color: 'cyan', special: 'charge' },
    })));
    const seeds = clear.blasts.filter((b) => b.order === 0);
    expect(seeds.map((b) => [b.kind, key(b.at)])).toEqual(cyanAfterSwap.map((p) => ['charge', key(p)]));
    const cleared = new Set(clear.cleared.map((c) => key(c.at)));
    for (const p of cyanAfterSwap) expect(cleared.has(key(p))).toBe(true);
    expect(clear.cleared.find((c) => key(c.at) === '3,4')).toMatchObject({ cause: 'blast', key: 'prism' });
    expect(clear.blasts.some((b) => b.kind === 'prism')).toBe(false);
  });

  it('prism conversion inside a match group detonates once and creates no second special', () => {
    // The swap lands the cyan charge at (3,3) between cyan (2,3) and (4,3), beside cyan (1,3): line4.
    const s = makeState(boardWith({ '3,3': 'P', '3,4': 'Cc', '2,3': 'C', '4,3': 'C' }), { levelTarget: 1e9 });
    const { state, script } = applyMove(s, swap(P(3, 4), P(3, 3)));
    const clear = clears(script)[0];
    expect(clear.groups.map((g) => g.shape)).toEqual(['line4']);
    const ids = clear.created.map((c) => c.piece.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(clear.created.filter((c) => key(c.at) === '3,3')).toHaveLength(1);
    expect(clear.cleared.some((c) => key(c.at) === '3,3')).toBe(true);
    expect(clear.blasts.filter((b) => key(b.at) === '3,3')).toHaveLength(1);
    // Nothing that detonated is still on the board.
    const detonated = new Set(clear.blasts.map((b) => s.board[b.at.row][b.at.col]!.id));
    detonated.add(idAt(s.board, P(3, 4)));
    expect(state.board.flat().some((p) => detonated.has(p!.id))).toBe(false);
  });

  it('cascade chain increments and multiplies', () => {
    // Clearing row 7 cols 0–2 drops cyan (5,1),(5,2) into row 6 beside cyan (6,3).
    const s = makeState(boardWith({ ...LINE3, '5,1': 'C', '5,2': 'C', '6,3': 'C' }));
    const { script } = applyMove(s, LINE3_SWAP);
    expect(scores(script).map((sc) => sc.chain)).toEqual([0, 1]);
    expect(scores(script).map((sc) => sc.points)).toEqual([100, 200]);
    const second = clears(script)[1];
    expect(second.chain).toBe(1);
    expect(second.groups).toEqual([{ key: 'cyan', cells: [P(6, 1), P(6, 2), P(6, 3)], shape: 'line3' }]);
    expect(types(script)).toEqual(['swap', 'clear', 'score', 'fall', 'clear', 'score', 'fall']);
  });

  it('non-matching placement emits only place and counts a move', () => {
    const s = makeState(boardWith(LINE3), { tray: ['red'] });
    const { state, script } = applyMove(s, { type: 'place', slot: 0, at: P(0, 5) });
    expect(script).toEqual([{
      t: 'place', slot: 0, at: P(0, 5), removedId: idAt(s.board, P(0, 5)),
      piece: { id: s.nextId, kind: 'gem', color: 'red', special: 'none' },
    }]);
    expect(state.moves).toBe(1);
    expect(state.tray).toEqual([]);
    expect(state.nextId).toBe(s.nextId + 1);
    expect(state.board[0][5]).toEqual({ id: s.nextId, kind: 'gem', color: 'red', special: 'none' });
    expect(state.score).toBe(0);
    expect(state.over).toBe(false);
  });

  it('matching placement resolves like a swap', () => {
    const s = makeState(boardWith(LINE3), { tray: ['blue', 'red'] });
    const { state, script } = applyMove(s, { type: 'place', slot: 1, at: P(7, 2) });
    expect(types(script).slice(0, 4)).toEqual(['place', 'clear', 'score', 'fall']);
    const clear = clears(script)[0];
    expect(clear.groups).toEqual([{ key: 'red', cells: [P(7, 0), P(7, 1), P(7, 2)], shape: 'line3' }]);
    expect(clear.cleared[2].id).toBe(s.nextId);
    expect(scores(script)[0].points).toBe(100);
    expect(state.tray).toEqual(['blue']);
    expect(state.moves).toBe(1);
  });

  it('placement onto rock returns empty script', () => {
    const s = makeState(boardWith({ ...LINE3, '4,4': 'X' }), { tray: ['red'] });
    const r = applyMove(s, { type: 'place', slot: 0, at: P(4, 4) });
    expect(r.script).toEqual([]);
    expect(r.state).toBe(s);
  });

  it('level up replaces board once and resets progress', () => {
    // Already far past both the level 1 and level 2 targets: still only one level per move.
    const s = makeState(boardWith(LINE3), { score: 5000 });
    const { state, script } = applyMove(s, LINE3_SWAP);
    const ups = script.filter((st) => st.t === 'level-up');
    expect(ups).toHaveLength(1);
    expect(ups[0]).toMatchObject({ level: 2 });
    if (ups[0].t !== 'level-up') throw new Error('expected level-up');
    expect(state.board).toEqual(ups[0].board);
    expect(findMatches(state.board)).toEqual([]);
    expect(state.level).toBe(2);
    expect(state.levelStartScore).toBe(state.score);
    expect(state.levelTarget).toBe(levelTarget(2));
    expect(types(script).indexOf('level-up')).toBeGreaterThan(types(script).lastIndexOf('fall'));
    expect(state.over).toBe(false);
  });

  it('game-over emitted when the resulting board is dead', () => {
    const s = makeState(boardWith(), { tray: ['red'] });
    const { state, script } = applyMove(s, { type: 'place', slot: 0, at: P(0, 5) });
    expect(types(script)).toEqual(['place', 'game-over']);
    expect(state.over).toBe(true);
    const after = applyMove(state, { type: 'swap', a: P(0, 0), b: P(0, 1) });
    expect(after.script).toEqual([]);
    expect(after.state).toBe(state);
  });

  it('applyMove does not mutate input', () => {
    const cases: [GameState, Move][] = [
      [makeState(boardWith({ ...LINE3, '7,0': 'Rc', '5,1': 'C', '5,2': 'C', '6,3': 'C' }), { tray: ['red'] }), LINE3_SWAP],
      [makeState(boardWith({ '3,3': 'P', '3,4': 'Cc' })), swap(P(3, 3), P(3, 4))],
      [makeState(boardWith(LINE3), { tray: ['blue', 'red'], score: 990 }), { type: 'place', slot: 1, at: P(7, 2) }],
    ];
    for (const [s, move] of cases) {
      const snapshot = structuredClone(s);
      deepFreeze(s);
      expect(() => applyMove(s, move)).not.toThrow();
      expect(s).toEqual(snapshot);
    }
  });

  it('replay is deterministic', () => {
    const play = () => {
      let s = newGame(7);
      const scripts: Step[][] = [];
      for (let i = 0; i < 30 && !s.over; i++) {
        const r = applyMove(s, productiveMoves(s)[0]);
        scripts.push(r.script);
        s = r.state;
      }
      return { s, scripts };
    };
    const first = play();
    expect(first.scripts.length).toBeGreaterThan(0);
    expect(first.s.moves).toBe(first.scripts.length);
    expect(play()).toEqual(first);
  });

  it('newGame starts a fresh level 1 state from the seed', () => {
    const s = newGame(42);
    expect(s).toMatchObject({ level: 1, score: 0, levelStartScore: 0, levelTarget: 1000, tray: [], moves: 0, over: false, seed: 42 });
    expect(findMatches(s.board)).toEqual([]);
    expect(productiveMoves(s).length).toBeGreaterThan(0);
    expect(s.nextId).toBe(65);
    expect(newGame(42)).toEqual(s);
    expect(newGame(43).board).not.toEqual(s.board);
  });

  it('long play keeps the board full, settled and uniquely keyed', () => {
    let s = newGame(3);
    const seen = new Set<string>();
    for (let i = 0; i < 300 && !s.over; i++) {
      const moves = productiveMoves(s);
      const { state, script } = applyMove(s, moves[(i * 7) % moves.length]);
      for (const st of script) seen.add(st.t === 'clear' ? `clear:${st.blasts.map((b) => b.kind).join()}` : st.t);
      const ids = state.board.flat().map((p) => p!.id);
      expect(ids.every((id) => id < state.nextId)).toBe(true);
      expect(new Set(ids).size).toBe(64);
      expect(findMatches(state.board)).toEqual([]);
      const last = scores(script).at(-1);
      if (last) expect(last.total).toBe(state.score);
      expect(state.tray.length).toBeLessThanOrEqual(5);
      expect(state.moves).toBe(s.moves + 1);
      s = state;
    }
    // The run exercised the systems the fixtures pin individually.
    expect(seen.has('level-up')).toBe(true);
    expect(seen.has('tray-earn')).toBe(true);
    expect([...seen].some((t) => t.startsWith('clear:') && t !== 'clear:')).toBe(true);
  });
});
