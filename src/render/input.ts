// Pointer input on the Pixi stage: tap, drag and swipe on cells, tap and drag on tray slots.
// The controller owns every rule (selection, busy, AI mode); this file only turns gestures into
// calls. A drag past a fraction of a cell swaps at once, without waiting for release. While it
// is under way the grabbed piece follows the pointer by shifting its `pivot`, which the script
// player never touches, so the swap tween takes over from the piece's current offset: the
// offset then eases to zero while the tween runs, with no snap. A tray drag carries a flyer
// under the pointer and drops on the cell under its center; a drop the controller refuses
// shakes there before flying home, so a refusal is never silent. A tray drag may also start
// while a move plays: dropped before the move ends, the flyer holds where it was let go and the
// controller tries the drop once the board is idle (or cancels it, and the flyer goes home).
import type { Application, FederatedPointerEvent } from 'pixi.js';
import { gsap } from 'gsap';
import { BOARD_SIZE } from '../engine';
import type { Color, Pos } from '../engine';
import type { BoardView } from './BoardView';
import { ANIM, DRAG } from './constants';
import type { PieceSprite } from './PieceSprite';
import type { TrayView } from './TrayView';

export interface InputHandlers {
  tapCell(p: Pos): void;
  tapSlot(slot: number): void;
  swap(a: Pos, b: Pos): void;
  /** Tray slot dropped on a cell. */
  place(slot: number, at: Pos): void;
  /** False while a move plays, in AI mode or when the game is over: cell drags then show nothing. */
  canAcceptInput(): boolean;
  /** True while a move plays that a tray drop may wait out (AI mode off, the game not over). */
  canHoldDrop(): boolean;
  /** A tray drop made while a move plays: tried against the board once it is idle, unless cancelled first. */
  placeWhenIdle(slot: number, at: Pos, color: Color): Promise<HeldDrop>;
}

/** How a held tray drop ended: placed, refused by the board as it was then, or cancelled (no sound). */
export type HeldDrop = 'placed' | 'refused' | 'cancelled';

interface Pt { x: number; y: number }

const onBoard = (p: Pos) => p.row >= 0 && p.row < BOARD_SIZE && p.col >= 0 && p.col < BOARD_SIZE;

/** The neighbour cell a drag from `start` to `end` points at, once past the threshold; else null. */
export function gestureToMove(start: Pt, end: Pt, cellPx: number, startCell: Pos): Pos | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) <= DRAG.thresholdCells * cellPx) return null;
  const to = ax >= ay
    ? { row: startCell.row, col: startCell.col + Math.sign(dx) }
    : { row: startCell.row + Math.sign(dy), col: startCell.col };
  return onBoard(to) ? to : null;
}

/** Where a grabbed piece sits relative to its cell: along the dominant axis only, capped, and never toward a board edge. */
export function dragOffset(start: Pt, cur: Pt, cellPx: number, startCell: Pos): Pt {
  const dx = cur.x - start.x;
  const dy = cur.y - start.y;
  const cap = DRAG.maxOffsetCells * cellPx;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const d = horizontal ? dx : dy;
  const to = horizontal
    ? { row: startCell.row, col: startCell.col + Math.sign(dx) }
    : { row: startCell.row + Math.sign(dy), col: startCell.col };
  if (d === 0 || !onBoard(to)) return { x: 0, y: 0 };
  const v = Math.sign(d) * Math.min(Math.abs(d), cap);
  return horizontal ? { x: v, y: 0 } : { x: 0, y: v };
}

type Gesture =
  | { kind: 'cell'; id: number; start: Pt; cell: Pos; sprite: PieceSprite | undefined; done: boolean }
  | {
    kind: 'slot'; id: number; start: Pt; slot: number; flyer: PieceSprite | null; color: Color | null;
    /** Started while a move played: only a drag counts then, never a tap. */
    early: boolean;
  };

export interface InputOptions {
  /** No refusal shake: a refused tray drop just flies home. */
  reducedMotion?: boolean;
}

/** Listens on the whole canvas; returns a function that stops listening. */
export function attachInput(
  app: Application, board: BoardView, tray: TrayView, h: InputHandlers, { reducedMotion = false }: InputOptions = {},
): () => void {
  const stage = app.stage;
  const canvas = app.canvas;
  stage.eventMode = 'static';
  // app.screen is resized in place, so the hit area always covers the canvas.
  stage.hitArea = app.screen;
  // Without this a touch drag scrolls the page and the browser cancels the gesture.
  canvas.style.touchAction = 'none';

  let g: Gesture | null = null;
  let settling: { tween: gsap.core.Tween; sprite: PieceSprite } | null = null;
  /** The flyer of a drop waiting for the board to settle; one at most. */
  let held: PieceSprite | null = null;
  /** A tray drag may go on: input is taken now, or its drop can wait for the move playing. */
  const canDrag = () => h.canAcceptInput() || h.canHoldDrop();

  const setOffset = (s: PieceSprite, o: Pt) => {
    if (!s.destroyed) s.pivot.set(-o.x, -o.y);
  };
  const endSettling = () => {
    if (!settling) return;
    settling.tween.kill();
    setOffset(settling.sprite, { x: 0, y: 0 });
    settling = null;
  };
  /** Eases the piece's offset to zero; used both to hand off to the swap tween and to return to the cell. */
  const easeOut = (s: PieceSprite | undefined, from: Pt, ms: number, ease: string) => {
    if (!s || s.destroyed || (from.x === 0 && from.y === 0)) return;
    endSettling();
    const q = { x: from.x, y: from.y };
    const tween = gsap.to(q, {
      x: 0, y: 0, duration: ms / 1000, ease,
      onUpdate: () => setOffset(s, q),
      onComplete: () => { setOffset(s, { x: 0, y: 0 }); if (settling?.tween === tween) settling = null; },
    });
    settling = { tween, sprite: s };
  };
  const currentOffset = (s: PieceSprite): Pt => ({ x: -s.pivot.x, y: -s.pivot.y });

  const toCanvas = (e: PointerEvent): Pt => {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (app.screen.width / (r.width || 1)),
      y: (e.clientY - r.top) * (app.screen.height / (r.height || 1)),
    };
  };

  const finish = (e: PointerEvent | null) => {
    app.ticker.remove(watchLock);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('lostpointercapture', onCancel);
    if (e) {
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    }
    g = null;
  };

  /** Carries a released flyer back to its slot, then drops it. */
  const flyHome = (f: PieceSprite, slot: number) => {
    if (f.destroyed) return;
    const home = tray.slotXY(slot);
    const q = { x: f.x, y: f.y };
    gsap.to(q, {
      x: home.x, y: home.y, duration: ANIM.dragReturnMs / 1000, ease: 'power2.out',
      onUpdate: () => { if (!f.destroyed) f.position.set(q.x, q.y); },
      onComplete: () => { if (!f.destroyed) f.destroy(); },
    });
  };

  /** The "no" for a refused drop: the flyer shakes side to side where it was let go, dying away, then flies home. */
  const refuseFlyer = (f: PieceSprite, slot: number) => {
    if (reducedMotion) { flyHome(f, slot); return; }
    const { cells, ms, cycles } = ANIM.refuseShake;
    const x0 = f.x;
    const amp = cells * board.cellPx;
    const q = { k: 0 };
    gsap.to(q, {
      k: 1, duration: ms / 1000, ease: 'none',
      onUpdate: () => { if (!f.destroyed) f.x = x0 + amp * Math.sin(2 * Math.PI * cycles * q.k) * (1 - q.k); },
      onComplete: () => flyHome(f, slot),
    });
  };

  const abortFlyer = (cur: Extract<Gesture, { kind: 'slot' }>, animate: boolean) => {
    const f = cur.flyer;
    if (!f) return;
    cur.flyer = null;
    if (animate) flyHome(f, cur.slot);
    else f.destroy();
  };

  /** Leaves the flyer where it was let go until the controller settles the drop at idle. */
  const hold = (f: PieceSprite, slot: number, at: Pos, color: Color) => {
    held = f;
    h.placeWhenIdle(slot, at, color).then((outcome) => {
      if (held === f) held = null;
      if (f.destroyed) return;
      // Placed: the player flies its own piece from the slot, as for any drop.
      if (outcome === 'placed') f.destroy();
      else if (outcome === 'refused') refuseFlyer(f, slot);
      else flyHome(f, slot);
    }, () => {
      if (held === f) held = null;
      flyHome(f, slot);
    });
  };

  const cancel = () => {
    const cur = g;
    if (!cur) return;
    if (cur.kind === 'cell' && cur.sprite) easeOut(cur.sprite, currentOffset(cur.sprite), ANIM.dragReturnMs, 'power2.out');
    if (cur.kind === 'slot') abortFlyer(cur, true);
    finish(null);
  };

  const onMove = (e: PointerEvent) => {
    const cur = g;
    if (!cur || e.pointerId !== cur.id) return;
    const p = toCanvas(e);
    if (cur.kind === 'cell') {
      if (cur.done) return;
      if (!h.canAcceptInput()) { cancel(); return; }
      const to = gestureToMove(cur.start, p, board.cellPx, cur.cell);
      if (to) {
        cur.done = true;
        const from = cur.sprite ? currentOffset(cur.sprite) : { x: 0, y: 0 };
        h.swap(cur.cell, to);
        // Accepted swaps set the controller busy synchronously; the player's tween starts at
        // the cell, so the offset eases out alongside it. An ignored swap eases back on its own.
        const accepted = !h.canAcceptInput();
        easeOut(cur.sprite, from, accepted ? ANIM.swapMs : ANIM.dragReturnMs, accepted ? 'power2.inOut' : 'power2.out');
        return;
      }
      if (cur.sprite) setOffset(cur.sprite, dragOffset(cur.start, p, board.cellPx, cur.cell));
      return;
    }
    if (!canDrag()) { cancel(); return; }
    if (!cur.flyer && cur.color && Math.hypot(p.x - cur.start.x, p.y - cur.start.y) > DRAG.thresholdCells * board.cellPx) {
      const f = tray.flyer(cur.color);
      f.scale.set(tray.slotScale());
      cur.flyer = f;
    }
    cur.flyer?.position.set(p.x, p.y);
  };

  const onUp = (e: PointerEvent) => {
    const cur = g;
    if (!cur || e.pointerId !== cur.id) return;
    const p = toCanvas(e);
    finish(e);
    if (cur.kind === 'cell') {
      if (cur.done) return;
      if (cur.sprite) easeOut(cur.sprite, currentOffset(cur.sprite), ANIM.dragReturnMs, 'power2.out');
      h.tapCell(cur.cell);
      return;
    }
    const f = cur.flyer;
    if (!f) {
      if (!cur.early) h.tapSlot(cur.slot);
      return;
    }
    // The drop target is the cell under the flyer's center (which follows the pointer).
    f.position.set(p.x, p.y);
    const cell = board.cellAt(f.x, f.y);
    if (!cell) {
      abortFlyer(cur, true);
      return;
    }
    if (!h.canAcceptInput()) {
      // A move is still playing: the drop waits for it, unless input has locked for good.
      if (h.canHoldDrop() && cur.color) {
        cur.flyer = null;
        hold(f, cur.slot, cell, cur.color);
      } else abortFlyer(cur, true);
      return;
    }
    h.place(cur.slot, cell);
    // Accepted moves set the controller busy synchronously, and the player flies its own piece
    // from the slot. Still accepting input means the controller refused the cell (same color,
    // a special, a rock): say so before carrying ours home, so a refusal is never silent.
    cur.flyer = null;
    if (h.canAcceptInput()) refuseFlyer(f, cur.slot);
    else f.destroy();
  };

  // Input can lock while a drag is held still (AI mode turns on, a move or a deal starts): the
  // pointer then sends nothing, so check every frame and ease the piece back at once. A drag
  // that already fired its swap is the swap's own doing and is left alone; a tray drag goes on
  // through a move, and stops only when its drop could no longer wait (AI mode, game over).
  const watchLock = () => {
    const cur = g;
    if (!cur) return;
    if (cur.kind === 'cell' ? !cur.done && !h.canAcceptInput() : !canDrag()) cancel();
  };

  const onCancel = (e: PointerEvent | Event) => {
    if (g && 'pointerId' in e && e.pointerId !== g.id) return;
    cancel();
  };

  const onDown = (e: FederatedPointerEvent) => {
    // Only the first pointer counts: a second finger, or a second button, never starts a gesture.
    if (g || !e.isPrimary || e.button > 0) return;
    const idle = h.canAcceptInput();
    if (!idle && !h.canHoldDrop()) return;
    // While a move plays, a swap's offset may still be easing out alongside its tween: leave it.
    if (idle) endSettling();
    const start = { x: e.global.x, y: e.global.y };
    const cell = board.cellAt(start.x, start.y);
    if (cell) {
      // Cells take nothing while a move plays.
      if (!idle) return;
      g = { kind: 'cell', id: e.pointerId, start, cell, sprite: board.spriteAtCell(cell.row, cell.col), done: false };
    } else {
      const slot = tray.slotAt(start.x, start.y);
      // A second tray drag while a drop is held is ignored.
      if (slot === null || held) return;
      g = { kind: 'slot', id: e.pointerId, start, slot, flyer: null, color: tray.slotColor(slot), early: !idle };
    }
    // Capture keeps move/up coming here after the pointer leaves the canvas.
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or already gone */ }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('lostpointercapture', onCancel);
    app.ticker.add(watchLock);
  };

  stage.on('pointerdown', onDown);
  return () => {
    stage.off('pointerdown', onDown);
    cancel();
    endSettling();
    held?.destroy();
    held = null;
  };
}
