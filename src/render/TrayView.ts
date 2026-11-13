// The tray strip under the board: TRAY_CAPACITY slots, empty ones drawn as dim outlines.
// Coordinates are canvas CSS px, like BoardView.
import { Container, Graphics } from 'pixi.js';
import { TRAY_CAPACITY } from '../engine';
import type { Color } from '../engine';
import { PANEL } from './BoardView';
import { traySlotCenter, type Layout } from './layout';
import { PieceSprite } from './PieceSprite';
import type { PieceTextures } from './textures';

const SLOT = {
  radius: 8,
  empty: { color: 0x8ca0ff, alpha: 0.16 },
  selected: { color: 0xffffff, alpha: 0.85 },
  hinted: { color: 0x4de8ff, alpha: 0.7 },
} as const;

/** Tray pieces are not on the board, so they get ids no engine piece can have. */
const slotId = (slot: number) => -1 - slot;

export class TrayView {
  readonly root = new Container();
  private readonly panel = new Graphics();
  private readonly outlines: Graphics[] = [];
  private readonly sprites: (PieceSprite | null)[] = [];
  private layout: Layout | null = null;
  private tex: PieceTextures;
  private readonly reducedMotion: boolean;
  private tray: Color[] = [];
  private selected: number | null = null;
  private hinted = new Set<number>();

  constructor(tex: PieceTextures, reducedMotion: boolean) {
    this.tex = tex;
    this.reducedMotion = reducedMotion;
    this.root.addChild(this.panel);
    for (let i = 0; i < TRAY_CAPACITY; i++) {
      const g = new Graphics();
      this.outlines.push(g);
      this.sprites.push(null);
      this.root.addChild(g);
    }
  }

  setLayout(l: Layout, tex: PieceTextures): void {
    this.layout = l;
    this.tex = tex;
    const { x, y, w, h } = l.tray;
    this.panel.clear()
      .roundRect(x, y, w, h, PANEL.radius).fill({ color: PANEL.fill, alpha: PANEL.fillAlpha })
      .roundRect(x, y, w, h, PANEL.radius)
      .stroke({ color: PANEL.border, alpha: PANEL.borderAlpha, width: 1, alignment: 1 });
    this.redraw();
  }

  setTray(t: Color[]): void {
    this.tray = [...t];
    this.redraw();
  }

  /** Center of tray slot `slot`, in canvas CSS px. */
  slotXY(slot: number): { x: number; y: number } {
    if (!this.layout) throw new Error('TrayView: setLayout before placing pieces');
    return traySlotCenter(this.layout, slot);
  }

  setSelected(slot: number | null): void {
    this.selected = slot;
    this.redraw();
  }

  setHinted(slots: number[]): void {
    this.hinted = new Set(slots);
    this.redraw();
  }

  destroy(): void {
    this.sprites.fill(null);
    this.root.destroy({ children: true });
  }

  private redraw() {
    const l = this.layout;
    if (!l) return;
    const half = l.tray.slotPx / 2;
    for (let slot = 0; slot < TRAY_CAPACITY; slot++) {
      const { x, y } = this.slotXY(slot);
      const style = this.selected === slot ? SLOT.selected : this.hinted.has(slot) ? SLOT.hinted : SLOT.empty;
      this.outlines[slot].clear()
        .roundRect(x - half, y - half, l.tray.slotPx, l.tray.slotPx, SLOT.radius)
        .stroke({ color: style.color, alpha: style.alpha, width: 1, alignment: 1 });

      const color = this.tray[slot];
      let s = this.sprites[slot];
      if (color === undefined) {
        s?.destroy();
        this.sprites[slot] = null;
        continue;
      }
      const piece = { id: slotId(slot), kind: 'gem', color, special: 'none' } as const;
      if (s) s.setPiece(piece, this.tex);
      else {
        s = new PieceSprite(piece, this.tex);
        s.setBreathing(!this.reducedMotion);
        this.sprites[slot] = s;
        this.root.addChild(s);
      }
      s.position.set(x, y);
      s.scale.set(l.tray.slotPx / l.cellPx);
      s.setSelected(this.selected === slot);
    }
  }
}
