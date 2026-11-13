import { describe, expect, it } from 'vitest';
import { BOARD_SIZE } from '../engine';
import { computeLayout, traySlotCenter, type Layout } from './layout';

/** Everything the layout draws must sit inside the container. */
function expectFits(l: Layout, width: number, height: number) {
  expect(l.board.x).toBeGreaterThanOrEqual(0);
  expect(l.board.y).toBeGreaterThanOrEqual(0);
  expect(l.board.x + l.board.size).toBeLessThanOrEqual(width);
  expect(l.tray.x).toBeGreaterThanOrEqual(0);
  expect(l.tray.x + l.tray.w).toBeLessThanOrEqual(width);
  expect(l.tray.y + l.tray.h).toBeLessThanOrEqual(height);
}

/** The tray strip sits under the board, never beside or over it. */
function expectTrayUnderBoard(l: Layout) {
  expect(l.tray.y).toBeGreaterThanOrEqual(l.board.y + l.board.size);
  expect(l.tray.slotPx).toBeLessThanOrEqual(l.tray.h);
  expect(5 * l.tray.slotPx).toBeLessThanOrEqual(l.tray.w);
}

describe('computeLayout', () => {
  it('computeLayout portrait 390x844', () => {
    const l = computeLayout(390, 844);
    expect(l.portrait).toBe(true);
    expect(l.board.size).toBe(l.cellPx * BOARD_SIZE);
    // The board fills the width less the margins (no more than one cell of slack).
    expect(l.board.size).toBeLessThan(390);
    expect(l.board.size).toBeGreaterThan(390 - 24 - BOARD_SIZE);
    expectTrayUnderBoard(l);
    expectFits(l, 390, 844);
  });

  it('landscape 1440x900', () => {
    const l = computeLayout(1440, 900);
    expect(l.portrait).toBe(false);
    expect(l.cellPx).toBe(72);
    expectTrayUnderBoard(l);
    expectFits(l, 1440, 900);
    // Centered horizontally.
    expect(Math.abs(l.board.x * 2 + l.board.size - 1440)).toBeLessThanOrEqual(1);
  });

  it('tiny 320x480 still fits', () => {
    const l = computeLayout(320, 480);
    expect(l.cellPx).toBeGreaterThan(0);
    expectTrayUnderBoard(l);
    expectFits(l, 320, 480);
  });

  it('a wide but short container is height-bound', () => {
    const l = computeLayout(1200, 400);
    expect(l.cellPx).toBeLessThan(72);
    expectTrayUnderBoard(l);
    expectFits(l, 1200, 400);
  });

  it('cellPx is an integer', () => {
    for (const [w, h] of [[390, 844], [1440, 900], [320, 480], [777, 613], [1023.5, 701.25], [360, 740]]) {
      const l = computeLayout(w, h);
      expect(Number.isInteger(l.cellPx)).toBe(true);
      expect(Number.isInteger(l.tray.slotPx)).toBe(true);
      expectFits(l, w, h);
    }
  });

  it('tray slots are centered left to right inside the strip', () => {
    const l = computeLayout(390, 844);
    const xs = [0, 1, 2, 3, 4].map((s) => traySlotCenter(l, s));
    for (let s = 0; s < xs.length; s++) {
      expect(xs[s].x - l.tray.slotPx / 2).toBeGreaterThanOrEqual(l.tray.x);
      expect(xs[s].x + l.tray.slotPx / 2).toBeLessThanOrEqual(l.tray.x + l.tray.w);
      expect(xs[s].y).toBe(l.tray.y + l.tray.h / 2);
      if (s > 0) expect(xs[s].x).toBeGreaterThan(xs[s - 1].x);
    }
    expect(xs[2].x).toBeCloseTo(l.tray.x + l.tray.w / 2);
  });

  it('degenerate sizes give a usable non-zero layout', () => {
    const l = computeLayout(0, 0);
    expect(l.cellPx).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(l.board.x)).toBe(true);
  });
});
