import { describe, expect, it } from 'vitest';
import { Texture } from 'pixi.js';
import { TRAY_CAPACITY, type Color } from '../engine';
import { PANEL } from './BoardView';
import { computeLayout } from './layout';
import type { PieceTextures } from './textures';
import { TRAY_FULL_BORDER, TrayView } from './TrayView';

const tex: PieceTextures = {
  cellPx: 60, piece: () => Texture.EMPTY, halo: () => Texture.EMPTY, selectRing: Texture.EMPTY, destroy() {},
};
const COLORS: Color[] = ['red', 'blue', 'yellow', 'green', 'cyan', 'magenta', 'orange'];

describe('TrayView', () => {
  it('strokes the panel yellow while the tray holds TRAY_CAPACITY pieces, and normally otherwise', () => {
    expect(TRAY_FULL_BORDER).toEqual({ color: 0xffe14d, alpha: 0.45 });
    const tray = new TrayView(tex, true);
    tray.setLayout(computeLayout(600, 700), tex);
    const normal = { color: PANEL.border, alpha: PANEL.borderAlpha };
    expect(tray.border).toEqual(normal);
    tray.setTray(COLORS.slice(0, TRAY_CAPACITY - 1));
    expect(tray.border).toEqual(normal);
    tray.setTray(COLORS.slice(0, TRAY_CAPACITY));
    expect(tray.border).toEqual(TRAY_FULL_BORDER);
    tray.setTray(COLORS.slice(0, 1));
    expect(tray.border).toEqual(normal);
    tray.destroy();
  });

  it('keeps the full border across a relayout', () => {
    const tray = new TrayView(tex, true);
    tray.setLayout(computeLayout(600, 700), tex);
    tray.setTray(COLORS.slice(0, TRAY_CAPACITY));
    tray.setLayout(computeLayout(390, 844), tex);
    expect(tray.border).toEqual(TRAY_FULL_BORDER);
    tray.destroy();
  });
});
