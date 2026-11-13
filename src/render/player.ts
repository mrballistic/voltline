// Plays an engine script on the Pixi board: planScript decides every time, this file only turns
// each planned action into GSAP tweens on one timeline (spec §6.1–6.2).
//
// Positions are tweened in cell units through small proxy objects and mapped to pixels with
// BoardView.cellXY on every update, so a fall is measured in real cells and a resize mid-cascade
// moves nothing off course. Fall and spawn tweens use power2.in over √(2d/g), which is exactly
// constant acceleration from rest; every one in a round starts at the same planned instant.
import { gsap } from 'gsap';
import { BOARD_SIZE } from '../engine';
import type { Board, Color, Pos, Step } from '../engine';
import type { CueSink } from '../audio/cues';
import type { Effects } from '../app/ports';
import type { BoardView } from './BoardView';
import { ANIM, fallDurationMs } from './constants';
import { planScript, type Action, type Planned } from './plan';
import type { PieceSprite } from './PieceSprite';
import { effectColor } from './textures';
import type { TrayView } from './TrayView';

/** What the board shows once a script (or a fresh deal) has played. */
export interface ShownState { board: Board; tray: Color[] }

export interface ScriptPlayerLike {
  /** Animates `script`, then snaps every sprite to `end` (the engine's state after the move). */
  play(script: Step[], end: ShownState): Promise<void>;
  /** Deals a fresh board: the old one falls away, the new one drops in from above. */
  show(state: ShownState): Promise<void>;
  /** Re-places every sprite on its model cell; call only while nothing is playing. */
  relayout(): void;
}

export interface ScriptPlayerDeps {
  board: BoardView;
  tray: TrayView;
  effects: Effects;
  audio: CueSink;
  /** Receives `score`, `notice`, `tray-fly` and `tray-lost` at their planned instants. */
  onAction: (a: Action) => void;
  reducedMotion: boolean;
}

type Tl = gsap.core.Timeline;
const S = (ms: number) => ms / 1000;
const FORWARDED = new Set<Action['a']>(['score', 'notice', 'tray-fly', 'tray-lost']);

export class ScriptPlayer implements ScriptPlayerLike {
  private readonly d: ScriptPlayerDeps;
  private readonly timeScale: number;
  private shown: ShownState = { board: [], tray: [] };
  /** The timeline playing now, the state it ends on, and the promise it owes. */
  private active: { tl: Tl; end: ShownState; resolve: () => void } | null = null;
  private readonly flyers = new Set<PieceSprite>();

  constructor(deps: ScriptPlayerDeps) {
    this.d = deps;
    this.timeScale = deps.reducedMotion ? ANIM.reducedMotionTimeScale : 1;
  }

  play(script: Step[], end: ShownState): Promise<void> {
    const { items, totalMs } = planScript(script, { timeScale: this.timeScale });
    return this.run(items, totalMs, end);
  }

  show(state: ShownState): Promise<void> {
    this.interrupt(true);
    const outMs = this.d.board.allSprites().length > 0 ? ANIM.boardOutMs / this.timeScale : 0;
    const inMs = (fallDurationMs(BOARD_SIZE) + ANIM.landMs) / this.timeScale;
    const items: Planned[] = [];
    if (outMs > 0) items.push({ atMs: 0, durMs: outMs, action: { a: 'board-out' } });
    items.push({ atMs: outMs, durMs: inMs, action: { a: 'board-in', board: state.board } });
    items.push({ atMs: outMs, durMs: 0, action: { a: 'cue', name: 'board-in' } });
    this.d.tray.setTray(state.tray);
    return this.run(items, outMs + inMs, state);
  }

  relayout(): void {
    this.d.board.snapToModel(this.shown.board);
    this.d.tray.setTray(this.shown.tray);
  }

  /** Stops playing. A play in progress resolves at once, so nothing waits on it forever. */
  dispose(): void {
    this.interrupt(false);
    this.clearFlyers();
  }

  /**
   * Kills the running timeline and resolves its play. With `snap`, first jumps the board to that
   * play's end state, so whatever runs next starts from a consistent model.
   */
  private interrupt(snap: boolean): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    a.tl.kill();
    if (snap) this.finish(a.end);
    a.resolve();
  }

  private run(items: Planned[], totalMs: number, end: ShownState): Promise<void> {
    this.interrupt(true);
    if (items.length === 0) {
      this.finish(end);
      return Promise.resolve();
    }
    const tl = gsap.timeline({ paused: true });
    const ctx = new PlayContext(this.d, this.shown, this.timeScale, this.flyers);
    for (const p of items) ctx.schedule(tl, p);
    // Pins the timeline's length to the plan's, even when it ends on an instant (a notice).
    tl.set({}, {}, S(totalMs));
    return new Promise((resolve) => {
      this.active = { tl, end, resolve };
      tl.eventCallback('onComplete', () => {
        if (this.active?.tl !== tl) return;
        this.active = null;
        this.finish(end);
        resolve();
      });
      tl.play();
    });
  }

  private finish(end: ShownState): void {
    this.shown = { board: end.board, tray: [...end.tray] };
    this.clearFlyers();
    this.d.board.snapToModel(end.board);
    this.d.tray.setTray(end.tray);
  }

  private clearFlyers(): void {
    for (const f of this.flyers) f.destroy();
    this.flyers.clear();
  }
}

/** Scheduling state for one timeline: where each piece rests as the script moves it. */
class PlayContext {
  private readonly d: ScriptPlayerDeps;
  private readonly timeScale: number;
  private readonly flyers: Set<PieceSprite>;
  /** Piece id → the cell it occupies at the point of the script being scheduled. */
  private readonly cellOf = new Map<number, Pos>();
  private tray: Color[];

  constructor(d: ScriptPlayerDeps, shown: ShownState, timeScale: number, flyers: Set<PieceSprite>) {
    this.d = d;
    this.timeScale = timeScale;
    this.flyers = flyers;
    this.tray = [...shown.tray];
    shown.board.forEach((row, r) => row.forEach((p, c) => { if (p) this.cellOf.set(p.id, { row: r, col: c }); }));
  }

  /** Puts sprite `id` at fractional cell (row, col), `dy` cells below it. */
  private place(id: number, row: number, col: number, dy = 0): void {
    const s = this.d.board.sprite(id);
    if (!s) return;
    const { x, y } = this.d.board.cellXY(row + dy, col);
    s.position.set(x, y);
  }

  schedule(tl: Tl, p: Planned): void {
    const at = S(p.atMs);
    const dur = S(p.durMs);
    const a = p.action;
    if (FORWARDED.has(a.a)) tl.call(() => this.d.onAction(a), undefined, at);
    switch (a.a) {
      case 'swap':
        a.ids.forEach((id, i) => this.slide(tl, id, a.to[i], at, dur));
        break;
      case 'swap-back':
        this.slide(tl, a.ids[0], a.a1, at, dur);
        this.slide(tl, a.ids[1], a.b1, at, dur);
        break;
      case 'place':
        this.placeFromTray(tl, a, at, dur);
        break;
      case 'pop':
        this.pop(tl, a, at);
        break;
      case 'morph':
        this.morph(tl, a, at, dur);
        break;
      case 'blast':
        tl.call(() => {
          void this.d.effects.blast(a.blast, (r, c) => this.d.board.cellXY(r, c));
          if (a.blast.kind === 'charge' && !this.d.reducedMotion) this.d.effects.shake(ANIM.chargeShake.px, ANIM.chargeShake.ms);
        }, undefined, at);
        break;
      case 'fall':
        this.drop(tl, a.id, a.col, a.fromRow, a.toRow, at, dur);
        break;
      case 'spawn': {
        const { piece, col, fromRow } = a;
        // Created only when its fall starts, one cell per row above the top edge (under the mask).
        this.drop(tl, piece.id, col, fromRow, a.toRow, at, dur, () => this.d.board.adopt(piece, fromRow, col));
        break;
      }
      case 'land': {
        const cell = this.cellOf.get(a.id);
        if (cell) this.land(tl, [a.id], at, dur, () => cell);
        break;
      }
      case 'tray-fly':
        this.trayFly(tl, a, at, dur);
        break;
      case 'tray-lost':
        this.trayLost(tl, a, at, dur);
        break;
      case 'board-out':
        this.boardOut(tl, at, dur);
        break;
      case 'board-in':
        this.boardIn(tl, a.board, at, dur);
        break;
      case 'cue': {
        const { name, chain } = a;
        tl.call(() => this.d.audio.cue(name, chain === undefined ? undefined : { chain }), undefined, at);
        break;
      }
      case 'score':
      case 'notice':
        break;
    }
  }

  private slide(tl: Tl, id: number, to: Pos, at: number, dur: number): void {
    const from = this.cellOf.get(id);
    if (!from) return;
    this.cellOf.set(id, to);
    const q = { r: from.row, c: from.col };
    tl.to(q, { r: to.row, c: to.col, duration: dur, ease: 'power2.inOut', onUpdate: () => this.place(id, q.r, q.c) }, at);
  }

  private drop(tl: Tl, id: number, col: number, fromRow: number, toRow: number, at: number, dur: number,
    onStart?: () => void): void {
    this.cellOf.set(id, { row: toRow, col });
    const q = { r: fromRow };
    tl.to(q, {
      r: toRow, duration: dur, ease: 'power2.in',
      onStart, onUpdate: () => this.place(id, q.r, col),
    }, at);
  }

  /** Squash on impact (bottom planted), then a small rebound and back to rest, for `ids` together. */
  private land(tl: Tl, ids: number[], at: number, dur: number, cellOf: (id: number) => Pos): void {
    const { squash, rise } = ANIM.landPhases;
    const sq = ANIM.landSquash;
    const q = { sx: 1, sy: 1, dy: 0 };
    const apply = () => {
      for (const id of ids) {
        const s = this.d.board.sprite(id);
        if (!s) continue;
        const c = cellOf(id);
        this.place(id, c.row, c.col, q.dy);
        s.scale.set(q.sx, q.sy);
      }
    };
    tl.to(q, { sx: sq.x, sy: sq.y, dy: (1 - sq.y) / 2, duration: dur * squash, ease: 'power2.out', onUpdate: apply }, at)
      .to(q, { sx: 1, sy: 1, dy: -ANIM.landReboundCells, duration: dur * rise, ease: 'power2.out', onUpdate: apply }, at + dur * squash)
      .to(q, { dy: 0, duration: dur * (1 - squash - rise), ease: 'power2.in', onUpdate: apply }, at + dur * (squash + rise));
  }

  private pop(tl: Tl, a: Extract<Action, { a: 'pop' }>, at: number): void {
    const grow = S(ANIM.popGrowMs) / this.timeScale;
    const collapse = S(ANIM.popCollapseMs) / this.timeScale;
    const { id } = a;
    this.cellOf.delete(id);
    const q = { k: 1 };
    const apply = () => this.d.board.sprite(id)?.scale.set(q.k);
    tl.to(q, { k: ANIM.popScale, duration: grow, ease: 'power2.out', onUpdate: apply }, at)
      .call(() => this.d.effects.pop(this.d.board.cellXY(a.at.row, a.at.col), effectColor(a.key)), undefined, at + grow)
      .to(q, { k: 0, duration: collapse, ease: 'power2.in', onUpdate: apply }, at + grow)
      .call(() => this.d.board.release(id), undefined, at + grow + collapse);
  }

  private morph(tl: Tl, a: Extract<Action, { a: 'morph' }>, at: number, dur: number): void {
    const { id, piece } = a;
    const q = { k: 1 };
    const apply = () => this.d.board.sprite(id)?.scale.set(q.k);
    tl.call(() => {
      const s = this.d.board.restyle(id, piece);
      if (s) this.d.effects.morph(s);
    }, undefined, at)
      .to(q, { k: ANIM.morphScale, duration: dur / 2, ease: 'power2.out', onUpdate: apply }, at)
      .to(q, { k: 1, duration: dur / 2, ease: 'power2.in', onUpdate: apply }, at + dur / 2);
  }

  /** A loose piece moving from `from` to `to` (canvas px, read each frame so resizes follow). */
  private fly(tl: Tl, color: Color, at: number, dur: number,
    path: (k: number) => { x: number; y: number; scale: number; alpha: number }, ease: string, onEnd?: () => void): void {
    let s: PieceSprite | null = null;
    const q = { k: 0 };
    const apply = () => {
      if (!s) return;
      const p = path(q.k);
      s.position.set(p.x, p.y);
      s.scale.set(p.scale);
      s.alpha = p.alpha;
    };
    tl.to(q, {
      k: 1, duration: dur, ease,
      onStart: () => {
        s = this.d.tray.flyer(color);
        this.flyers.add(s);
        apply();
      },
      onUpdate: apply,
      onComplete: () => {
        if (s) {
          this.flyers.delete(s);
          s.destroy();
        }
        s = null;
        onEnd?.();
      },
    }, at);
  }

  private placeFromTray(tl: Tl, a: Extract<Action, { a: 'place' }>, at: number, dur: number): void {
    const { removedId, piece, slot, at: cell } = a;
    const color = piece.kind === 'gem' ? piece.color : this.tray[slot];
    this.cellOf.delete(removedId);
    this.cellOf.set(piece.id, cell);
    this.tray = this.tray.filter((_, i) => i !== slot);
    const trayAfter = [...this.tray];
    // The slot empties as the piece leaves it; the piece it replaces shrinks away underneath.
    tl.call(() => this.d.tray.setTray(trayAfter), undefined, at);
    const q = { k: 1 };
    tl.to(q, { k: 0, duration: dur, ease: 'power2.in', onUpdate: () => this.d.board.sprite(removedId)?.scale.set(q.k) }, at);
    const lerp = (u: number, v: number, k: number) => u + (v - u) * k;
    this.fly(tl, color, at, dur, (k) => {
      const from = this.d.tray.slotXY(slot);
      const to = this.d.board.cellXY(cell.row, cell.col);
      return { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k), scale: lerp(this.d.tray.slotScale(), 1, k), alpha: 1 };
    }, 'power2.inOut', () => {
      this.d.board.release(removedId);
      this.d.board.adopt(piece, cell.row, cell.col);
    });
  }

  private trayFly(tl: Tl, a: Extract<Action, { a: 'tray-fly' }>, at: number, dur: number): void {
    const { color, from, slot } = a;
    this.tray[slot] = color;
    const trayAfter = [...this.tray];
    const lerp = (u: number, v: number, k: number) => u + (v - u) * k;
    this.fly(tl, color, at, dur, (k) => {
      const p = this.d.board.cellXY(from.row, from.col);
      const to = this.d.tray.slotXY(slot);
      return { x: lerp(p.x, to.x, k), y: lerp(p.y, to.y, k), scale: lerp(1, this.d.tray.slotScale(), k), alpha: 1 };
    }, 'power2.inOut', () => this.d.tray.setTray(trayAfter));
  }

  /** The tray was full: the earned piece drifts up and fades away. */
  private trayLost(tl: Tl, a: Extract<Action, { a: 'tray-lost' }>, at: number, dur: number): void {
    const { color, from } = a;
    this.fly(tl, color, at, dur, (k) => {
      const p = this.d.board.cellXY(from.row - k, from.col);
      return { x: p.x, y: p.y, scale: 1 - k / 2, alpha: 1 - k };
    }, 'power2.out');
  }

  /** The whole board drops out of the bottom edge under the same gravity, fading as it goes. */
  private boardOut(tl: Tl, at: number, dur: number): void {
    const cells = [...this.cellOf];
    const t = dur * this.timeScale; // seconds of real fall at this time scale
    const q = { dy: 0, alpha: 1 };
    tl.to(q, {
      dy: (ANIM.gravity * t * t) / 2, alpha: 0, duration: dur, ease: 'power2.in',
      onUpdate: () => {
        for (const [id, c] of cells) {
          this.place(id, c.row, c.col, q.dy);
          const s = this.d.board.sprite(id);
          if (s) s.alpha = q.alpha;
        }
      },
    }, at);
  }

  /** The new board falls in from above as one block (every column on the same frame), then lands. */
  private boardIn(tl: Tl, board: Board, at: number, dur: number): void {
    const cells = new Map<number, Pos>();
    board.forEach((row, r) => row.forEach((p, c) => { if (p) cells.set(p.id, { row: r, col: c }); }));
    this.cellOf.clear();
    for (const [id, c] of cells) this.cellOf.set(id, c);
    const fall = S(fallDurationMs(BOARD_SIZE)) / this.timeScale;
    const q = { dy: -BOARD_SIZE };
    const apply = () => { for (const [id, c] of cells) this.place(id, c.row, c.col, q.dy); };
    tl.to(q, {
      dy: 0, duration: fall, ease: 'power2.in',
      onStart: () => {
        this.d.board.setBoard(board);
        apply();
      },
      onUpdate: apply,
    }, at);
    this.land(tl, [...cells.keys()], at + fall, Math.max(0, dur - fall), (id) => cells.get(id)!);
  }
}

