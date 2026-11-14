import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Container, Texture, type Application } from 'pixi.js';
import { gsap } from 'gsap';
import type { Pos } from '../engine';
import { BoardView } from './BoardView';
import { ANIM } from './constants';
import { attachInput, dragOffset, gestureToMove } from './input';
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

function rig(opts: { refuse?: (slot: number, at: Pos) => boolean; reducedMotion?: boolean } = {}) {
  vi.stubGlobal('window', new EventTarget());
  const layout = computeLayout(600, 700);
  const board = new BoardView(tex, true);
  const tray = new TrayView(tex, true);
  board.setLayout(layout, tex);
  tray.setLayout(layout, tex);
  tray.setTray(['red', 'blue', 'yellow', 'green', 'magenta']);
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
  const calls: Calls = { place: [], tapSlot: [] };
  let busy = false;
  const stop = attachInput(app, board, tray, {
    tapCell: () => {},
    tapSlot: (slot) => calls.tapSlot.push(slot),
    swap: () => {},
    place: (slot, at) => {
      calls.place.push([slot, at]);
      if (!opts.refuse?.(slot, at)) busy = true;
    },
    canAcceptInput: () => !busy,
  }, { reducedMotion: opts.reducedMotion ?? false });

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
  return { board, tray, calls, drag, down, move, up, frame, flyers, stop, setBusy: (b: boolean) => { busy = b; } };
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
