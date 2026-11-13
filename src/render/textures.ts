// Piece and halo textures, drawn once from vector code at the device pixel ratio and rebuilt
// whenever the cell size changes (spec §6.3). Geometry and colors are copied from the reference
// art (docs/superpowers/specs/assets/voltline-pieces-reference.html, symbols v1–v9), which draws
// every glyph in a 100×100 box per cell.
import { BlurFilter, Container, FillGradient, Graphics, Rectangle } from 'pixi.js';
import type { Renderer, Texture } from 'pixi.js';
import { COLORS } from '../engine';
import type { Color, Piece } from '../engine';

/** Neon color per gem, as in the reference symbols. Also the tint for effects in that color. */
export const PIECE_COLORS: Record<Color, number> = {
  red: 0xff3b5c,
  blue: 0x4d7bff,
  yellow: 0xffe14d,
  green: 0x3bffb0,
  magenta: 0xff4fd8,
  orange: 0xff9a2e,
  cyan: 0x4de8ff,
};

/** Reference glow filters, in glyph units: `vglow` (stdDeviation 2.5 on the 100-unit symbol) and
 * `haloBig` (stdDeviation 10 on a 44-unit cell, i.e. 10/44 of a cell). */
const GLOW_SIGMA_UNITS = 2.5;
const HALO_SIGMA_CELLS = 10 / 44;
/** Std deviation of one 5-tap Pixi blur pass per unit of `strength` (from its Gaussian weights). */
const PIXI_BLUR_SIGMA_PER_STRENGTH = 1.292;

const FILL_ALPHA = 0.14;
const STROKE = 7;

export interface PieceTextures {
  readonly cellPx: number;
  /** The piece itself, `cellPx` square, centered anchor expected. */
  piece(p: Piece): Texture;
  /** Pre-blurred halo drawn behind the piece, larger than a cell; `null` for rocks. */
  halo(p: Piece): Texture | null;
  /** White ring shown around the selected piece; tint it with the piece's color. */
  readonly selectRing: Texture;
  destroy(): void;
}

type Shape = (g: Graphics) => Graphics;

/** The outline path of each gem, in 100-unit glyph space. */
const GEM_SHAPES: Record<Color, Shape> = {
  red: (g) => g.circle(50, 50, 31),
  blue: (g) => g.roundRect(21, 21, 58, 58, 8),
  yellow: (g) => g.poly([50, 15, 87, 81, 13, 81]),
  green: (g) => g.poly([50, 15, 81, 33, 81, 67, 50, 85, 19, 67, 19, 33]),
  magenta: (g) => g.poly([50, 11, 85, 50, 50, 89, 15, 50]),
  orange: (g) => g.poly([38, 15, 62, 15, 62, 38, 85, 38, 85, 62, 62, 62, 62, 85, 38, 85, 38, 62, 15, 62, 15, 38, 38, 38]),
  cyan: (g) => g.poly([50, 11, 61, 38, 89, 38, 66, 56, 75, 85, 50, 68, 25, 85, 34, 56, 11, 38, 39, 38]),
};

/** Visual center of each glyph (the triangle's sits low), for the charge ring. */
const GEM_CENTER_Y: Partial<Record<Color, number>> = { yellow: 60, cyan: 54 };

function drawGem(color: Color): Graphics {
  const c = PIECE_COLORS[color];
  const g = new Graphics();
  GEM_SHAPES[color](g)
    .fill({ color: c, alpha: FILL_ALPHA })
    .stroke({ color: c, width: color === 'cyan' ? 6 : STROKE, join: 'round' });
  return g;
}

/** Charge: a bright inner ring (it reads as stored energy; no core dot, which is the Prism's). */
function drawChargeMark(color: Color): Graphics {
  const cy = GEM_CENTER_Y[color] ?? 50;
  return new Graphics()
    .circle(50, cy, 11).fill({ color: PIECE_COLORS[color], alpha: 0.45 })
    .circle(50, cy, 11).stroke({ color: 0xffffff, width: 4 });
}

/** Arc: short crackle marks on all four edges, pointing along the row and column it will clear. */
function drawArcMarks(): Graphics {
  const g = new Graphics();
  // Kept clear of the cell edge so the glow under them isn't cut off by the texture frame.
  const zig = [6, 50, 9.5, 46, 13, 54, 16.5, 47.5, 19.5, 51];
  for (let quarter = 0; quarter < 4; quarter++) {
    const pts: number[] = [];
    for (let i = 0; i < zig.length; i += 2) {
      // Rotate the left-edge zigzag about the cell center by quarter turns.
      let x = zig[i] - 50, y = zig[i + 1] - 50;
      for (let q = 0; q < quarter; q++) [x, y] = [-y, x];
      pts.push(x + 50, y + 50);
    }
    g.poly(pts, false).stroke({ color: 0xffffff, width: 3.5, join: 'round', cap: 'round' });
  }
  return g;
}

function drawPrism(): Graphics {
  const ring = new FillGradient({
    type: 'linear', start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, textureSpace: 'local',
    colorStops: [
      { offset: 0, color: 0xff3b5c }, { offset: 0.33, color: 0xffe14d },
      { offset: 0.66, color: 0x3bffb0 }, { offset: 1, color: 0x4d7bff },
    ],
  });
  return new Graphics()
    .circle(50, 50, 29).stroke({ fill: ring, width: 11 })
    .circle(50, 50, 9).fill({ color: 0xffffff });
}

function drawRock(): Graphics {
  const g = new Graphics()
    .roundRect(19, 19, 62, 62, 6).fill({ color: 0x24242c }).stroke({ color: 0x45454f, width: 5 })
    .moveTo(35, 35).lineTo(65, 65).moveTo(65, 35).lineTo(35, 65)
    .stroke({ color: 0x52525c, width: 6, cap: 'round' });
  for (const [x, y] of [[11, 31], [11, 63], [81, 31], [81, 63]]) g.rect(x, y, 8, 6).fill({ color: 0x45454f });
  return g;
}

function drawSelectRing(): Graphics {
  return new Graphics().circle(50, 50, 44).stroke({ color: 0xffffff, width: 3.5 });
}

/** A Pixi blur matching an SVG feGaussianBlur of `sigmaPx` CSS px at render `resolution`. */
function gaussian(sigmaPx: number, resolution: number): BlurFilter {
  const strength = (sigmaPx * resolution) / PIXI_BLUR_SIGMA_PER_STRENGTH;
  // Passes halve in spacing; keep going until the finest pass samples about a pixel apart,
  // so the 5-tap kernel never leaves visible ghost copies.
  const quality = Math.min(8, Math.max(3, Math.ceil(Math.log2(Math.max(1, strength))) + 2));
  const f = new BlurFilter({ strength, quality, kernelSize: 5, resolution: 'inherit' });
  f.padding = Math.ceil(sigmaPx * 3) + 2; // full Gaussian tail, not Pixi's 2×strength default
  return f;
}

/** Wraps glyph-space art: scaled to the cell, with the reference `vglow` (blur merged under source). */
function glowing(art: Graphics[], cellPx: number, resolution: number, glow: boolean): Container {
  const scale = cellPx / 100;
  const root = new Container();
  const layer = () => {
    const c = new Container();
    for (const g of art) c.addChild(g.clone());
    c.scale.set(scale);
    return c;
  };
  if (glow) {
    const under = new Container();
    under.addChild(layer());
    under.filters = [gaussian(GLOW_SIGMA_UNITS * scale, resolution)];
    root.addChild(under);
  }
  root.addChild(layer());
  return root;
}

/** Tears down a bake scene, including its blur filters (Container.destroy leaves filters alone). */
function destroyTree(c: Container) {
  const walk = (n: Container) => {
    for (const f of n.filters ?? []) f.destroy();
    for (const child of n.children) walk(child);
  };
  walk(c);
  c.destroy({ children: true });
}

export function buildTextures(renderer: Renderer, cellPx: number, resolution: number): PieceTextures {
  const all: Texture[] = [];
  const cellFrame = new Rectangle(0, 0, cellPx, cellPx);
  const haloSigma = cellPx * HALO_SIGMA_CELLS;
  const haloPad = Math.ceil(haloSigma * 3);
  const haloFrame = new Rectangle(-haloPad, -haloPad, cellPx + 2 * haloPad, cellPx + 2 * haloPad);

  const bake = (target: Container, frame: Rectangle): Texture => {
    const t = renderer.generateTexture({ target, frame, resolution, antialias: true });
    all.push(t);
    destroyTree(target);
    return t;
  };
  const pieceTex = (art: Graphics[], glow = true) => bake(glowing(art, cellPx, resolution, glow), cellFrame);
  const haloTex = (art: Graphics[]) => {
    const wrap = new Container();
    wrap.addChild(glowing(art, cellPx, resolution, true));
    wrap.filters = [gaussian(haloSigma, resolution)];
    return bake(wrap, haloFrame);
  };

  // Source art is drawn once and cloned (sharing its geometry) into each texture's scene.
  const sources: Graphics[] = [];
  const src = (g: Graphics) => (sources.push(g), g);

  const gems = new Map<string, Texture>();
  const halos = new Map<Color | 'prism', Texture>();
  const arcMarks = src(drawArcMarks());
  for (const color of COLORS) {
    const gem = src(drawGem(color));
    gems.set(`${color}:none`, pieceTex([gem]));
    gems.set(`${color}:charge`, pieceTex([gem, src(drawChargeMark(color))]));
    gems.set(`${color}:arc`, pieceTex([gem, arcMarks]));
    halos.set(color, haloTex([gem]));
  }
  const prism = src(drawPrism());
  const prismTex = pieceTex([prism]);
  halos.set('prism', haloTex([prism]));
  const rockTex = pieceTex([src(drawRock())], false);
  const selectRing = pieceTex([src(drawSelectRing())]);
  for (const g of sources) g.destroy();

  return {
    cellPx,
    piece(p) {
      if (p.kind === 'rock') return rockTex;
      if (p.kind === 'prism') return prismTex;
      return gems.get(`${p.color}:${p.special}`)!;
    },
    halo(p) {
      if (p.kind === 'rock') return null;
      return halos.get(p.kind === 'prism' ? 'prism' : p.color)!;
    },
    selectRing,
    destroy() {
      for (const t of all) t.destroy(true);
      all.length = 0;
    },
  };
}
