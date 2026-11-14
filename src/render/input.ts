// Pointer input on the Pixi stage: tap, drag and swipe on cells, tap and drag on tray slots.
// The controller owns every rule (selection, busy, AI mode); this file only turns gestures into
// calls. A drag past a fraction of a cell swaps at once, without waiting for release. While it
// is under way the grabbed piece follows the pointer by shifting its `pivot`, which the script
// player never touches, so the swap tween takes over from the piece's current offset: the
// offset then eases to zero while the tween runs, with no snap.
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
  /** False while a move plays, in AI mode or when the game is over: drags then show nothing. */
  canAcceptInput(): boolean;
}

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
  | { kind: 'slot'; id: number; start: Pt; slot: number; flyer: PieceSprite | null; color: Color | null };

/** Listens on the whole canvas; returns a function that stops listening. */
export function attachInput(app: Application, board: BoardView, tray: TrayView, h: InputHandlers): () => void {
  const stage = app.stage;
  const canvas = app.canvas;
  stage.eventMode = 'static';
  // app.screen is resized in place, so the hit area always covers the canvas.
  stage.hitArea = app.screen;
  // Without this a touch drag scrolls the page and the browser cancels the gesture.
  canvas.style.touchAction = 'none';

  let g: Gesture | null = null;
  let settling: { tween: gsap.core.Tween; sprite: PieceSprite } | null = null;

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

  const abortFlyer = (cur: Extract<Gesture, { kind: 'slot' }>, animate: boolean) => {
    const f = cur.flyer;
    if (!f) return;
    cur.flyer = null;
    if (!animate) { f.destroy(); return; }
    const home = tray.slotXY(cur.slot);
    const q = { x: f.x, y: f.y };
    gsap.to(q, {
      x: home.x, y: home.y, duration: ANIM.dragReturnMs / 1000, ease: 'power2.out',
      onUpdate: () => { if (!f.destroyed) f.position.set(q.x, q.y); },
      onComplete: () => { if (!f.destroyed) f.destroy(); },
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
    if (!h.canAcceptInput()) { cancel(); return; }
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
    if (!cur.flyer) {
      h.tapSlot(cur.slot);
      return;
    }
    const cell = board.cellAt(p.x, p.y);
    if (cell && h.canAcceptInput()) {
      h.place(cur.slot, cell);
      // Accepted: the player flies its own piece from the slot. Ignored: carry ours home.
      abortFlyer(cur, h.canAcceptInput());
    } else {
      abortFlyer(cur, true);
    }
  };

  // Input can lock while a drag is held still (AI mode turns on, a move or a deal starts): the
  // pointer then sends nothing, so check every frame and ease the piece back at once. A drag
  // that already fired its swap is the swap's own doing and is left alone.
  const watchLock = () => {
    const cur = g;
    if (cur && !(cur.kind === 'cell' && cur.done) && !h.canAcceptInput()) cancel();
  };

  const onCancel = (e: PointerEvent | Event) => {
    if (g && 'pointerId' in e && e.pointerId !== g.id) return;
    cancel();
  };

  const onDown = (e: FederatedPointerEvent) => {
    // Only the first pointer counts: a second finger, or a second button, never starts a gesture.
    if (g || !e.isPrimary || e.button > 0) return;
    if (!h.canAcceptInput()) return;
    endSettling();
    const start = { x: e.global.x, y: e.global.y };
    const cell = board.cellAt(start.x, start.y);
    if (cell) {
      g = { kind: 'cell', id: e.pointerId, start, cell, sprite: board.spriteAtCell(cell.row, cell.col), done: false };
    } else {
      const slot = tray.slotAt(start.x, start.y);
      if (slot === null) return;
      g = { kind: 'slot', id: e.pointerId, start, slot, flyer: null, color: tray.slotColor(slot) };
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
  };
}
