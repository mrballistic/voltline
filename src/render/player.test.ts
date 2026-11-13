import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { applyMove, newGame, productiveMoves } from '../engine';
import type { Color, GameState, Move, Step } from '../engine';
import type { CueName } from '../audio/cues';
import { noopEffects } from '../app/ports';
import { BoardView } from './BoardView';
import { ANIM } from './constants';
import { computeLayout } from './layout';
import type { Action } from './plan';
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

function rig() {
  const board = new BoardView(tex, true);
  const tray = new TrayView(tex, true);
  const layout = computeLayout(600, 700);
  board.setLayout(layout, tex);
  tray.setLayout(layout, tex);
  const actions: { frame: number; action: Action }[] = [];
  const cues: CueName[] = [];
  let frames = 0;
  const player = new ScriptPlayer({
    board, tray, effects: noopEffects, reducedMotion: false,
    audio: { cue: (name) => cues.push(name) },
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
  return { board, tray, player, actions, cues, run, layout };
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

  it('an invalid swap goes out and comes back', async () => {
    const state = newGame(5);
    await deal(r, state);
    const a = { row: 0, col: 0 };
    const b = { row: 0, col: 1 };
    const ids: [number, number] = [state.board[0][0]!.id, state.board[0][1]!.id];
    const s0 = r.board.sprite(ids[0])!;
    const x0 = s0.x;
    let maxX = x0;
    const p = r.player.play([{ t: 'swap-invalid', a, b, ids }], state);
    let done = false;
    void p.then(() => { done = true; });
    for (let i = 0; i < 100 && !done; i++) {
      frame();
      maxX = Math.max(maxX, s0.x);
      await Promise.resolve();
    }
    expect(done).toBe(true);
    expect(maxX).toBeCloseTo(r.board.cellXY(0, 1).x, 0);
    expect(s0.x).toBe(x0);
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

  it('an empty script resolves at once', async () => {
    const state = newGame(2);
    await deal(r, state);
    await r.player.play([], state);
    expect(r.board.allSprites()).toHaveLength(64);
  });
});
