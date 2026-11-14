import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Container, Texture, type Application } from 'pixi.js';
import { gsap } from 'gsap';
import { applyMove, canPlace, newGame } from '../engine';
import type { Color, GameState, Pos, Step } from '../engine';
import type { CueName } from '../audio/cues';
import { GameController, inputHandlers } from '../app/controller';
import { BoardView } from './BoardView';
import { ANIM } from './constants';
import { attachInput, dragOffset, gestureToMove, type InputHandlers } from './input';
import type { ScriptPlayerLike, ShownState } from './player';
import { computeLayout } from './layout';
import { PieceSprite } from './PieceSprite';
import type { PieceTextures } from './textures';
import { TrayView } from './TrayView';

const CELL = 60;
const start = { x: 100, y: 100 };
const at = (dx: number, dy: number) => ({ x: start.x + dx, y: start.y + dy });
const mid = { row: 3, col: 3 };

describe('gestureToMove', () => {
  it('right drag past threshold returns right neighbour', () => {
    expect(gestureToMove(start, at(0.31 * CELL, 0), CELL, mid)).toEqual({ row: 3, col: 4 });
  });
  it('short drag is tap (null)', () => {
    expect(gestureToMove(start, at(0.3 * CELL, 0), CELL, mid)).toBeNull();
    expect(gestureToMove(start, at(2, -3), CELL, mid)).toBeNull();
  });
  it('diagonal resolves to dominant axis', () => {
    expect(gestureToMove(start, at(0.4 * CELL, -0.7 * CELL), CELL, mid)).toEqual({ row: 2, col: 3 });
    expect(gestureToMove(start, at(-0.8 * CELL, 0.5 * CELL), CELL, mid)).toEqual({ row: 3, col: 2 });
  });
  it('drag off board edge returns null', () => {
    expect(gestureToMove(start, at(-CELL, 0), CELL, { row: 3, col: 0 })).toBeNull();
    expect(gestureToMove(start, at(0, CELL), CELL, { row: 7, col: 3 })).toBeNull();
  });
});

describe('dragOffset', () => {
  it('follows the dominant axis and caps at half a cell', () => {
    expect(dragOffset(start, at(10, 3), CELL, mid)).toEqual({ x: 10, y: 0 });
    expect(dragOffset(start, at(0, -200), CELL, mid)).toEqual({ x: 0, y: -0.5 * CELL });
  });
  it('does not move the piece toward a board edge', () => {
    expect(dragOffset(start, at(-20, 0), CELL, { row: 3, col: 0 })).toEqual({ x: 0, y: 0 });
  });
});

// attachInput against real board and tray views, a stand-in Pixi app and a hand-stepped GSAP,
// so whole gestures (down on the stage, move/up on the window) can be played frame by frame.
const FRAME_MS = 1000 / 60;
const tex: PieceTextures = {
  cellPx: 60, piece: () => Texture.EMPTY, halo: () => Texture.EMPTY, selectRing: Texture.EMPTY, destroy() {},
};
let now = 0;
beforeAll(() => {
  gsap.ticker.remove(gsap.updateRoot);
  now = gsap.globalTimeline.time();
});
afterAll(() => gsap.ticker.add(gsap.updateRoot));
afterEach(() => vi.unstubAllGlobals());

interface Calls { place: [number, Pos][]; tapSlot: number[] }

/** Real views and a stand-in app, with input attached to the handlers `wire` returns. */
function harness(trayColors: Color[], reducedMotion: boolean, wire: (tray: TrayView) => InputHandlers) {
  vi.stubGlobal('window', new EventTarget());
  const layout = computeLayout(600, 700);
  const board = new BoardView(tex, true);
  const tray = new TrayView(tex, true);
  board.setLayout(layout, tex);
  tray.setLayout(layout, tex);
  tray.setTray(trayColors);
  const stage = new Container();
  const canvas = Object.assign(new EventTarget(), {
    style: {} as Record<string, string>,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 700 }),
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
  });
  const ticks = new Set<() => void>();
  const app = {
    stage, canvas, screen: { x: 0, y: 0, width: 600, height: 700 },
    ticker: { add: (f: () => void) => ticks.add(f), remove: (f: () => void) => ticks.delete(f) },
  } as unknown as Application;
  const stop = attachInput(app, board, tray, wire(tray), { reducedMotion });

  const ev = (type: string, x: number, y: number) =>
    Object.assign(new Event(type), { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y });
  const down = (x: number, y: number) =>
    stage.emit('pointerdown', { ...ev('pointerdown', x, y), global: { x, y }, isPrimary: true, button: 0, pointerId: 1 } as never);
  const move = (x: number, y: number) => window.dispatchEvent(ev('pointermove', x, y));
  const up = (x: number, y: number) => window.dispatchEvent(ev('pointerup', x, y));
  const frame = () => {
    now += FRAME_MS / 1000;
    gsap.updateRoot(now);
    for (const f of ticks) f();
  };
  /** Pieces drawn on the tray root other than the five slot pieces: the flyers. */
  const flyers = () => tray.root.children.filter((c): c is PieceSprite => c instanceof PieceSprite && c.id === -1000 && !c.destroyed);
  /** A whole drag from slot `slot` to canvas point `to`, in `steps` moves. */
  const drag = (slot: number, to: { x: number; y: number }, steps = 6) => {
    const a = tray.slotXY(slot);
    down(a.x, a.y);
    for (let i = 1; i <= steps; i++) move(a.x + ((to.x - a.x) * i) / steps, a.y + ((to.y - a.y) * i) / steps);
    up(to.x, to.y);
  };
  return { board, tray, drag, down, move, up, frame, flyers, stop };
}

function rig(opts: { refuse?: (slot: number, at: Pos) => boolean; reducedMotion?: boolean } = {}) {
  const calls: Calls = { place: [], tapSlot: [] };
  let busy = false;
  const h = harness(['red', 'blue', 'yellow', 'green', 'magenta'], opts.reducedMotion ?? false, () => ({
    tapCell: () => {},
    tapSlot: (slot) => calls.tapSlot.push(slot),
    swap: () => {},
    place: (slot, at) => {
      calls.place.push([slot, at]);
      if (!opts.refuse?.(slot, at)) busy = true;
    },
    canAcceptInput: () => !busy,
    canHoldDrop: () => false,
    placeWhenIdle: () => Promise.resolve('cancelled'),
  }));
  return { ...h, calls };
}

describe('tray drag', () => {
  it('drops on the cell under the flyer’s center', () => {
    const r = rig();
    const c = r.board.cellXY(2, 5);
    const half = r.board.cellPx / 2;
    // Just inside the cell's bottom-right corner: the flyer's center is still on (2, 5).
    r.drag(0, { x: c.x + half - 1, y: c.y + half - 1 });
    expect(r.calls.place).toEqual([[0, { row: 2, col: 5 }]]);
  });

  it('a refused tray drop shakes then flies home', () => {
    const r = rig({ refuse: () => true });
    const c = r.board.cellXY(3, 3);
    r.drag(1, c);
    expect(r.calls.place).toEqual([[1, { row: 3, col: 3 }]]);
    const [f] = r.flyers();
    expect(f).toBeDefined();
    const { cells, ms } = ANIM.refuseShake;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let t = 0; t < ms && !f.destroyed; t += FRAME_MS) {
      r.frame();
      if (f.destroyed) break;
      xs.push(f.x);
      ys.push(f.y);
    }
    // Side to side about the drop point, within the shake's amplitude, without leaving the cell.
    const amp = cells * r.board.cellPx;
    expect(Math.max(...xs) - c.x).toBeGreaterThan(amp * 0.3);
    expect(c.x - Math.min(...xs)).toBeGreaterThan(amp * 0.3);
    expect(Math.max(...xs.map((x) => Math.abs(x - c.x)))).toBeLessThanOrEqual(amp + 1e-6);
    expect(ys.every((y) => Math.abs(y - c.y) < 1e-6)).toBe(true);
    // Then home to its slot, and gone.
    for (let i = 0; i < 60 && !f.destroyed; i++) r.frame();
    expect(f.destroyed).toBe(true);
  });

  it('a refused drop with reduced motion flies home without shaking', () => {
    const r = rig({ refuse: () => true, reducedMotion: true });
    const c = r.board.cellXY(3, 3);
    const home = r.tray.slotXY(1);
    r.drag(1, c);
    const [f] = r.flyers();
    r.frame();
    // Already on its way home on the first frame: moving toward the slot, never sideways past the cell.
    expect(f.y).toBeGreaterThan(c.y);
    expect(Math.abs(f.x - c.x)).toBeLessThanOrEqual(Math.abs(home.x - c.x));
  });

  it('the next tray drag after a refusal works', () => {
    let refuse = true;
    const r = rig({ refuse: () => refuse });
    r.drag(0, r.board.cellXY(0, 0));
    r.frame();
    refuse = false;
    // Mid-shake: the next drag is taken at once.
    r.drag(2, r.board.cellXY(4, 6));
    expect(r.calls.place).toEqual([[0, { row: 0, col: 0 }], [2, { row: 4, col: 6 }]]);
    expect(r.calls.tapSlot).toEqual([]);
  });

  it('an accepted drop leaves no flyer behind', () => {
    const r = rig();
    r.drag(0, r.board.cellXY(1, 1));
    expect(r.flyers()).toEqual([]);
  });
});

// The same gestures against a real GameController, wired as bootstrap wires it, with a player
// that holds each move until the test finishes it (and updates the tray as the move starts).
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

class HeldPlayer implements ScriptPlayerLike {
  scripts: Step[][] = [];
  private pending: (() => void)[] = [];
  constructor(private readonly tray: () => TrayView) {}
  play(script: Step[], end: ShownState): Promise<void> {
    this.scripts.push(script);
    this.tray().setTray(end.tray);
    return new Promise((resolve) => this.pending.push(resolve));
  }
  show(): Promise<void> { return Promise.resolve(); }
  relayout(): void {}
  async finish(): Promise<void> {
    this.pending.shift()?.();
    await flush();
  }
}

const cellsOf = (): Pos[] => Array.from({ length: 64 }, (_, i) => ({ row: Math.floor(i / 8), col: i % 8 }));
const plainColor = (s: GameState, at: Pos) => {
  const t = s.board[at.row][at.col];
  return t?.kind === 'gem' && t.special === 'none' ? t.color : null;
};

/**
 * A fresh board under a full tray led by two reds; `first` (slot 0 onto `first`) makes no match,
 * so that cell is red once it plays and the game goes on. `open` takes red before and after it;
 * `red` is a red cell, which red can never take.
 */
function heldFixture() {
  const base: GameState = { ...newGame(7), tray: ['red', 'red', 'blue', 'yellow', 'green'] };
  for (const first of cellsOf()) {
    if (!canPlace(base.board, base.tray, 0, first)) continue;
    const after = applyMove(base, { type: 'place', slot: 0, at: first }).state;
    if (after.over || plainColor(after, first) !== 'red' || after.tray[0] !== 'red') continue;
    const open = cellsOf().find((p) => canPlace(base.board, ['red'], 0, p) && canPlace(after.board, after.tray, 0, p))!;
    const red = cellsOf().find((p) => plainColor(base, p) === 'red')!;
    return { base, first, open, red };
  }
  throw new Error('no fixture');
}

function gameRig(opts: { reducedMotion?: boolean } = {}) {
  const f = heldFixture();
  const cues: CueName[] = [];
  let trayView: TrayView | null = null;
  const player = new HeldPlayer(() => trayView!);
  const c = new GameController({
    player,
    ai: { rank: () => new Promise(() => {}), dispose() {} },
    hint: { show: () => Promise.resolve(), clear() {} },
    prefs: { load: () => ({ bestPlayer: 0, bestAI: 0, aiSpeed: 'medium', muted: false, volume: 0.8 }), save() {} },
    audio: { cue: (name) => cues.push(name), setMuted() {}, setVolume() {} },
    initial: f.base,
    onChange: () => {},
    reportError: (err) => { throw err; },
  });
  const place = vi.spyOn(c, 'place');
  const h = harness(f.base.tray, opts.reducedMotion ?? false, (tray) => { trayView = tray; return inputHandlers(c); });
  /** Plays the first move (an accepted drop, made while idle): the board is busy until `finish`. */
  const startMove = () => {
    h.drag(0, h.board.cellXY(f.first.row, f.first.col));
    expect(c.snapshot().busy).toBe(true);
    place.mockClear();
  };
  /** Steps frames until the flyer is gone (or `max` frames), returning its x and y each frame. */
  const track = (fl: PieceSprite, max = 120) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < max && !fl.destroyed; i++) {
      h.frame();
      if (fl.destroyed) break;
      xs.push(fl.x);
      ys.push(fl.y);
    }
    return { xs, ys };
  };
  return { ...h, ...f, c, player, cues, place, startMove, track };
}

describe('tray drops against the controller', () => {
  for (const reducedMotion of [false, true]) {
    it(`a refused drop plays the refusal cue once${reducedMotion ? ', with reduced motion too' : ''}`, () => {
      const r = gameRig({ reducedMotion });
      r.drag(0, r.board.cellXY(r.red.row, r.red.col));
      expect(r.cues).toEqual(['swap-invalid']);
      const [f] = r.flyers();
      r.track(f);
      expect(f.destroyed).toBe(true);
      expect(r.cues).toEqual(['swap-invalid']);
    });
  }

  it('a drop made after the move has finished behaves as before', async () => {
    const r = gameRig();
    r.startMove();
    await r.player.finish();
    r.drag(0, r.board.cellXY(r.open.row, r.open.col));
    expect(r.place.mock.calls).toEqual([[0, r.open]]);
    expect(r.player.scripts).toHaveLength(2);
    expect(r.flyers()).toEqual([]);
  });

  it('a tray drop made while a move plays holds where it was let go, then places once at idle', async () => {
    const r = gameRig();
    r.startMove();
    const to = r.board.cellXY(r.open.row, r.open.col);
    r.drag(0, to);
    const [f] = r.flyers();
    expect(f).toBeDefined();
    for (let i = 0; i < 30; i++) r.frame();
    expect({ x: f.x, y: f.y, destroyed: f.destroyed }).toEqual({ x: to.x, y: to.y, destroyed: false });
    await flush();
    expect(r.place).not.toHaveBeenCalled();
    expect(r.player.scripts).toHaveLength(1);
    await r.player.finish();
    expect(r.place.mock.calls).toEqual([[0, r.open]]);
    expect(r.player.scripts).toHaveLength(2);
    expect(r.player.scripts[1][0]).toMatchObject({ t: 'place', slot: 0, at: r.open });
    expect(f.destroyed).toBe(true);
    expect(r.cues).toEqual([]);
  });

  it('a held drop the board can’t take by idle time is refused with the shake and the cue', async () => {
    const r = gameRig();
    r.startMove();
    const to = r.board.cellXY(r.first.row, r.first.col); // red once the first move has played
    r.drag(0, to);
    const [f] = r.flyers();
    await r.player.finish();
    expect(r.cues).toEqual(['swap-invalid']);
    expect(r.player.scripts).toHaveLength(1);
    const { xs } = r.track(f);
    const amp = ANIM.refuseShake.cells * r.board.cellPx;
    expect(Math.max(...xs) - to.x).toBeGreaterThan(amp * 0.3);
    expect(to.x - Math.min(...xs)).toBeGreaterThan(amp * 0.3);
    expect(f.destroyed).toBe(true);
    expect(r.cues).toEqual(['swap-invalid']);
  });

  const triggers: [string, (r: ReturnType<typeof gameRig>) => void][] = [
    ['a new game', (r) => { void r.c.newGame(); }],
    ['a level-up', (r) => r.c.onAction({ a: 'notice', kind: 'level-up', level: 2 })],
    ['AI mode turning on', (r) => r.c.setAI(true)],
  ];
  for (const [name, trigger] of triggers) {
    it(`a held drop is cancelled by ${name}: it flies home, with no sound`, async () => {
      const r = gameRig();
      r.startMove();
      const to = r.board.cellXY(r.open.row, r.open.col);
      r.drag(0, to);
      const [f] = r.flyers();
      r.cues.length = 0;
      trigger(r);
      await flush();
      const { ys } = r.track(f);
      expect(ys[0]).toBeGreaterThan(to.y); // straight home toward the tray, no shake first
      expect(f.destroyed).toBe(true);
      expect(r.cues).not.toContain('swap-invalid');
      await r.player.finish();
      expect(r.place).not.toHaveBeenCalled();
      expect(r.player.scripts).toHaveLength(1);
    });
  }

  it('a second tray drag while one is held is ignored', async () => {
    const r = gameRig();
    r.startMove();
    r.drag(0, r.board.cellXY(r.open.row, r.open.col));
    r.drag(1, r.board.cellXY(0, 0));
    expect(r.flyers()).toHaveLength(1);
    await r.player.finish();
    expect(r.place.mock.calls).toEqual([[0, r.open]]);
    expect(r.player.scripts).toHaveLength(2);
  });

  it('a tap on a slot while a move plays is still ignored', async () => {
    const r = gameRig();
    r.startMove();
    const s = r.tray.slotXY(1);
    r.down(s.x, s.y);
    await r.player.finish();
    r.up(s.x, s.y); // released once idle: still not a tap
    expect(r.c.snapshot().selectedSlot).toBeNull();
  });
});
