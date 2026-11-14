import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { TRAY_THRESHOLD, applyMove, newGame, productiveMoves } from '../engine';
import type { Color, GameState, Move, Step } from '../engine';
import type { CueName } from '../audio/cues';
import { createAIClient } from '../ai/client';
import { GameController } from '../app/controller';
import { fixture } from '../app/devFixtures';
import { noopEffects, type Effects } from '../app/ports';
import { BoardView } from './BoardView';
import type { PieceSprite } from './PieceSprite';
import { ANIM } from './constants';
import { computeLayout } from './layout';
import { planScript, type Action, type Planned } from './plan';
import { ScriptPlayer } from './player';
import type { PieceTextures } from './textures';
import { TrayView } from './TrayView';

const FRAME_MS = 1000 / 60;
const tex: PieceTextures = {
  cellPx: 60, piece: () => Texture.EMPTY, halo: () => Texture.EMPTY, selectRing: Texture.EMPTY, destroy() {},
};

// GSAP is stepped by hand here, one 60 fps frame at a time, exactly as the app's Pixi ticker does.
let now = 0;
beforeAll(() => {
  gsap.ticker.remove(gsap.updateRoot);
  now = gsap.globalTimeline.time();
});
afterAll(() => gsap.ticker.add(gsap.updateRoot));
const frame = () => {
  now += FRAME_MS / 1000;
  gsap.updateRoot(now);
};

interface Sample { y: number; sx: number; sy: number }
type Frame = Map<number, Sample>;

function rig(opts: { effects?: Effects; reducedMotion?: boolean } = {}) {
  const board = new BoardView(tex, true);
  const tray = new TrayView(tex, true);
  const layout = computeLayout(600, 700);
  board.setLayout(layout, tex);
  tray.setLayout(layout, tex);
  const actions: { frame: number; action: Action }[] = [];
  const cues: CueName[] = [];
  /** Each cue with the 1-based frame whose update fired it. */
  const cueLog: { frame: number; name: CueName; chain?: number }[] = [];
  let frames = 0;
  const player = new ScriptPlayer({
    board, tray, effects: opts.effects ?? noopEffects, reducedMotion: opts.reducedMotion ?? false,
    audio: {
      cue: (name, opts) => {
        cues.push(name);
        cueLog.push(opts?.chain === undefined ? { frame: frames + 1, name } : { frame: frames + 1, name, chain: opts.chain });
      },
    },
    onAction: (action) => actions.push({ frame: frames, action }),
  });
  const snap = (): Frame => new Map(board.allSprites().map((s) => [s.id, { y: s.y, sx: s.scale.x, sy: s.scale.y }]));
  /** Plays to completion, sampling every frame; returns the samples (index 0 = before the first frame). */
  async function run(p: Promise<void>): Promise<Frame[]> {
    let done = false;
    void p.then(() => { done = true; });
    const out = [snap()];
    for (frames = 0; !done && frames < 1000; ) {
      frame();
      frames++;
      out.push(snap());
      await Promise.resolve();
    }
    expect(done).toBe(true);
    return out;
  }
  return { board, tray, player, actions, cues, cueLog, run, layout };
}

async function deal(r: ReturnType<typeof rig>, state: GameState) {
  await r.run(r.player.show({ board: state.board, tray: state.tray }));
}

/** A real move whose first cascade refills several columns and triggers at least one more round. */
function cascadeMove(): { state: GameState; move: Move; script: Step[]; next: GameState } {
  for (let seed = 1; seed < 500; seed++) {
    const state = newGame(seed);
    for (const move of productiveMoves(state)) {
      const { script, state: next } = applyMove(state, move);
      const falls = script.filter((s): s is Extract<Step, { t: 'fall' }> => s.t === 'fall');
      if (falls.length >= 2 && new Set(falls[0].spawns.map((s) => s.to.col)).size >= 3
        && falls[0].spawns.some((s) => s.fromRow <= -2)) return { state, move, script, next };
    }
  }
  throw new Error('no cascade fixture');
}

describe('ScriptPlayer', () => {
  let r: ReturnType<typeof rig>;
  beforeEach(() => { r = rig(); });

  it('show drops a fresh board in from above as one block, then snaps it to rest', async () => {
    const state = newGame(3);
    const frames = await r.run(r.player.show({ board: state.board, tray: state.tray }));
    const first = frames.find((f) => f.size > 0)!;
    // The first rendered frame has every piece a full board above its cell.
    for (const [id, s] of first) {
      const cell = state.board.flat().findIndex((p) => p?.id === id);
      const rest = r.board.cellXY(Math.floor(cell / 8), cell % 8).y;
      expect(rest - s.y).toBeGreaterThan(7.9 * r.board.cellPx);
    }
    for (const s of r.board.allSprites()) expect(s.scale.x).toBe(1);
    expect(r.board.allSprites()).toHaveLength(64);
  });

  it('every fall and refill in a round starts on the same frame, falls monotonically and lands squarely', async () => {
    const { state, move, script, next } = cascadeMove();
    await deal(r, state);
    const fall = script.find((s): s is Extract<Step, { t: 'fall' }> => s.t === 'fall')!;
    const cellY = (row: number, col: number) => r.board.cellXY(row, col).y;
    const frames = await r.run(r.player.play(applyMove(state, move).script, next));
    const cell = r.board.cellPx;

    const movers = [
      ...fall.falls.map((f) => ({ id: f.id, col: f.to.col, fromRow: f.from.row, toRow: f.to.row, spawn: false })),
      ...fall.spawns.map((s) => ({ id: s.piece.id, col: s.to.col, fromRow: s.fromRow, toRow: s.to.row, spawn: true })),
    ];
    const starts = new Set<number>();
    for (const m of movers) {
      const from = cellY(m.fromRow, m.col);
      const to = cellY(m.toRow, m.col);
      // Start frame: the first frame the piece is off its starting cell (or exists at all, for a refill).
      const start = frames.findIndex((f) => {
        const s = f.get(m.id);
        return s !== undefined && (m.spawn || s.y > from + 1e-6);
      });
      expect(start).toBeGreaterThan(0);
      starts.add(start);
      // Before it starts, a falling piece sits on its starting cell, never at its destination.
      for (const f of frames.slice(0, start)) {
        const s = f.get(m.id);
        if (m.spawn) expect(s).toBeUndefined();
        else expect(s!.y).toBeCloseTo(from, 6);
      }
      // A refill appears above the top edge: still within a hair of its spawn cell.
      if (m.spawn) {
        expect(frames[start].get(m.id)!.y).toBeLessThan(cellY(m.fromRow + 0.05, m.col));
        expect(frames[start].get(m.id)!.y).toBeLessThan(r.layout.board.y);
      }
      // Monotonic, accelerating fall to the destination, then a squash and a small rebound.
      let prev = -Infinity;
      let prevStep = 0;
      let landed = -1;
      for (let i = start; i < frames.length; i++) {
        const y = frames[i].get(m.id)!.y;
        if (y >= to - 1e-6) { landed = i; break; }
        expect(y).toBeGreaterThanOrEqual(prev);
        if (prev > -Infinity) expect(y - prev).toBeGreaterThanOrEqual(prevStep - 1e-6);
        if (prev > -Infinity) prevStep = y - prev;
        prev = y;
      }
      expect(landed).toBeGreaterThan(start);
      const after = frames.slice(landed, landed + Math.ceil(ANIM.landMs / FRAME_MS) + 2).map((f) => f.get(m.id)!);
      expect(Math.min(...after.map((s) => s.sy))).toBeLessThan(0.95);
      expect(Math.max(...after.map((s) => s.sx))).toBeGreaterThan(1.03);
      expect(Math.min(...after.map((s) => s.y))).toBeLessThan(to - 0.05 * cell);
      expect(Math.min(...after.map((s) => s.y))).toBeGreaterThan(to - (ANIM.landReboundCells + 0.01) * cell);
    }
    expect(starts.size).toBe(1);

    // Refills in one column enter exactly one cell apart, as if the column continued upward.
    const start = [...starts][0];
    const byCol = new Map<number, number[]>();
    for (const s of fall.spawns) byCol.set(s.to.col, [...(byCol.get(s.to.col) ?? []), frames[start].get(s.piece.id)!.y]);
    for (const ys of byCol.values()) {
      ys.sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeCloseTo(cell, 6);
    }

    // No two pieces in a column ever overlap by more than the rebound.
    for (const f of frames) {
      const cols = new Map<number, number[]>();
      for (const [id, s] of f) {
        const x = Math.round(r.board.sprite(id)?.x ?? NaN);
        if (Number.isNaN(x) || s.sx < 0.5) continue; // popping pieces shrink away in place
        cols.set(x, [...(cols.get(x) ?? []), s.y]);
      }
      for (const ys of cols.values()) {
        ys.sort((a, b) => a - b);
        for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThan((1 - 2 * ANIM.landReboundCells) * cell);
      }
    }

    // At rest on the engine's board afterwards.
    next.board.forEach((row, ri) => row.forEach((p, ci) => {
      const s = r.board.sprite(p!.id)!;
      expect(s.y).toBe(cellY(ri, ci));
      expect(s.scale.x).toBe(1);
    }));
    expect(r.board.allSprites()).toHaveLength(64);
  });

  it('popped sprites are released once their pop ends; nothing blinks out before', async () => {
    const { state, move, next } = cascadeMove();
    await deal(r, state);
    const { script } = applyMove(state, move);
    const cleared = script.flatMap((s) => (s.t === 'clear' ? s.cleared.map((c) => c.id) : []));
    const frames = await r.run(r.player.play(script, next));
    for (let i = 1; i < frames.length; i++) {
      for (const [id, s] of frames[i - 1]) {
        if (frames[i].has(id)) continue;
        expect(cleared).toContain(id);
        expect(s.sx).toBeLessThan(0.3 * ANIM.popScale); // one frame from the end of its collapse
      }
    }
  });

  it('forwards score, notice and tray actions and plays cues', async () => {
    const { state, move, next } = cascadeMove();
    await deal(r, state);
    const { script } = applyMove(state, move);
    await r.run(r.player.play([...script, { t: 'game-over' }], next));
    const scores = r.actions.filter((a) => a.action.a === 'score');
    expect(scores.map((a) => (a.action as Extract<Action, { a: 'score' }>).total))
      .toEqual(script.flatMap((s) => (s.t === 'score' ? [s.total] : [])));
    // The first score lands with the first pops, after the swap; later rounds come later.
    expect(scores[0].frame).toBeGreaterThanOrEqual(Math.floor(ANIM.swapMs / FRAME_MS));
    for (let i = 1; i < scores.length; i++) expect(scores[i].frame).toBeGreaterThan(scores[i - 1].frame);
    expect(r.actions.at(-1)!.action).toEqual({ a: 'notice', kind: 'game-over' });
    expect(r.cues).toContain('swap');
    expect(r.cues).toContain('match');
    expect(r.cues.at(-1)).toBe('game-over');
  });

  it('forwards a tray flight when it lands, with the tray-full notice, not when it starts', async () => {
    // Four pieces in the tray and every counter one short: the first match fills the tray.
    const base = newGame(3);
    const counters = Object.fromEntries(Object.keys(base.counters).map((k) => [k, TRAY_THRESHOLD - 1])) as GameState['counters'];
    const state: GameState = { ...base, tray: ['red', 'blue', 'green', 'yellow'], counters };
    await deal(r, state);
    const { script, state: next } = applyMove(state, productiveMoves(state)[0]);
    expect(script.some((s) => s.t === 'tray-full')).toBe(true);
    const fly = planScript(script).items.find((p) => p.action.a === 'tray-fly')!;
    r.actions.length = 0;
    await r.run(r.player.play(script, next));
    const flown = r.actions.find((a) => a.action.a === 'tray-fly')!;
    const full = r.actions.find((a) => a.action.a === 'notice' && a.action.kind === 'tray-full')!;
    expect(fly.durMs).toBeGreaterThan(0);
    // `frame` counts the frames completed before the call, so it fired during frame + 1.
    expect((flown.frame + 1) * FRAME_MS).toBeGreaterThanOrEqual(fly.atMs + fly.durMs - 1e-6);
    expect(flown.frame).toBe(full.frame);
  });

  it('forwards cue actions to the sink at their timeline time', async () => {
    const { state, move, next } = cascadeMove();
    await deal(r, state);
    r.cueLog.length = 0;
    const { script } = applyMove(state, move);
    const planned = planScript(script).items.filter((p): p is Planned & { action: Extract<Action, { a: 'cue' }> } => p.action.a === 'cue');
    expect(planned.length).toBeGreaterThan(3);
    expect(planned.some((p) => (p.action.chain ?? 0) > 0)).toBe(true); // a cascade carries its chain level
    await r.run(r.player.play(script, next));
    expect(r.cueLog.map(({ name, chain }) => ({ name, chain }))).toEqual(planned.map((p) => ({ name: p.action.name, chain: p.action.chain })));
    // Each fires on the first frame at or after its planned instant, never earlier.
    r.cueLog.forEach((c, i) => {
      const atMs = planned[i].atMs;
      expect(c.frame * FRAME_MS).toBeGreaterThanOrEqual(atMs - 1e-6);
      expect((c.frame - 1) * FRAME_MS).toBeLessThan(atMs + 1e-6);
    });
  });

  /** Plays an invalid swap of (0,0)-(0,1), returning the x of both sprites on every frame. */
  async function invalidSwap(rr: ReturnType<typeof rig>) {
    const state = newGame(5);
    await deal(rr, state);
    const a = { row: 0, col: 0 };
    const b = { row: 0, col: 1 };
    const ids: [number, number] = [state.board[0][0]!.id, state.board[0][1]!.id];
    const s0 = rr.board.sprite(ids[0])!;
    const s1 = rr.board.sprite(ids[1])!;
    const rest = [s0.x, s1.x];
    const xs: [number, number][] = [];
    const p = rr.player.play([{ t: 'swap-invalid', a, b, ids }], state);
    let done = false;
    void p.then(() => { done = true; });
    for (let i = 0; i < 100 && !done; i++) {
      frame();
      xs.push([s0.x, s1.x]);
      await Promise.resolve();
    }
    expect(done).toBe(true);
    return { xs, rest, end: [s0.x, s1.x], cellX1: rr.board.cellXY(0, 1).x, cellPx: rr.board.cellPx };
  }

  it('an invalid swap goes out, comes back, and shakes both pieces on return', async () => {
    const { xs, rest, end, cellX1, cellPx } = await invalidSwap(r);
    expect(Math.max(...xs.map((x) => x[0]))).toBeCloseTo(cellX1, 0);
    expect(end).toEqual(rest);
    // After the back leg (no earlier), each piece swings both sides of its cell, within the amplitude.
    const backFrame = Math.ceil((2 * ANIM.invalidMs) / FRAME_MS);
    const amp = ANIM.invalidShake.cells * cellPx;
    for (const k of [0, 1]) {
      const after = xs.slice(backFrame).map((x) => x[k] - rest[k]);
      expect(Math.min(...after)).toBeLessThan(-amp / 4);
      expect(Math.max(...after)).toBeGreaterThan(amp / 4);
      for (const d of after) expect(Math.abs(d)).toBeLessThanOrEqual(amp + 1e-6);
    }
    // The shake fits in its own budget after the two legs.
    expect(xs.length).toBeLessThanOrEqual(Math.ceil((2 * ANIM.invalidMs + ANIM.invalidShake.ms) / FRAME_MS) + 2);
  });

  it('reduced motion drops the invalid-swap shake', async () => {
    const rr = rig({ reducedMotion: true });
    const { xs, rest, end } = await invalidSwap(rr);
    expect(end).toEqual(rest);
    expect(Math.min(...xs.map((x) => x[0]))).toBeGreaterThanOrEqual(rest[0] - 1e-6);
    expect(xs.length).toBeLessThanOrEqual(Math.ceil((2 * ANIM.invalidMs) / ANIM.reducedMotionTimeScale / FRAME_MS) + 2);
  });

  /** Effects that record every call; blast promises never resolve, so a play awaiting one would hang. */
  function recordingEffects() {
    const calls = {
      pops: [] as { at: { x: number; y: number }; color: number }[],
      blasts: [] as string[],
      shakes: [] as [number, number][],
      morphs: [] as PieceSprite[],
    };
    const effects: Effects = {
      pop: (at, color) => calls.pops.push({ at, color }),
      blast: (b) => { calls.blasts.push(b.kind); return new Promise(() => {}); },
      shake: (px, ms) => calls.shakes.push([px, ms]),
      morph: (s) => calls.morphs.push(s),
    };
    return { effects, calls };
  }

  it('fires pops, blasts and shakes from the timeline without waiting on them', async () => {
    for (const name of ['charge', 'supernova'] as const) {
      const { effects, calls } = recordingEffects();
      const rr = rig({ effects });
      const { state, move } = fixture(name);
      await deal(rr, state);
      const { script, state: next } = applyMove(state, move);
      await rr.run(rr.player.play(script, next));
      const clears = script.filter((s): s is Extract<Step, { t: 'clear' }> => s.t === 'clear');
      expect(calls.pops).toHaveLength(clears.reduce((n, c) => n + c.cleared.length, 0));
      expect(calls.blasts).toEqual(clears.flatMap((c) => c.blasts.map((b) => b.kind)));
      const first = clears[0];
      if (name === 'charge') {
        expect(calls.shakes).toEqual(first.blasts.map(() => [ANIM.chargeShake.px, ANIM.chargeShake.ms]));
        // Each spark burst is at its cell, in its piece's color.
        const c0 = first.cleared[0];
        const xy = rr.board.cellXY(c0.at.row, c0.at.col);
        expect(calls.pops.some((p) => p.at.x === xy.x && p.at.y === xy.y)).toBe(true);
      } else {
        expect(calls.shakes).toContainEqual([ANIM.supernovaShake.px, ANIM.supernovaShake.ms]);
      }
    }
  });

  it('reduced motion never asks for a screen shake', async () => {
    const { effects, calls } = recordingEffects();
    const rr = rig({ effects, reducedMotion: true });
    const { state, move } = fixture('charge');
    await deal(rr, state);
    const { script, state: next } = applyMove(state, move);
    await rr.run(rr.player.play(script, next));
    expect(calls.blasts.length).toBeGreaterThan(0);
    expect(calls.shakes).toEqual([]);
  });

  it('a new special flares through effects.morph', async () => {
    const { effects, calls } = recordingEffects();
    const rr = rig({ effects });
    for (let seed = 1; seed < 300; seed++) {
      const state = newGame(seed);
      const move = productiveMoves(state).find((m) => applyMove(state, m).script.some((s) => s.t === 'clear' && s.created.length > 0));
      if (!move) continue;
      await deal(rr, state);
      const { script, state: next } = applyMove(state, move);
      await rr.run(rr.player.play(script, next));
      const created = script.flatMap((s) => (s.t === 'clear' ? s.created.map((c) => c.piece.id) : []));
      expect(calls.morphs.map((s) => s.id)).toEqual(created);
      return;
    }
    throw new Error('no fixture creates a special');
  });

  it('a tray placement swaps the piece in and empties the slot', async () => {
    const state = newGame(9);
    const target = state.board[4][4]!;
    if (target.kind !== 'gem') throw new Error('fixture');
    const color: Color = target.color === 'red' ? 'blue' : 'red';
    const withTray: GameState = { ...state, tray: [color] };
    await deal(r, withTray);
    const move: Move = { type: 'place', slot: 0, at: { row: 4, col: 4 } };
    const { script, state: next } = applyMove(withTray, move);
    await r.run(r.player.play(script, next));
    expect(r.board.sprite(target.id)).toBeUndefined();
    const placed = script[0] as Extract<Step, { t: 'place' }>;
    expect(next.board.flat().some((p) => p?.id === placed.piece.id) || script.some((s) => s.t === 'clear')).toBe(true);
    expect(r.board.allSprites()).toHaveLength(64);
  });

  /** True once `p` has settled, checked after letting pending microtasks and timers run. */
  async function settled(p: Promise<unknown>): Promise<boolean> {
    let done = false;
    void p.then(() => { done = true; }, () => { done = true; });
    await new Promise((res) => setTimeout(res, 0));
    return done;
  }

  it('dispose mid-play resolves the play, so nothing waits on it forever', async () => {
    const { state, move, next } = cascadeMove();
    await deal(r, state);
    const p = r.player.play(applyMove(state, move).script, next);
    frame();
    expect(await settled(p)).toBe(false);
    r.player.dispose();
    expect(await settled(p)).toBe(true);
  });

  it('a new run replacing a playing timeline resolves the old play and starts from its end', async () => {
    const { state, move, next } = cascadeMove();
    await deal(r, state);
    const p = r.player.play(applyMove(state, move).script, next);
    frame();
    const fresh = newGame(77);
    const dealt = r.run(r.player.show({ board: fresh.board, tray: fresh.tray }));
    expect(await settled(p)).toBe(true);
    await dealt;
    fresh.board.forEach((row, ri) => row.forEach((piece, ci) => {
      expect(r.board.sprite(piece!.id)!.y).toBe(r.board.cellXY(ri, ci).y);
    }));
    expect(r.board.allSprites()).toHaveLength(64);
  });

  it('relayout after dispose touches nothing', async () => {
    await deal(r, newGame(4));
    r.player.dispose();
    const snap = vi.spyOn(r.board, 'snapToModel');
    r.player.relayout();
    expect(snap).not.toHaveBeenCalled();
  });

  it('new game after disposing mid-move does not hang', async () => {
    const { state, move } = cascadeMove();
    const c = new GameController({
      player: r.player, ai: createAIClient({ inline: true }), hint: { show: async () => {}, clear() {} },
      prefs: { load: () => ({ bestPlayer: 0, bestAI: 0, aiSpeed: 'medium', muted: false }), save() {} },
      onChange() {}, initial: state,
    });
    await r.run(c.start());
    const moving = c.submit(move);
    frame();
    c.dispose();
    r.player.dispose();
    expect(await settled(moving)).toBe(true);
    expect(await settled(c.newGame())).toBe(true);
  });

  it('an empty script resolves at once', async () => {
    const state = newGame(2);
    await deal(r, state);
    await r.player.play([], state);
    expect(r.board.allSprites()).toHaveLength(64);
  });
});
