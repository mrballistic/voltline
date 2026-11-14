import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, applyMove, newGame, productiveMoves } from '../engine';
import type { Blast, Cleared, Color, Piece, Pos, Spawn, Step } from '../engine';
import { boardWith, makeState } from '../engine/testing';
import { ANIM, fallDurationMs } from './constants';
import { planScript } from './plan';
import type { Action, Planned } from './plan';

const POP_MS = ANIM.popGrowMs + ANIM.popCollapseMs;
const at = (row: number, col: number): Pos => ({ row, col });
const gem = (id: number, color: Color = 'red'): Piece => ({ id, kind: 'gem', color, special: 'none' });
const rock = (id: number): Piece => ({ id, kind: 'rock' });

const swap: Step = { t: 'swap', a: at(7, 0), b: at(7, 1), ids: [1, 2] };

function clear(cleared: Cleared[], extra: Partial<Extract<Step, { t: 'clear' }>> = {}): Step {
  return { t: 'clear', chain: 0, groups: [], blasts: [], cleared, created: [], ...extra };
}
const matched = (id: number, row: number, col: number, key: Cleared['key'] = 'red'): Cleared =>
  ({ id, at: at(row, col), cause: 'match', key });
const blasted = (id: number, row: number, col: number, key: Cleared['key'] = 'red'): Cleared =>
  ({ id, at: at(row, col), cause: 'blast', key });
const score = (points = 30, chain = 0): Step => ({ t: 'score', chain, combo: 1, points, total: points });
const spawn = (piece: Piece, row: number, col: number, fromRow: number): Spawn => ({ piece, to: at(row, col), fromRow });
const fall = (id: number, col: number, fromRow: number, toRow: number) =>
  ({ id, from: at(fromRow, col), to: at(toRow, col) });

function of<K extends Action['a']>(items: Planned[], kind: K): (Planned & { action: Extract<Action, { a: K }> })[] {
  return items.filter((p) => p.action.a === kind) as (Planned & { action: Extract<Action, { a: K }> })[];
}
const cues = (items: Planned[], name: string) => of(items, 'cue').filter((p) => p.action.name === name);
const end = (p: Planned) => p.atMs + p.durMs;

// One three-in-a-row in row 7, then gravity drops the column stacks above it.
const threeRow = clear([matched(1, 7, 0), matched(2, 7, 1), matched(3, 7, 2)], {
  groups: [{ key: 'red', cells: [at(7, 0), at(7, 1), at(7, 2)], shape: 'line3' }],
});
const refill: Step = {
  t: 'fall',
  falls: [fall(10, 0, 6, 7), fall(11, 0, 5, 6), fall(12, 1, 3, 7)],
  spawns: [spawn(gem(20), 0, 0, -1), spawn(gem(21), 0, 2, -2), spawn(gem(22), 1, 2, -1)],
};

describe('fallDurationMs', () => {
  it('follows constant gravity from rest', () => {
    expect(fallDurationMs(1)).toBeCloseTo(182.6, 1);
    expect(fallDurationMs(8)).toBeCloseTo(516.4, 1);
  });
});

describe('planScript', () => {
  it('all falls and spawns in a step share one start time', () => {
    const { items } = planScript([swap, threeRow, score(), refill]);
    const starts = new Set([...of(items, 'fall'), ...of(items, 'spawn')].map((p) => p.atMs));
    expect(starts.size).toBe(1);
    expect([...starts][0]).toBe(ANIM.swapMs + POP_MS);
    expect(of(items, 'fall')).toHaveLength(3);
    expect(of(items, 'spawn')).toHaveLength(3);
  });

  it('spawn fromRow is preserved', () => {
    const { items } = planScript([threeRow, refill]);
    const s = of(items, 'spawn').find((p) => p.action.piece.id === 21)!;
    expect(s.action).toEqual({ a: 'spawn', piece: gem(21), col: 2, fromRow: -2, toRow: 0 });
    expect(s.durMs).toBeCloseTo(fallDurationMs(2));
    const f = of(items, 'fall').find((p) => p.action.id === 12)!;
    expect(f.action).toEqual({ a: 'fall', id: 12, col: 1, fromRow: 3, toRow: 7 });
    expect(f.durMs).toBeCloseTo(fallDurationMs(4));
  });

  it('each fall has a land at its end', () => {
    const { items } = planScript([threeRow, refill]);
    const movers = [
      ...of(items, 'fall').map((p) => ({ id: p.action.id, p })),
      ...of(items, 'spawn').map((p) => ({ id: p.action.piece.id, p })),
    ];
    expect(of(items, 'land')).toHaveLength(movers.length);
    for (const { id, p } of movers) {
      const land = of(items, 'land').find((l) => l.action.id === id)!;
      expect(land.atMs).toBeCloseTo(end(p));
      expect(land.durMs).toBe(ANIM.landMs);
    }
  });

  it('next clear starts after last landing minus overlap', () => {
    const second = clear([matched(30, 7, 5, 'blue')], {
      chain: 1, groups: [{ key: 'blue', cells: [at(7, 5)], shape: 'line3' }],
    });
    const { items } = planScript([threeRow, score(), refill, second, score(60, 1)]);
    const lastLand = Math.max(...of(items, 'land').map(end));
    const pop = of(items, 'pop').find((p) => p.action.id === 30)!;
    expect(pop.atMs).toBeCloseTo(lastLand - ANIM.cascadeOverlapMs);
    const match = cues(items, 'match').find((p) => p.action.chain === 1)!;
    expect(match.atMs).toBeCloseTo(pop.atMs);
  });

  it('blast start offsets follow order × 60', () => {
    const blasts: Blast[] = [
      { kind: 'charge', at: at(4, 4), cells: [at(3, 3), at(3, 4)], order: 0 },
      { kind: 'arc', at: at(3, 4), cells: [at(3, 0)], order: 1 },
      { kind: 'charge', at: at(3, 0), cells: [at(2, 0)], order: 2 },
    ];
    const step = clear([matched(1, 4, 4), blasted(2, 3, 3), blasted(3, 3, 4), blasted(4, 3, 0), blasted(5, 2, 0)], { blasts });
    const { items } = planScript([swap, step]);
    const start = ANIM.swapMs;
    const planned = of(items, 'blast');
    expect(planned.map((p) => p.atMs)).toEqual([start, start + 60, start + 120]);
    expect(planned.map((p) => p.action.blast)).toEqual(blasts);
    expect(planned.map((p) => p.durMs)).toEqual([ANIM.chargeShake.ms, ANIM.arcBeamMs, ANIM.chargeShake.ms]);
    // A blasted cell pops when the blast that claimed it fires, not before.
    const popAt = (id: number) => of(items, 'pop').find((p) => p.action.id === id)!.atMs;
    expect(popAt(1)).toBe(start);
    expect(popAt(3)).toBe(start);
    expect(popAt(4)).toBe(start + 60);
    expect(popAt(5)).toBe(start + 120);
    expect(cues(items, 'charge-blast').map((p) => p.atMs)).toEqual([start, start + 120]);
    expect(cues(items, 'arc-blast').map((p) => p.atMs)).toEqual([start + 60]);
  });

  it('a prism blast staggers its bolts and the pops they cause', () => {
    const blast: Blast = { kind: 'prism', at: at(0, 0), cells: [at(0, 0), at(2, 2), at(5, 5)], order: 0, color: 'red' };
    const step = clear([blasted(1, 0, 0, 'prism'), blasted(2, 2, 2), blasted(3, 5, 5)], { blasts: [blast] });
    const { items } = planScript([step]);
    expect(of(items, 'pop').map((p) => p.atMs)).toEqual([0, ANIM.prismBoltStaggerMs, 2 * ANIM.prismBoltStaggerMs]);
    expect(of(items, 'blast')[0].durMs).toBe(3 * ANIM.prismBoltStaggerMs);
    expect(cues(items, 'prism-blast')).toHaveLength(1);
  });

  it('a blast with no cells is still planned, with its cue and effect at its time', () => {
    const empty: Blast = { kind: 'supernova', at: at(3, 3), cells: [], order: 1 };
    const seed: Blast = { kind: 'charge', at: at(4, 4), cells: [at(4, 4)], order: 0 };
    const step = clear([blasted(1, 4, 4)], { blasts: [seed, empty] });
    const { items, totalMs } = planScript([step]);
    const b = of(items, 'blast').find((p) => p.action.blast === empty)!;
    expect(b.atMs).toBe(ANIM.blastStaggerMs);
    expect(Number.isFinite(b.durMs)).toBe(true);
    expect(b.durMs).toBeGreaterThan(0);
    expect(cues(items, 'prism-supernova').map((p) => p.atMs)).toEqual([ANIM.blastStaggerMs]);
    expect(Number.isFinite(totalMs)).toBe(true);
    for (const p of items) expect(Number.isFinite(p.atMs) && Number.isFinite(p.durMs)).toBe(true);
  });

  it('prism-converted specials morph first and detonate createMs later', () => {
    const charge = (id: number): Piece => ({ id, kind: 'gem', color: 'red', special: 'charge' });
    const blasts: Blast[] = [
      // Seeds on just-converted charges, and an arc one of them chains into.
      { kind: 'charge', at: at(2, 2), cells: [at(2, 2), at(2, 3)], order: 0 },
      { kind: 'charge', at: at(5, 5), cells: [at(5, 5)], order: 0 },
      { kind: 'arc', at: at(2, 3), cells: [at(2, 7)], order: 1 },
      // A seed that was not created this step keeps its normal time.
      { kind: 'charge', at: at(7, 0), cells: [at(7, 1)], order: 0 },
    ];
    const step = clear(
      [blasted(1, 0, 0, 'prism'), blasted(2, 2, 2), blasted(3, 2, 3), blasted(4, 5, 5), blasted(5, 2, 7), blasted(6, 7, 1)],
      { blasts, created: [{ at: at(2, 2), piece: charge(2) }, { at: at(5, 5), piece: charge(4) }] },
    );
    const { items } = planScript([swap, step]);
    const start = ANIM.swapMs;
    const late = start + ANIM.createMs;
    expect(of(items, 'blast').map((p) => p.atMs)).toEqual([start, late, late, late + ANIM.blastStaggerMs]);
    expect(of(items, 'blast').find((p) => p.action.blast === blasts[3])!.atMs).toBe(start);
    expect(cues(items, 'charge-blast').map((p) => p.atMs)).toEqual([start, late, late]);
    expect(cues(items, 'arc-blast').map((p) => p.atMs)).toEqual([late + ANIM.blastStaggerMs]);
    const popAt = (id: number) => of(items, 'pop').find((p) => p.action.id === id)!.atMs;
    expect([popAt(2), popAt(3), popAt(4), popAt(5), popAt(6)]).toEqual([late, late, late, late + ANIM.blastStaggerMs, start]);
    expect(popAt(1)).toBe(start); // the spent prism, claimed by no blast
    for (const m of of(items, 'morph')) expect(m).toMatchObject({ atMs: start, durMs: ANIM.createMs });
    const fallStart = late + ANIM.blastStaggerMs + POP_MS;
    expect(planScript([swap, step, refill]).items.find((p) => p.action.a === 'fall')!.atMs).toBe(fallStart);
  });

  it('a blast chained from a prism fires after the bolt reaches it, and so do its own chains', () => {
    const diagonal = [0, 1, 2, 3, 4, 5].map((i) => at(i, i));
    const blasts: Blast[] = [
      { kind: 'prism', at: at(0, 0), cells: diagonal, order: 0, color: 'red' },
      { kind: 'charge', at: at(5, 5), cells: [at(5, 6), at(6, 6)], order: 1 }, // the prism's 6th cell
      { kind: 'charge', at: at(6, 6), cells: [at(7, 7)], order: 2 }, // chained off the charge
    ];
    const cleared = [
      ...diagonal.map((p, i) => blasted(i + 1, p.row, p.col, i === 0 ? 'prism' : 'red')),
      blasted(50, 5, 6), blasted(51, 6, 6), blasted(52, 7, 7),
    ];
    const { items } = planScript([clear(cleared, { blasts })]);
    const popAt = (id: number) => of(items, 'pop').find((p) => p.action.id === id)!.atMs;
    const fired = (b: Blast) => of(items, 'blast').find((p) => p.action.blast === b)!.atMs;
    const hit = 5 * ANIM.prismBoltStaggerMs;
    expect(popAt(6)).toBe(hit); // the charge piece itself, struck by the 6th bolt
    expect(fired(blasts[1])).toBe(hit + ANIM.blastStaggerMs);
    expect(fired(blasts[1])).toBeGreaterThanOrEqual(popAt(6));
    expect(popAt(50)).toBe(hit + ANIM.blastStaggerMs);
    expect(popAt(51)).toBe(hit + ANIM.blastStaggerMs);
    expect(fired(blasts[2])).toBe(hit + 2 * ANIM.blastStaggerMs);
    expect(popAt(52)).toBe(hit + 2 * ANIM.blastStaggerMs);
    expect(cues(items, 'charge-blast').map((p) => p.atMs)).toEqual([hit + ANIM.blastStaggerMs, hit + 2 * ANIM.blastStaggerMs]);
  });

  it('a blast chained from a supernova fires after the bolt reaches it', () => {
    const board = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => at(Math.floor(i / BOARD_SIZE), i % BOARD_SIZE));
    const blasts: Blast[] = [
      { kind: 'supernova', at: at(0, 0), cells: board, order: 0 },
      { kind: 'arc', at: at(3, 4), cells: [], order: 1 }, // everything was already claimed
    ];
    const { items } = planScript([clear(board.map((p, i) => blasted(i + 1, p.row, p.col)), { blasts })]);
    const hit = (3 * BOARD_SIZE + 4) * ANIM.prismBoltStaggerMs;
    expect(of(items, 'pop').find((p) => p.action.id === 3 * BOARD_SIZE + 5)!.atMs).toBe(hit);
    expect(of(items, 'blast').find((p) => p.action.blast === blasts[1])!.atMs).toBe(hit + ANIM.blastStaggerMs);
    expect(cues(items, 'arc-blast').map((p) => p.atMs)).toEqual([hit + ANIM.blastStaggerMs]);
  });

  it('a real prism + charge swap detonates its converted charges after the morph', () => {
    const state = makeState(boardWith({ '0,0': 'P', '0,1': 'Rc' }));
    const { script } = applyMove(state, { type: 'swap', a: at(0, 0), b: at(0, 1) });
    const first = script.find((s) => s.t === 'clear')!;
    if (first.t !== 'clear') throw new Error('expected a clear');
    expect(first.created.length).toBeGreaterThan(1);
    const { items } = planScript(script);
    const opening = of(items, 'blast').filter((p) => first.blasts.includes(p.action.blast));
    expect(opening).toHaveLength(first.blasts.length);
    for (const p of opening) {
      expect(p.atMs).toBe(ANIM.swapMs + ANIM.createMs + p.action.blast.order * ANIM.blastStaggerMs);
    }
    const morphs = of(items, 'morph').filter((p) => first.created.some((c) => c.piece.id === p.action.id));
    for (const m of morphs) expect(m.atMs).toBe(ANIM.swapMs);
  });

  it('invalid swap is out-and-back with cue at the back leg', () => {
    const step: Step = { t: 'swap-invalid', a: at(2, 2), b: at(2, 3), ids: [5, 6] };
    const { items, totalMs } = planScript([step]);
    const out = of(items, 'swap');
    const back = of(items, 'swap-back');
    expect(out).toEqual([{ atMs: 0, durMs: ANIM.invalidMs, action: { a: 'swap', ids: [5, 6], to: [at(2, 3), at(2, 2)] } }]);
    expect(back).toEqual([{ atMs: ANIM.invalidMs, durMs: ANIM.invalidMs, action: { a: 'swap-back', ids: [5, 6], a1: at(2, 2), b1: at(2, 3) } }]);
    expect(cues(items, 'swap-invalid').map((p) => p.atMs)).toEqual([ANIM.invalidMs]);
    expect(cues(items, 'swap')).toHaveLength(0);
    expect(totalMs).toBe(2 * ANIM.invalidMs);
  });

  it('valid swap moves both pieces with a swap cue at its start', () => {
    const { items } = planScript([swap]);
    expect(of(items, 'swap')).toEqual([{ atMs: 0, durMs: ANIM.swapMs, action: { a: 'swap', ids: [1, 2], to: [at(7, 1), at(7, 0)] } }]);
    expect(cues(items, 'swap').map((p) => p.atMs)).toEqual([0]);
  });

  it('one land cue per column', () => {
    const step: Step = {
      t: 'fall',
      falls: [fall(10, 0, 6, 7), fall(11, 0, 4, 6), fall(12, 3, 6, 7)],
      spawns: [spawn(gem(20), 0, 0, -1), spawn(rock(21), 0, 5, -1), spawn(gem(22), 1, 5, -2)],
    };
    const { items } = planScript([step]);
    const lands = cues(items, 'land');
    const drops = cues(items, 'rock-drop');
    expect(lands).toHaveLength(2); // columns 0 and 3
    expect(drops).toHaveLength(1); // column 5 has a rock coming in
    const landOf = (id: number) => of(items, 'land').find((p) => p.action.id === id)!.atMs;
    const col0 = Math.max(landOf(10), landOf(11), landOf(20));
    expect(lands.map((p) => p.atMs).sort((x, y) => x - y)).toEqual([landOf(12), col0].sort((x, y) => x - y));
    expect(drops[0].atMs).toBe(Math.max(landOf(21), landOf(22)));
  });

  it('cues fire at their action timestamps', () => {
    // Synthetic: the match cue shares the matched pops' start, each column's land cue its last landing.
    const { items } = planScript([swap, threeRow, score(), refill]);
    const pops = of(items, 'pop');
    expect(cues(items, 'match').map((p) => p.atMs)).toEqual([ANIM.swapMs]);
    expect(new Set(pops.map((p) => p.atMs))).toEqual(new Set([ANIM.swapMs]));
    const landEnds = new Map<number, number>();
    for (const p of [...of(items, 'fall'), ...of(items, 'spawn')]) {
      landEnds.set(p.action.col, Math.max(landEnds.get(p.action.col) ?? 0, end(p)));
    }
    const expected = [...landEnds.values()].sort((x, y) => x - y);
    expect(cues(items, 'land').map((p) => p.atMs).sort((x, y) => x - y)).toEqual(expected);

    // Real scripts: every round's match cue is on its matched pops, with that round's chain level,
    // and every land or rock-drop cue is on the last landing in some column of that round.
    let state = newGame(11);
    for (let n = 0; n < 8; n++) {
      const { script, state: next } = applyMove(state, productiveMoves(state)[0]);
      const plan = planScript(script).items;
      const matchCues = cues(plan, 'match');
      const clears = script.filter((s): s is Extract<Step, { t: 'clear' }> => s.t === 'clear' && s.groups.length > 0);
      expect(matchCues).toHaveLength(clears.length);
      clears.forEach((c, i) => {
        const matchedIds = new Set(c.cleared.filter((x) => x.cause === 'match').map((x) => x.id));
        const starts = new Set(of(plan, 'pop').filter((p) => matchedIds.has(p.action.id)).map((p) => p.atMs));
        expect(starts).toEqual(new Set([matchCues[i].atMs]));
        expect(matchCues[i].action.chain).toBe(c.chain);
      });
      const landings = new Map<string, number>(); // "fallStart:col" → last landing
      for (const p of [...of(plan, 'fall'), ...of(plan, 'spawn')]) {
        const k = `${p.atMs}:${p.action.col}`;
        landings.set(k, Math.max(landings.get(k) ?? 0, end(p)));
      }
      const columnCues = [...cues(plan, 'land'), ...cues(plan, 'rock-drop')].map((p) => p.atMs).sort((x, y) => x - y);
      expect(columnCues).toEqual([...landings.values()].sort((x, y) => x - y));
      state = next;
    }
  });

  it('tray fly begins after pops', () => {
    const blasts: Blast[] = [{ kind: 'charge', at: at(7, 1), cells: [at(6, 1)], order: 1 }];
    const step = clear([matched(1, 7, 0), matched(2, 7, 1), matched(3, 7, 2), blasted(4, 6, 1)], { blasts });
    const script: Step[] = [
      swap, step, score(),
      { t: 'tray-earn', color: 'red', from: at(7, 1), slot: 4 },
      { t: 'tray-full' },
    ];
    const { items } = planScript(script);
    const popsEnd = Math.max(...of(items, 'pop').map(end));
    expect(popsEnd).toBe(ANIM.swapMs + ANIM.blastStaggerMs + POP_MS);
    const fly = of(items, 'tray-fly')[0];
    expect(fly).toEqual({ atMs: popsEnd, durMs: ANIM.trayFlyMs, action: { a: 'tray-fly', color: 'red', from: at(7, 1), slot: 4 } });
    expect(cues(items, 'tray-earn').map((p) => p.atMs)).toEqual([end(fly)]);
    const notice = of(items, 'notice')[0];
    expect(notice.action).toEqual({ a: 'notice', kind: 'tray-full' });
    expect(notice.atMs).toBe(end(fly));
    expect(cues(items, 'tray-full').map((p) => p.atMs)).toEqual([end(fly)]);
  });

  it('timeScale 2 halves totalMs', () => {
    const script: Step[] = [swap, threeRow, score(), refill, { t: 'game-over' }];
    const normal = planScript(script);
    const fast = planScript(script, { timeScale: 2 });
    expect(fast.totalMs).toBeCloseTo(normal.totalMs / 2);
    expect(fast.items).toHaveLength(normal.items.length);
    fast.items.forEach((p, i) => {
      expect(p.atMs).toBeCloseTo(normal.items[i].atMs / 2);
      expect(p.durMs).toBeCloseTo(normal.items[i].durMs / 2);
    });
  });

  it('score action shares the clear start', () => {
    const { items } = planScript([swap, threeRow, { t: 'score', chain: 0, combo: 2, points: 90, total: 190 }]);
    const s = of(items, 'score')[0];
    expect(s).toEqual({ atMs: ANIM.swapMs, durMs: 0, action: { a: 'score', total: 190, points: 90, chain: 0, combo: 2 } });
    expect(cues(items, 'match')[0].atMs).toBe(ANIM.swapMs);
    expect(cues(items, 'match')[0].action.chain).toBe(0);
  });

  it('created specials morph at the clear start with their create cues', () => {
    const charge: Piece = { id: 2, kind: 'gem', color: 'red', special: 'charge' };
    const arc: Piece = { id: 9, kind: 'gem', color: 'blue', special: 'arc' };
    const prism: Piece = { id: 14, kind: 'prism' };
    const step = clear([matched(1, 7, 0), matched(3, 7, 2), matched(40, 5, 5, 'rock')], {
      created: [{ at: at(7, 1), piece: charge }, { at: at(3, 3), piece: arc }, { at: at(1, 1), piece: prism }],
    });
    const { items } = planScript([swap, step]);
    const morphs = of(items, 'morph');
    expect(morphs.map((p) => p.action)).toEqual([
      { a: 'morph', id: 2, piece: charge }, { a: 'morph', id: 9, piece: arc }, { a: 'morph', id: 14, piece: prism },
    ]);
    for (const m of morphs) expect(m).toMatchObject({ atMs: ANIM.swapMs, durMs: ANIM.createMs });
    for (const name of ['charge-create', 'arc-create', 'prism-create']) {
      expect(cues(items, name).map((p) => p.atMs)).toEqual([ANIM.swapMs]);
    }
    expect(cues(items, 'rock-break').map((p) => p.atMs)).toEqual([ANIM.swapMs]);
    expect(of(items, 'pop').find((p) => p.action.id === 40)!.action).toEqual({ a: 'pop', id: 40, at: at(5, 5), key: 'rock' });
  });

  it('place sets the piece down with a tray-place cue as it lands', () => {
    const piece = gem(50, 'green');
    const { items, totalMs } = planScript([{ t: 'place', slot: 2, at: at(4, 4), removedId: 7, piece }]);
    expect(of(items, 'place')).toEqual([{ atMs: 0, durMs: ANIM.placeMs, action: { a: 'place', removedId: 7, piece, slot: 2, at: at(4, 4) } }]);
    expect(cues(items, 'tray-place').map((p) => p.atMs)).toEqual([ANIM.placeMs]);
    expect(totalMs).toBe(ANIM.placeMs);
  });

  it('level-up swaps the board out and drops a fresh one in', () => {
    const board = Array.from({ length: BOARD_SIZE }, (_, r) =>
      Array.from({ length: BOARD_SIZE }, (_, c) => gem(100 + r * BOARD_SIZE + c)));
    const { items, totalMs } = planScript([{ t: 'level-up', level: 3, board }]);
    expect(of(items, 'notice')[0]).toEqual({ atMs: 0, durMs: 0, action: { a: 'notice', kind: 'level-up', level: 3 } });
    expect(cues(items, 'level-up').map((p) => p.atMs)).toEqual([0]);
    expect(of(items, 'board-out')[0]).toEqual({ atMs: 0, durMs: ANIM.boardOutMs, action: { a: 'board-out' } });
    const boardIn = of(items, 'board-in')[0];
    expect(boardIn.atMs).toBe(ANIM.boardOutMs);
    expect(boardIn.durMs).toBeCloseTo(fallDurationMs(BOARD_SIZE) + ANIM.landMs);
    expect(boardIn.action.board).toBe(board);
    expect(cues(items, 'board-in').map((p) => p.atMs)).toEqual([ANIM.boardOutMs]);
    expect(totalMs).toBeCloseTo(end(boardIn));
  });

  it('game-over posts its notice and cue after everything before it', () => {
    const { items } = planScript([swap, { t: 'game-over' }]);
    expect(of(items, 'notice')[0]).toEqual({ atMs: ANIM.swapMs, durMs: 0, action: { a: 'notice', kind: 'game-over' } });
    expect(cues(items, 'game-over').map((p) => p.atMs)).toEqual([ANIM.swapMs]);
  });

  // A last round that fills the tray: the fly (and its tray-full notice) outlasts the quiet fall.
  const fillsTray: Step[] = [
    swap, threeRow, score(),
    { t: 'tray-earn', color: 'red', from: at(7, 1), slot: 4 },
    { t: 'tray-full' },
    { t: 'fall', falls: [], spawns: [] },
  ];

  it('game-over waits for an in-flight tray fly, so the tray-full notice never follows it', () => {
    const { items } = planScript([...fillsTray, { t: 'game-over' }]);
    const fly = of(items, 'tray-fly')[0];
    const [full, over] = of(items, 'notice');
    expect(full.action.kind).toBe('tray-full');
    expect(over.action.kind).toBe('game-over');
    expect(over.atMs).toBe(end(fly));
    expect(over.atMs).toBeGreaterThanOrEqual(full.atMs);
    expect(cues(items, 'game-over').map((p) => p.atMs)).toEqual([end(fly)]);
  });

  it('level-up waits for an in-flight tray fly', () => {
    const board = Array.from({ length: BOARD_SIZE }, (_, r) =>
      Array.from({ length: BOARD_SIZE }, (_, c) => gem(100 + r * BOARD_SIZE + c)));
    const { items } = planScript([...fillsTray, { t: 'level-up', level: 2, board }]);
    const fly = of(items, 'tray-fly')[0];
    const levelUp = of(items, 'notice').find((p) => p.action.kind === 'level-up')!;
    expect(levelUp.atMs).toBe(end(fly));
    expect(of(items, 'board-out')[0].atMs).toBe(end(fly));
  });

  it('a clear that creates a special lasts at least createMs, whatever the pop time', () => {
    const anim = ANIM as { createMs: number };
    const saved = anim.createMs;
    anim.createMs = POP_MS + 100;
    try {
      const charge: Piece = { id: 2, kind: 'gem', color: 'red', special: 'charge' };
      const step = clear([matched(1, 7, 0), matched(3, 7, 2)], { created: [{ at: at(7, 1), piece: charge }] });
      const { items } = planScript([step, refill]);
      const morph = of(items, 'morph')[0];
      for (const p of [...of(items, 'fall'), ...of(items, 'spawn')]) expect(p.atMs).toBe(end(morph));
    } finally {
      anim.createMs = saved;
    }
  });

  it('rejects a timeScale that is not a positive finite number', () => {
    for (const timeScale of [0, -1, NaN, Infinity]) {
      expect(() => planScript([swap], { timeScale })).toThrow(/timeScale/);
    }
  });

  it('an empty script plans nothing', () => {
    expect(planScript([])).toEqual({ items: [], totalMs: 0 });
  });

  // Ordering and causality that every real script must satisfy.
  function expectSound(script: Step[]): void {
    const { items, totalMs } = planScript(script);
    for (let i = 1; i < items.length; i++) expect(items[i].atMs).toBeGreaterThanOrEqual(items[i - 1].atMs);
    for (const p of items) {
      expect(Number.isFinite(p.atMs) && Number.isFinite(p.durMs)).toBe(true);
      expect(end(p)).toBeLessThanOrEqual(totalMs + 1e-9);
    }
    const pops = of(items, 'pop');
    expect(pops).toHaveLength(script.flatMap((s) => (s.t === 'clear' ? s.cleared : [])).length);
    const popOf = (id: number) => pops.find((p) => p.action.id === id)!;
    let lastPopEnd = 0;
    for (const s of script) {
      if (s.t === 'clear') {
        // A blasted cell never pops before the blast that claimed it fires, and a chained
        // blast never fires before its own piece (struck by its parent) pops.
        const clearedAt = (p: Pos) => s.cleared.find((x) => x.at.row === p.row && x.at.col === p.col);
        for (const b of s.blasts) {
          const fired = of(items, 'blast').find((p) => p.action.blast === b)!.atMs;
          const seed = clearedAt(b.at);
          if (b.order > 0 && seed) expect(fired).toBeGreaterThanOrEqual(popOf(seed.id).atMs);
          for (const cell of b.cells) {
            expect(popOf(clearedAt(cell)!.id).atMs).toBeGreaterThanOrEqual(fired);
          }
        }
        lastPopEnd = Math.max(...s.cleared.map((c) => end(popOf(c.id))));
      }
      if (s.t === 'fall' && s.spawns.length > 0) {
        // The round's falls start together (tested above); its first spawn gives that instant.
        const fallStart = of(items, 'spawn').find((p) => p.action.piece.id === s.spawns[0].piece.id)!.atMs;
        expect(fallStart).toBeGreaterThanOrEqual(lastPopEnd);
      }
    }
  }

  it('plans a real engine script in time order', () => {
    let state = newGame(7);
    for (let n = 0; n < 5; n++) {
      const result = applyMove(state, productiveMoves(state)[0]);
      expectSound(result.script);
      state = result.state;
    }
  });

  it('plans real special swaps causally', () => {
    const swaps: Record<string, string>[] = [
      { '0,0': 'P', '0,1': 'Rc' }, // prism + charge: converted charges
      { '0,0': 'P', '0,1': 'R', '6,6': 'Rc' }, // prism bolt chains into a charge
      { '0,0': 'P', '0,1': 'P', '5,5': 'Bc', '6,2': 'Ga' }, // supernova chains into specials
    ];
    for (const cells of swaps) {
      const { script } = applyMove(makeState(boardWith(cells)), { type: 'swap', a: at(0, 0), b: at(0, 1) });
      expect(script.some((s) => s.t === 'clear' && s.blasts.length > 0)).toBe(true);
      expectSound(script);
    }
  });
});
