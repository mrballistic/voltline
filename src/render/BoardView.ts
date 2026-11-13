// The board panel and its piece sprites. Every coordinate here (cellXY, sprite positions) is in
// canvas CSS px: `root` sits at the stage origin, so the script player, the tray and effects
// layers can all share one coordinate space.
import { Container, Graphics } from 'pixi.js';
import { BOARD_SIZE } from '../engine';
import type { Board, Piece, Pos } from '../engine';
import type { Layout } from './layout';
import { PieceSprite } from './PieceSprite';
import type { PieceTextures } from './textures';

/** Board panel look (spec §6.3, from the reference art). */
export const PANEL = { fill: 0x000000, fillAlpha: 0.4, border: 0x8ca0ff, borderAlpha: 0.14, radius: 10 } as const;

export class BoardView {
  readonly root = new Container();
  private readonly panel = new Graphics();
  private readonly pieces = new Container();
  private readonly mask = new Graphics();
  private readonly sprites = new Map<number, PieceSprite>();
  private layout: Layout | null = null;
  private tex: PieceTextures;
  private readonly reducedMotion: boolean;

  constructor(tex: PieceTextures, reducedMotion: boolean) {
    this.tex = tex;
    this.reducedMotion = reducedMotion;
    // Pieces above row 0 (refills waiting to fall) are hidden by the mask.
    this.pieces.mask = this.mask;
    this.root.addChild(this.panel, this.pieces, this.mask);
  }

  setLayout(l: Layout, tex: PieceTextures): void {
    const old = this.layout;
    this.layout = l;
    this.tex = tex;
    const { x, y, size } = l.board;
    this.panel.clear()
      .roundRect(x, y, size, size, PANEL.radius).fill({ color: PANEL.fill, alpha: PANEL.fillAlpha })
      .roundRect(x, y, size, size, PANEL.radius)
      .stroke({ color: PANEL.border, alpha: PANEL.borderAlpha, width: 1, alignment: 1 });
    this.mask.clear().roundRect(x, y, size, size, PANEL.radius).fill({ color: 0xffffff });
    // Keep every sprite where it was relative to the board, mid-animation or not.
    const k = old ? l.cellPx / old.cellPx : 1;
    for (const s of this.sprites.values()) {
      s.setPiece(s.piece, tex);
      if (old) s.position.set(x + (s.x - old.board.x) * k, y + (s.y - old.board.y) * k);
    }
  }

  /** Center of cell (row, col); rows < 0 are above the board, where refills start. */
  cellXY(row: number, col: number): { x: number; y: number } {
    const l = this.need();
    return { x: l.board.x + (col + 0.5) * l.cellPx, y: l.board.y + (row + 0.5) * l.cellPx };
  }

  /** Cell size in CSS px. */
  get cellPx(): number {
    return this.need().cellPx;
  }

  /** The cell under canvas point (x, y), or null off the board. */
  cellAt(x: number, y: number): Pos | null {
    const l = this.layout;
    if (!l) return null;
    const col = Math.floor((x - l.board.x) / l.cellPx);
    const row = Math.floor((y - l.board.y) / l.cellPx);
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE ? { row, col } : null;
  }

  sprite(id: number): PieceSprite | undefined {
    return this.sprites.get(id);
  }

  /** Every live piece sprite, in no particular order. */
  allSprites(): PieceSprite[] {
    return [...this.sprites.values()];
  }

  /** Gives sprite `id` a new look (a match made it a special) without moving it. */
  restyle(id: number, p: Piece): PieceSprite | undefined {
    const s = this.sprites.get(id);
    s?.setPiece(p, this.tex);
    return s;
  }

  /** Shows `b` as is: reuses sprites by id, creates missing ones, releases the rest. */
  setBoard(b: Board): void {
    this.snapToModel(b);
  }

  /** Puts every sprite exactly on its model cell at rest, with its current look (after morphs). */
  snapToModel(b: Board): void {
    const seen = new Set<number>();
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const p = b[row][col];
        if (!p) continue;
        seen.add(p.id);
        const s = this.sprites.get(p.id);
        if (!s) {
          this.adopt(p, row, col);
          continue;
        }
        s.setPiece(p, this.tex);
        const { x, y } = this.cellXY(row, col);
        s.position.set(x, y);
        s.scale.set(1);
        s.rotation = 0;
        s.alpha = 1;
        s.visible = true;
      }
    }
    for (const id of [...this.sprites.keys()]) if (!seen.has(id)) this.release(id);
  }

  /** Creates (or reuses) the sprite for `p` and places it at (row, col). */
  adopt(p: Piece, row: number, col: number): PieceSprite {
    let s = this.sprites.get(p.id);
    if (s) s.setPiece(p, this.tex);
    else {
      s = new PieceSprite(p, this.tex);
      s.setBreathing(!this.reducedMotion);
      this.sprites.set(p.id, s);
      this.pieces.addChild(s);
    }
    const { x, y } = this.cellXY(row, col);
    s.position.set(x, y);
    return s;
  }

  release(id: number): void {
    const s = this.sprites.get(id);
    if (!s) return;
    this.sprites.delete(id);
    s.destroy();
  }

  destroy(): void {
    this.sprites.clear();
    this.root.destroy({ children: true });
  }

  private need(): Layout {
    if (!this.layout) throw new Error('BoardView: setLayout before placing pieces');
    return this.layout;
  }
}
