import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Texture } from 'pixi.js';
import { gsap } from 'gsap';
import type { Move } from '../engine';
import type { RankedMove } from '../ai/search';
import type { CueName } from '../audio/cues';
import { BoardView } from './BoardView';
import { ANIM } from './constants';
import { HintArrow, HintLayer, formatHintValue, pickHintArrows } from './HintLayer';
import { computeLayout } from './layout';
import type { PieceTextures } from './textures';
import { TrayView } from './TrayView';

const FRAME_MS = 1000 / 60;
const tex: PieceTextures = {
  cellPx: 60, piece: () => Texture.EMPTY, halo: () => Texture.EMPTY, selectRing: Texture.EMPTY, destroy() {},
};

// GSAP is stepped by hand, one 60 fps frame at a time, as the app's Pixi ticker does.
let now = 0;
beforeAll(() => {
  gsap.ticker.remove(gsap.updateRoot);
  now = gsap.globalTimeline.time();
});
afterAll(() => gsap.ticker.add(gsap.updateRoot));
const frames = (ms: number) => {
  for (let t = 0; t < ms; t += FRAME_MS) {
    now += FRAME_MS / 1000;
    gsap.updateRoot(now);
  }
};

const swap = (row: number, col: number, value: number): RankedMove => ({
  move: { type: 'swap', a: { row, col }, b: { row, col: col + 1 } }, value, expectedPoints: value,
});
const place = (slot: number, row: number, col: number, value: number): RankedMove => ({
  move: { type: 'place', slot, at: { row, col } }, value, expectedPoints: value,
});

function rig(reducedMotion = false) {
  const layout = computeLayout(600, 700);
  const board = new BoardView(tex, true);
  const tray = new TrayView(tex, true);
  board.setLayout(layout, tex);
  tray.setLayout(layout, tex);
  const cues: CueName[] = [];
  const hint = new HintLayer(board, tray, { cue: (n) => cues.push(n) }, reducedMotion);
  const arrows = () => hint.root.children as unknown as HintArrow[];
  const visible = () => arrows().filter((a) => a.visible && a.alpha > 0.01);
  return { board, tray, hint, cues, arrows, visible };
}

describe('pickHintArrows', () => {
  it('pickHintArrows caps placements then arrows', () => {
    const ranked = [
      place(0, 0, 0, 900), place(1, 0, 1, 800), place(2, 0, 2, 700), place(3, 0, 3, 600),
      ...Array.from({ length: 14 }, (_, i) => swap(4, i % 7, 500 - i * 10)),
    ];
    const picked = pickHintArrows(ranked, 12, 3);
    expect(picked).toHaveLength(12);
    expect(picked.filter((r) => r.move.type === 'place').map((r) => r.value)).toEqual([900, 800, 700]);
    expect(picked.filter((r) => r.move.type === 'swap')).toHaveLength(9);
    // A fourth placement never displaces a swap, even with a higher value.
    expect(picked.some((r) => r.value === 600)).toBe(false);
    expect(pickHintArrows(ranked.slice(4), 20, 3)).toHaveLength(14);
  });

  it('pickHintArrows keeps best first', () => {
    const ranked = [swap(0, 0, 10), place(0, 3, 3, 400), swap(1, 1, 250), swap(2, 2, -40)];
    const picked = pickHintArrows(ranked);
    expect(picked.map((r) => r.value)).toEqual([400, 250, 10, -40]);
    expect(pickHintArrows([])).toEqual([]);
    expect(ANIM.hint).toMatchObject({ maxArrows: 12, maxPlacements: 3 });
  });

  it('labels use thousands separators', () => {
    expect(formatHintValue(1240.4)).toBe('≈ 1,240');
    expect(formatHintValue(87)).toBe('≈ 87');
  });

  it('labels never go below 0 (a game-ending move ranks last but reads as 0 points)', () => {
    expect(formatHintValue(-99_812.6)).toBe('≈ 0');
    expect(formatHintValue(-0.3)).toBe('≈ 0');
    expect(formatHintValue(0)).toBe('≈ 0');
  });
});

describe('HintLayer', () => {
  it('a game-ending candidate is still ranked last but labelled 0', () => {
    const r = rig();
    void r.hint.show([swap(0, 0, -99_812), swap(1, 0, 40)], { revealMs: 900, holdMs: 4000 });
    expect(r.arrows().map((a) => a.ranked.value)).toEqual([-99_812, 40]);
    expect(r.arrows().map((a) => a.labelText)).toEqual(['≈ 0', '≈ 40']);
  });

  it('shows every picked arrow, fades the weaker ones lowest first and keeps the best', async () => {
    const r = rig();
    const ranked = [swap(0, 0, 1240), swap(1, 0, 600), place(0, 5, 5, 300), swap(2, 0, 50)];
    let done = false;
    const shown = r.hint.show(ranked, { revealMs: 900, holdMs: 4000 }).then(() => { done = true; });
    expect(r.cues).toEqual(['hint-scan']);
    expect(r.arrows().map((a) => a.ranked.value)).toEqual([50, 300, 600, 1240]); // best drawn on top
    expect(r.arrows().map((a) => a.labelText)).toEqual(['≈ 50', '≈ 300', '≈ 600', '≈ 1,240']);
    expect(r.visible()).toHaveLength(4);

    frames(320); // the lowest has faded, the rest are still up
    expect(r.visible().map((a) => a.ranked.value)).toEqual([300, 600, 1240]);
    frames(300);
    expect(r.visible().map((a) => a.ranked.value)).toEqual([600, 1240]);
    await Promise.resolve();
    expect(done).toBe(false);
    frames(320);
    await shown;
    expect(r.visible().map((a) => a.ranked.value)).toEqual([1240]);
    expect(r.cues).toEqual(['hint-scan', 'hint-lock']);

    // The best pulses while it holds, then clears itself.
    const alphas = new Set<number>();
    for (let i = 0; i < 60; i++) { frames(FRAME_MS); alphas.add(Math.round(r.arrows()[3].alpha * 100)); }
    expect(alphas.size).toBeGreaterThan(5);
    frames(4000);
    expect(r.arrows()).toHaveLength(0);
  });

  it('a placement arrow runs from its tray slot to the target cell', () => {
    const r = rig();
    void r.hint.show([place(2, 3, 4, 500)], { revealMs: 100, holdMs: 0 });
    const [arrow] = r.arrows();
    const from = r.tray.slotXY(2);
    const to = r.board.cellXY(3, 4);
    expect(arrow.from.x).toBeCloseTo(from.x);
    expect(arrow.from.y).toBeCloseTo(from.y);
    expect(arrow.to.x).toBeCloseTo(to.x);
    expect(arrow.to.y).toBeCloseTo(to.y);
    r.hint.clear();
  });

  it('clear mid-reveal removes every arrow and resolves show', async () => {
    const r = rig();
    const shown = r.hint.show([swap(0, 0, 10), swap(1, 0, 5)], { revealMs: 1000, holdMs: 4000 });
    frames(100);
    r.hint.clear();
    await shown;
    expect(r.arrows()).toHaveLength(0);
    frames(2000);
    expect(r.cues).toEqual(['hint-scan']); // no lock after a clear
  });

  it('a new show replaces the old one, and an abort signal clears', async () => {
    const r = rig();
    const first = r.hint.show([swap(0, 0, 10), swap(1, 0, 5)], { revealMs: 1000, holdMs: 4000 });
    const ac = new AbortController();
    const second = r.hint.show([swap(3, 0, 70)], { revealMs: 1000, holdMs: 4000, signal: ac.signal });
    await first;
    expect(r.arrows().map((a) => a.ranked.value)).toEqual([70]);
    ac.abort();
    await second;
    expect(r.arrows()).toHaveLength(0);
  });

  it('nothing to show resolves at once', async () => {
    const r = rig();
    await r.hint.show([], { revealMs: 1000, holdMs: 4000 });
    expect(r.arrows()).toHaveLength(0);
    expect(r.cues).toEqual([]);
  });

  it('reduced motion: same fades and best, no pulse', async () => {
    const r = rig(true);
    const shown = r.hint.show([swap(0, 0, 10), swap(1, 0, 5)], { revealMs: 300, holdMs: 4000 });
    frames(340);
    await shown;
    expect(r.visible().map((a) => a.ranked.value)).toEqual([10]);
    const alphas = new Set<number>();
    for (let i = 0; i < 60; i++) { frames(FRAME_MS); alphas.add(r.arrows()[1].alpha); }
    expect([...alphas]).toEqual([1]);
    r.hint.clear();
  });

  it('marks the tray slots of placement arrows while they show', () => {
    const r = rig();
    const hinted: number[][] = [];
    const setHinted = r.tray.setHinted.bind(r.tray);
    r.tray.setHinted = (slots) => { hinted.push([...slots]); setHinted(slots); };
    const moves: Move[] = [];
    void r.hint.show([place(1, 2, 2, 90), swap(0, 0, 40)], { revealMs: 100, holdMs: 1000 });
    moves.push(...r.arrows().map((a) => a.ranked.move));
    expect(hinted.at(-1)).toEqual([1]);
    r.hint.clear();
    expect(hinted.at(-1)).toEqual([]);
    expect(moves).toHaveLength(2);
  });
});
