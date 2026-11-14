// The hint and AI-move visualization (spec §7.3): every candidate the AI found appears as a faint
// arrow labelled with its value, the weaker ones fade out lowest first, and the best is left
// pulsing. Drawn on the stage above the board and the tray, in the same canvas CSS px, so a
// placement arrow can run from its tray slot to its target cell without being clipped.
import { Container, Graphics, Text } from 'pixi.js';
import { gsap } from 'gsap';
import type { Pos } from '../engine';
import type { RankedMove } from '../ai/search';
import type { CueSink } from '../audio/cues';
import type { HintViewLike } from '../app/ports';
import type { BoardView } from './BoardView';
import { ANIM } from './constants';
import type { TrayView } from './TrayView';

/** Hint look: neon cores (cyan candidates, yellow best) over a dark outline so they read on every piece. */
const STYLE = {
  candidate: 0x4dd8ff,
  best: 0xffe14d,
  outline: 0x0a0a11,
  outlineAlpha: 0.85,
  faintAlpha: 0.7,
  pulseLoAlpha: 0.5,
  /** Shares of a cell: line width, outline width each side, head length, gap kept clear at each end, label clearance. */
  line: 0.09,
  outlineW: 0.045,
  head: 0.3,
  labelGap: 0.08,
  inset: { from: 0.14, to: 0.1 },
  font: '"Rajdhani", system-ui, sans-serif',
  fontCells: 0.26,
  minFontPx: 11,
  /** Dark stroke around the label text, in cells (at least 3 px). */
  labelStroke: 0.07,
} as const;

const S = (ms: number) => ms / 1000;

/**
 * `≈ 1,240`: the AI's value in points, rounded, with thousands separators. Never below 0: a move
 * that ends the game carries a large negative weight, which ranks it but means nothing as points.
 */
export function formatHintValue(value: number): string {
  return `≈ ${Math.max(0, Math.round(value)).toLocaleString('en-US')}`;
}

/**
 * The arrows worth drawing: every swap plus the best `maxPlacements` placements (they all start
 * at the tray, so dozens would be noise), then the best `maxArrows` of those, highest value first.
 */
export function pickHintArrows(
  ranked: RankedMove[], maxArrows: number = ANIM.hint.maxArrows, maxPlacements: number = ANIM.hint.maxPlacements,
): RankedMove[] {
  let placements = 0;
  return [...ranked]
    .sort((a, b) => b.value - a.value)
    .filter((r) => r.move.type !== 'place' || placements++ < maxPlacements)
    .slice(0, maxArrows);
}

/** One arrow: a dark outline, a white core tinted to its role, and its value label. */
export class HintArrow extends Container {
  readonly ranked: RankedMove;
  readonly from: { x: number; y: number };
  readonly to: { x: number; y: number };
  private readonly core = new Graphics();
  private readonly valueText: Text;

  constructor(ranked: RankedMove, from: { x: number; y: number }, to: { x: number; y: number }, cellPx: number) {
    super();
    this.ranked = ranked;
    this.from = from;
    this.to = to;
    const outline = new Graphics();
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const ux = (to.x - from.x) / len;
    const uy = (to.y - from.y) / len;
    const start = { x: from.x + ux * STYLE.inset.from * cellPx, y: from.y + uy * STYLE.inset.from * cellPx };
    const tip = { x: to.x - ux * STYLE.inset.to * cellPx, y: to.y - uy * STYLE.inset.to * cellPx };
    const h = STYLE.head * cellPx;
    const base = { x: tip.x - ux * h, y: tip.y - uy * h };
    const head = [tip.x, tip.y, base.x - uy * h * 0.6, base.y + ux * h * 0.6, base.x + uy * h * 0.6, base.y - ux * h * 0.6];
    const w = Math.max(2, STYLE.line * cellPx);
    const ow = Math.max(1.5, STYLE.outlineW * cellPx);
    outline.moveTo(start.x, start.y).lineTo(base.x, base.y)
      .stroke({ color: STYLE.outline, alpha: STYLE.outlineAlpha, width: w + 2 * ow, cap: 'round' })
      .poly(head).fill({ color: STYLE.outline, alpha: STYLE.outlineAlpha })
      .poly(head).stroke({ color: STYLE.outline, alpha: STYLE.outlineAlpha, width: 2 * ow, join: 'round' });
    this.core.moveTo(start.x, start.y).lineTo(base.x, base.y).stroke({ color: 0xffffff, width: w, cap: 'round' })
      .poly(head).fill({ color: 0xffffff });
    this.valueText = new Text({
      text: formatHintValue(ranked.value),
      style: {
        fontFamily: STYLE.font, fontWeight: '700', fontSize: Math.max(STYLE.minFontPx, Math.round(STYLE.fontCells * cellPx)),
        fill: 0xffffff, stroke: { color: STYLE.outline, width: Math.max(3, Math.round(cellPx * STYLE.labelStroke)), join: 'round' },
      },
    });
    // Beside the line, never on it: above a mostly horizontal arrow, right of a mostly vertical one.
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const gap = w / 2 + ow + STYLE.labelGap * cellPx;
    if (Math.abs(ux) >= Math.abs(uy)) {
      this.valueText.anchor.set(0.5, 1);
      this.valueText.position.set(mid.x, mid.y - gap);
    } else {
      this.valueText.anchor.set(0, 0.5);
      this.valueText.position.set(mid.x + gap, mid.y);
    }
    this.addChild(outline, this.core, this.valueText);
    this.setBest(false);
  }

  get labelText(): string {
    return this.valueText.text;
  }

  setBest(best: boolean): void {
    this.core.tint = best ? STYLE.best : STYLE.candidate;
    this.valueText.tint = best ? STYLE.best : 0xffffff;
  }
}

export class HintLayer implements HintViewLike {
  readonly root = new Container();
  private readonly board: BoardView;
  private readonly tray: TrayView;
  private readonly audio: CueSink;
  private readonly reducedMotion: boolean;
  private tl: gsap.core.Timeline | null = null;
  private pulse: gsap.core.Tween | null = null;
  private hold: gsap.core.Tween | null = null;
  /** Resolves the show in progress; a clear or a newer show resolves it early. */
  private settle: (() => void) | null = null;
  private unlisten: (() => void) | null = null;

  constructor(board: BoardView, tray: TrayView, audio: CueSink, reducedMotion = false) {
    this.board = board;
    this.tray = tray;
    this.audio = audio;
    this.reducedMotion = reducedMotion;
    this.root.eventMode = 'none';
  }

  show(ranked: RankedMove[], opts: { revealMs: number; holdMs: number; signal?: AbortSignal }): Promise<void> {
    this.clear();
    const picked = pickHintArrows(ranked);
    if (picked.length === 0 || opts.signal?.aborted) return Promise.resolve();
    const cellPx = this.board.cellPx;
    // Lowest value first, so the best is drawn on top.
    const arrows = picked.map((r) => new HintArrow(r, this.startOf(r), this.endOf(r), cellPx)).reverse();
    for (const a of arrows) a.alpha = STYLE.faintAlpha;
    this.root.addChild(...arrows);
    const best = arrows[arrows.length - 1];
    const weaker = arrows.slice(0, -1);
    this.tray.setHinted(picked.flatMap((r) => (r.move.type === 'place' ? [r.move.slot] : [])));
    this.audio.cue('hint-scan');

    const done = new Promise<void>((resolve) => { this.settle = resolve; });
    if (opts.signal) {
      const onAbort = () => this.clear();
      const signal = opts.signal;
      signal.addEventListener('abort', onAbort, { once: true });
      this.unlisten = () => signal.removeEventListener('abort', onAbort);
    }
    const step = weaker.length ? opts.revealMs / weaker.length : opts.revealMs;
    const tl = gsap.timeline({ onComplete: () => this.lock(best, opts.holdMs) });
    weaker.forEach((a, k) => {
      tl.to(a, { alpha: 0, duration: S(step), ease: 'power1.in', onComplete: () => { a.visible = false; } }, S(k * step));
    });
    if (weaker.length === 0) tl.to({}, { duration: S(opts.revealMs) }, 0);
    this.tl = tl;
    return done;
  }

  clear(): void {
    this.tl?.kill();
    this.pulse?.kill();
    this.hold?.kill();
    this.tl = this.pulse = this.hold = null;
    this.unlisten?.();
    this.unlisten = null;
    for (const c of this.root.removeChildren()) c.destroy({ children: true });
    this.tray.setHinted([]);
    const settle = this.settle;
    this.settle = null;
    settle?.();
  }

  destroy(): void {
    this.clear();
    this.root.destroy({ children: true });
  }

  /** The reveal is over: one arrow is left. Resolves the show, then holds it for `holdMs`. */
  private lock(best: HintArrow, holdMs: number): void {
    this.tl = null;
    best.setBest(true);
    best.alpha = 1;
    const move = best.ranked.move;
    this.tray.setHinted(move.type === 'place' ? [move.slot] : []);
    this.audio.cue('hint-lock');
    if (!this.reducedMotion) {
      this.pulse = gsap.to(best, {
        alpha: STYLE.pulseLoAlpha, duration: ANIM.hint.pulseS / 2, ease: 'sine.inOut', yoyo: true, repeat: -1,
      });
    }
    const settle = this.settle;
    this.settle = null;
    settle?.();
    this.hold = gsap.delayedCall(S(holdMs), () => this.clear());
  }

  private startOf(r: RankedMove): { x: number; y: number } {
    return r.move.type === 'place' ? this.tray.slotXY(r.move.slot) : this.cell(r.move.a);
  }

  private endOf(r: RankedMove): { x: number; y: number } {
    return this.cell(r.move.type === 'place' ? r.move.at : r.move.b);
  }

  private cell(p: Pos): { x: number; y: number } {
    return this.board.cellXY(p.row, p.col);
  }
}
