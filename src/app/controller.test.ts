import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyMove, newGame, productiveMoves } from '../engine';
import type { GameState, Move, Pos, Step } from '../engine';
import { boardWith, makeState } from '../engine/testing';
import { createAIClient } from '../ai/client';
import type { Action } from '../render/plan';
import type { ScriptPlayerLike, ShownState } from '../render/player';
import { GameController, type UiSnapshot } from './controller';
import type { Prefs, PrefsStore } from './ports';

const SEED = 42;

/** Records every script and holds each play until the test releases it. */
class FakePlayer implements ScriptPlayerLike {
  scripts: Step[][] = [];
  ends: ShownState[] = [];
  shows: ShownState[] = [];
  relayouts = 0;
  private pending: (() => void)[] = [];
  /** Set by the controller test rig: lets a test emit planned actions mid-play. */
  emit: (a: Action) => void = () => {};

  play(script: Step[], end: ShownState): Promise<void> {
    this.scripts.push(script);
    this.ends.push(end);
    return new Promise((resolve) => this.pending.push(resolve));
  }
  /** When set, deals are held like plays until `finish()`. */
  holdShows = false;
  show(state: ShownState): Promise<void> {
    this.shows.push(state);
    if (!this.holdShows) return Promise.resolve();
    return new Promise((resolve) => this.pending.push(resolve));
  }
  relayout(): void {
    this.relayouts++;
  }
  get playing(): number {
    return this.pending.length;
  }
  /** Finishes the oldest play, then lets the controller's continuation run. */
  async finish(): Promise<void> {
    this.pending.shift()?.();
    await flush();
  }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function memoryPrefs(initial: Partial<Prefs> = {}): PrefsStore & { saved: Prefs[] } {
  let prefs: Prefs = { bestPlayer: 0, bestAI: 0, aiSpeed: 'medium', muted: false, volume: 0.8, ...initial };
  const saved: Prefs[] = [];
  return { saved, load: () => ({ ...prefs }), save: (p) => { prefs = { ...p }; saved.push({ ...p }); } };
}

function rig(opts: { initial?: GameState; prefs?: ReturnType<typeof memoryPrefs> } = {}) {
  const player = new FakePlayer();
  const prefs = opts.prefs ?? memoryPrefs();
  const snapshots: UiSnapshot[] = [];
  const errors: unknown[] = [];
  const c = new GameController({
    player, prefs, seed: SEED, initial: opts.initial,
    ai: createAIClient({ inline: true }),
    hint: { show: async () => {}, clear: () => {} },
    onChange: (s) => snapshots.push(s),
    reportError: (err) => errors.push(err),
  });
  player.emit = (a) => c.onAction(a);
  return { c, player, prefs, snapshots, errors };
}

const swapOf = (m: Move) => {
  if (m.type !== 'swap') throw new Error('expected a swap');
  return m;
};
const firstSwap = (s: GameState) => swapOf(productiveMoves(s).find((m) => m.type === 'swap')!);

/** A swap of two adjacent cells that makes no match. */
function invalidSwap(s: GameState): { a: Pos; b: Pos } {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 7; col++) {
      const a = { row, col };
      const b = { row, col: col + 1 };
      if (applyMove(s, { type: 'swap', a, b }).script[0]?.t === 'swap-invalid') return { a, b };
    }
  }
  throw new Error('no invalid swap');
}

describe('GameController', () => {
  it('tap adjacent swaps and plays script', async () => {
    const { c, player } = rig();
    const before = c.state;
    const { a, b } = firstSwap(before);
    c.tapCell(a);
    expect(c.snapshot().selected).toEqual(a);
    c.tapCell(b);
    expect(c.snapshot().selected).toBeNull();
    expect(c.snapshot().busy).toBe(true);
    const expected = applyMove(before, { type: 'swap', a, b });
    expect(player.scripts).toEqual([expected.script]);
    expect(player.ends[0].board).toEqual(expected.state.board);
    await player.finish();
    expect(c.snapshot().busy).toBe(false);
    expect(c.state).toEqual(expected.state);
  });

  it('tap rules: same cell deselects, a far cell moves the selection', () => {
    const { c, player } = rig();
    c.tapCell({ row: 0, col: 0 });
    c.tapCell({ row: 0, col: 0 });
    expect(c.snapshot().selected).toBeNull();
    c.tapCell({ row: 0, col: 0 });
    c.tapCell({ row: 5, col: 5 });
    expect(c.snapshot().selected).toEqual({ row: 5, col: 5 });
    expect(player.scripts).toHaveLength(0);
  });

  it('controller ignores submit while busy', async () => {
    const { c, player } = rig();
    const start = c.state;
    const first = firstSwap(start);
    const p1 = c.submit(first);
    const afterFirst = c.state;
    const p2 = c.submit(firstSwap(afterFirst));
    c.tapCell({ row: 0, col: 0 });
    c.swap(first.a, first.b);
    expect(c.snapshot().selected).toBeNull();
    await p2;
    expect(player.scripts).toHaveLength(1);
    expect(c.state).toBe(afterFirst);
    expect(c.state.moves).toBe(start.moves + 1);
    await player.finish();
    await p1;
  });

  it('invalid swap does not count a move', async () => {
    const { c, player } = rig();
    const { a, b } = invalidSwap(c.state);
    c.swap(a, b);
    expect(player.scripts[0][0].t).toBe('swap-invalid');
    await player.finish();
    expect(c.state.moves).toBe(0);
    expect(c.snapshot().moves).toBe(0);
  });

  it('a swap of cells that are not neighbours is ignored', () => {
    const { c, player } = rig();
    c.swap({ row: 0, col: 0 }, { row: 2, col: 0 });
    expect(player.scripts).toHaveLength(0);
    expect(c.snapshot().busy).toBe(false);
  });

  it('score in snapshot follows score actions', async () => {
    const { c, player } = rig();
    void c.submit(firstSwap(c.state));
    const total = c.state.score;
    expect(total).toBeGreaterThan(0);
    expect(c.snapshot().score).toBe(0);
    player.emit({ a: 'score', total: 100, points: 100, chain: 0, combo: 1 });
    expect(c.snapshot().score).toBe(100);
    await player.finish();
    expect(c.snapshot().busy).toBe(false);
    expect(c.snapshot().score).toBe(total);
  });

  /** A fresh game with one tray piece that is (or is not) placeable on (3, 3). */
  function withTray(placeable: boolean): GameState {
    const base = newGame(SEED);
    const piece = base.board[3][3]!;
    if (piece.kind !== 'gem') throw new Error('fixture');
    const other = piece.color === 'red' ? 'blue' : 'red';
    return { ...base, tray: [placeable ? other : piece.color] };
  }

  it('tray slot then cell submits place', async () => {
    const { c, player } = rig({ initial: withTray(true) });
    const target = { row: 3, col: 3 };
    c.tapSlot(0);
    expect(c.snapshot().selectedSlot).toBe(0);
    c.tapCell(target);
    expect(player.scripts).toHaveLength(1);
    expect(player.scripts[0][0]).toMatchObject({ t: 'place', slot: 0, at: target });
    expect(c.snapshot().selectedSlot).toBeNull();
    expect(c.snapshot().tray).toEqual([]);
    await player.finish();
    expect(c.state.moves).toBe(1);
  });

  it('a slot then a cell it can’t take clears the slot selection', () => {
    const { c, player } = rig({ initial: withTray(false) });
    c.tapSlot(0);
    c.tapCell({ row: 3, col: 3 });
    expect(player.scripts).toHaveLength(0);
    expect(c.snapshot().selectedSlot).toBeNull();
    expect(c.snapshot().selected).toBeNull();
  });

  it('new game waits for current move', async () => {
    const { c, player } = rig();
    void c.submit(firstSwap(c.state));
    let resolved = false;
    const ng = c.newGame().then(() => { resolved = true; });
    await flush();
    expect(resolved).toBe(false);
    expect(player.shows).toHaveLength(0);
    await player.finish();
    await ng;
    expect(resolved).toBe(true);
    expect(player.shows).toHaveLength(1);
    expect(c.state.score).toBe(0);
    expect(c.state.moves).toBe(0);
    expect(c.snapshot()).toMatchObject({ score: 0, moves: 0, busy: false, over: false, notice: null });
    expect(player.shows[0].board).toEqual(c.state.board);
  });

  it('a play that throws synchronously never wedges new game', async () => {
    const { c, player } = rig();
    player.play = () => { throw new Error('boom'); };
    await expect(c.submit(firstSwap(c.state))).rejects.toThrow('boom');
    expect(c.snapshot().busy).toBe(false);
    expect(c.snapshot().score).toBe(c.state.score); // shows the engine state it committed
    await c.newGame();
    expect(player.shows).toHaveLength(1);
    expect(c.snapshot()).toMatchObject({ busy: false, score: 0, moves: 0 });
  });

  it('a deal that throws synchronously never wedges the next new game', async () => {
    const { c, player } = rig();
    const show = player.show.bind(player);
    player.show = () => { throw new Error('boom'); };
    await expect(c.newGame()).rejects.toThrow('boom');
    expect(c.snapshot().busy).toBe(false);
    player.show = show;
    await c.newGame();
    expect(player.shows).toHaveLength(1);
    expect(c.snapshot().busy).toBe(false);
  });

  it('a prefs save that throws while a move finishes can’t wedge the controller', async () => {
    const prefs = memoryPrefs();
    prefs.save = () => { throw new Error('QuotaExceededError'); };
    const { c, player, errors } = rig({ prefs, initial: makeState(boardWith(), { tray: ['red'], score: 500 }) });
    const done = c.submit({ type: 'place', slot: 0, at: { row: 0, col: 5 } }); // ends the game: saves a best
    await player.finish();
    await done;
    expect(c.snapshot()).toMatchObject({ busy: false, over: true });
    expect(errors.map((e) => (e as Error).message)).toContain('QuotaExceededError');
    await c.newGame();
    expect(c.snapshot()).toMatchObject({ busy: false, over: false, score: 0 });
    expect(player.shows).toHaveLength(1);
  });

  it('a deferred relayout that throws can’t wedge the controller', async () => {
    const { c, player, errors } = rig();
    player.relayout = () => { throw new Error('relayout failed'); };
    const done = c.submit(firstSwap(c.state));
    c.relayout();
    await player.finish();
    await done;
    expect(c.snapshot().busy).toBe(false);
    expect(errors.map((e) => (e as Error).message)).toEqual(['relayout failed']);
    await c.newGame();
    expect(player.shows).toHaveLength(1);
    expect(c.snapshot().busy).toBe(false);
  });

  it('no deferred relayout after dispose', async () => {
    const { c, player } = rig();
    void c.submit(firstSwap(c.state));
    c.relayout();
    c.dispose();
    await player.finish();
    expect(player.relayouts).toBe(0);
  });

  it('start twice deals once, and nothing overlaps it', async () => {
    const { c, player } = rig();
    player.holdShows = true;
    const first = c.start();
    const second = c.start();
    expect(player.shows).toHaveLength(1);
    expect(c.snapshot().busy).toBe(true);
    c.swap(firstSwap(c.state).a, firstSwap(c.state).b);
    expect(player.scripts).toHaveLength(0);
    await second;
    await player.finish();
    await first;
    expect(c.snapshot().busy).toBe(false);
    expect(player.shows).toHaveLength(1);
  });

  it('resize during play re-lays out after timeline', async () => {
    const { c, player } = rig();
    void c.submit(firstSwap(c.state));
    c.relayout();
    c.relayout();
    expect(player.relayouts).toBe(0);
    await player.finish();
    expect(player.relayouts).toBe(1);
    c.relayout();
    expect(player.relayouts).toBe(2);
  });

  it('best player score saved on game over', async () => {
    const prefs = memoryPrefs({ bestPlayer: 10 });
    // A dead board with one tray piece: any placement is a dud, and then no move is left.
    const { c, player } = rig({ prefs, initial: makeState(boardWith(), { tray: ['red'], score: 500 }) });
    c.tapSlot(0);
    c.tapCell({ row: 0, col: 5 });
    expect(player.scripts[0].map((s) => s.t)).toEqual(['place', 'game-over']);
    expect(prefs.load().bestPlayer).toBe(10); // not before the game-over plays
    await player.finish();
    expect(c.state.over).toBe(true);
    expect(c.snapshot()).toMatchObject({ over: true, busy: false, notice: { kind: 'game-over' } });
    expect(prefs.load().bestPlayer).toBe(500);
    expect(c.snapshot().best).toEqual({ player: 500, ai: 0 });
    expect(prefs.load().bestAI).toBe(0);
    c.tapCell({ row: 0, col: 0 });
    expect(player.scripts).toHaveLength(1); // a finished game takes no input
  });

  it('a lower score leaves the best alone', async () => {
    const prefs = memoryPrefs({ bestPlayer: 900 });
    const { c, player } = rig({ prefs, initial: makeState(boardWith(), { tray: ['red'], score: 500 }) });
    void c.submit({ type: 'place', slot: 0, at: { row: 0, col: 5 } });
    await player.finish();
    expect(prefs.load().bestPlayer).toBe(900);
    expect(prefs.saved).toHaveLength(0);
  });

  it('newBest is set only for a strictly higher score, and clears on a new game', async () => {
    const tie = rig({ prefs: memoryPrefs({ bestPlayer: 500 }), initial: makeState(boardWith(), { tray: ['red'], score: 500 }) });
    void tie.c.submit({ type: 'place', slot: 0, at: { row: 0, col: 5 } });
    await tie.player.finish();
    expect(tie.c.snapshot()).toMatchObject({ over: true, newBest: false, overAI: false });

    const win = rig({ prefs: memoryPrefs({ bestPlayer: 499 }), initial: makeState(boardWith(), { tray: ['red'], score: 500 }) });
    void win.c.submit({ type: 'place', slot: 0, at: { row: 0, col: 5 } });
    await win.player.finish();
    expect(win.c.snapshot().newBest).toBe(true);
    await win.c.newGame(); // its own recordBest must not clear or repeat the flag mid-flight
    expect(win.c.snapshot().newBest).toBe(false);
  });

  it('the finished game keeps its kind when AI mode is toggled afterwards', async () => {
    const { c, player } = rig({ initial: makeState(boardWith(), { tray: ['red'], score: 500 }) });
    c.setAI(true);
    void c.submit({ type: 'place', slot: 0, at: { row: 0, col: 5 } });
    await player.finish();
    c.setAI(false);
    // AI mode merely being on or off doesn't change the finished game's kind (aiMoves does).
    expect(c.snapshot()).toMatchObject({ over: true, newBest: true, overAI: false });
    expect(c.snapshot().best).toEqual({ player: 500, ai: 0 });
  });

  describe('level-up notice', () => {
    afterEach(() => vi.useRealTimers());

    it('clears itself after 2 s, or on the next move', () => {
      vi.useFakeTimers();
      const { c, player } = rig();
      player.emit({ a: 'notice', kind: 'level-up', level: 2 });
      expect(c.snapshot().notice).toEqual({ kind: 'level-up', level: 2 });
      vi.advanceTimersByTime(1999);
      expect(c.snapshot().notice).not.toBeNull();
      vi.advanceTimersByTime(2);
      expect(c.snapshot().notice).toBeNull();

      player.emit({ a: 'notice', kind: 'level-up', level: 3 });
      void c.newGame();
      expect(c.snapshot().notice).toBeNull();
      vi.advanceTimersByTime(5000); // the old timer must not fire into the new game
      expect(c.snapshot().notice).toBeNull();
    });
  });

  it('input is ignored while AI mode is on', () => {
    const { c, player } = rig();
    c.setAI(true);
    const { a, b } = firstSwap(c.state);
    c.tapCell(a);
    c.tapCell(b);
    c.swap(a, b);
    expect(player.scripts).toHaveLength(0);
    expect(c.snapshot().aiOn).toBe(true);
  });

  it('AI speed is a saved preference', () => {
    const prefs = memoryPrefs();
    const { c } = rig({ prefs });
    c.setAISpeed('fast');
    expect(c.snapshot().aiSpeed).toBe('fast');
    expect(prefs.load().aiSpeed).toBe('fast');
  });

  it('notice, tray and level follow the planned actions', async () => {
    const { c, player } = rig();
    void c.submit(firstSwap(c.state));
    player.emit({ a: 'tray-fly', color: 'red', from: { row: 0, col: 0 }, slot: 0 });
    expect(c.snapshot().tray).toEqual(['red']);
    player.emit({ a: 'notice', kind: 'tray-full' });
    expect(c.snapshot().notice).toEqual({ kind: 'tray-full' });
    await player.finish();
    expect(c.snapshot().tray).toEqual(c.state.tray);
  });
});
