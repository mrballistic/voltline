// The board's explosions (spec §6.2): pop sparks, the Charge shockwave, Arc beams, Prism lightning,
// the supernova, the flare when a special is made, and screen shake.
//
// Everything here is fire-and-forget. The script player calls in from its timeline and never
// waits: `blast` returns a promise only so a caller *can* know when the visuals are gone.
// Every sprite comes from a fixed pool made up front (sparks, decals, bolts), so nothing is
// allocated per frame and a supernova can't flood the stage; when a pool runs dry the extra is
// simply not drawn. All of it is additive, so overlapping light burns toward white.
//
// Motion runs on GSAP tweens, so it shares the board's clock (Pixi's ticker drives GSAP) and
// slows with the global time scale in slow-motion captures.
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { BOARD_SIZE, COLORS } from '../engine';
import type { Blast } from '../engine';
import type { Effects } from '../app/ports';
import { ANIM } from './constants';
import type { PieceSprite } from './PieceSprite';
import { PIECE_COLORS, effectColor } from './textures';

const FX = ANIM.fx;
const S = (ms: number) => ms / 1000;
type XY = { x: number; y: number };
type CellXY = (r: number, c: number) => XY;

/** Electric white-blue for colorless blasts (Charge, Arc) and bolt cores. */
const ELECTRIC = 0x9fdcff;
const WHITE = 0xffffff;
const RAINBOW = COLORS.map((c) => PIECE_COLORS[c]);

/** Soft white textures, tinted per use. All centered (anchor 0.5) except where noted. */
export interface EffectTextures {
  /** Round spark with a hot core; stretched along its velocity into a streak. */
  spark: Texture;
  /** Soft radial glow. */
  glow: Texture;
  /** A bright ring with soft edges, empty in the middle. */
  ring: Texture;
  /** A horizontal beam: uniform along x, a bright line with soft falloff across y. */
  beam: Texture;
  /** A soft-edged rounded square, for cell and board flashes; its bright core spans FLASH_CORE of it. */
  flash: Texture;
  destroy(): void;
}

/** Share of the flash texture's width that is its bright, flat core. */
const FLASH_CORE = 0.7;

export interface PixiEffectsOptions {
  /** Board cell size in CSS px, read at each effect (it changes on resize). */
  cellPx?: () => number;
  /** Injected in tests; drawn on a 2D canvas by default. */
  textures?: EffectTextures;
  random?: () => number;
}

/** Halfway from `c` to white, per channel. */
function whiter(c: number): number {
  const ch = (shift: number) => (((c >> shift) & 0xff) + 255) >> 1;
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** A fixed set of display objects; `take` hands out the next free one in turn, or null. */
class Pool<T extends Sprite | Graphics> {
  readonly items: T[] = [];
  private readonly free: boolean[] = [];
  private readonly index = new Map<T, number>();
  private cursor = 0;

  constructor(readonly root: Container, n: number, make: () => T) {
    for (let i = 0; i < n; i++) {
      const it = make();
      it.visible = false;
      it.blendMode = 'add';
      this.index.set(it, this.items.length);
      this.items.push(it);
      this.free.push(true);
      root.addChild(it);
    }
  }

  take(): T | null {
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      const i = (this.cursor + k) % n;
      if (!this.free[i]) continue;
      this.free[i] = false;
      this.cursor = (i + 1) % n;
      const it = this.items[i];
      it.visible = true;
      it.alpha = 1;
      it.rotation = 0;
      return it;
    }
    return null;
  }

  give(it: T): void {
    const i = this.index.get(it);
    if (i === undefined || this.free[i]) return;
    this.free[i] = true;
    it.visible = false;
    if (it instanceof Graphics) it.clear();
  }

  reset(): void {
    for (const it of this.items) this.give(it);
  }
}

export class PixiEffects implements Effects {
  private readonly layer: Container;
  private readonly stage: Container;
  private readonly reducedMotion: boolean;
  private readonly cellPx: () => number;
  private readonly rand: () => number;
  private readonly tex: EffectTextures;
  private readonly decalRoot = new Container();
  private readonly boltRoot = new Container();
  private readonly sparkRoot = new Container();
  private readonly sparks: Pool<Sprite>;
  private readonly decals: Pool<Sprite>;
  private readonly bolts: Pool<Graphics>;
  private readonly live = new Set<gsap.core.Animation>();
  private readonly pending = new Set<() => void>();
  private shaking: { tween: gsap.core.Tween; base: XY } | null = null;
  private destroyed = false;

  constructor(layer: Container, stage: Container, reducedMotion: boolean, opts: PixiEffectsOptions = {}) {
    this.layer = layer;
    this.stage = stage;
    this.reducedMotion = reducedMotion;
    this.cellPx = opts.cellPx ?? (() => 48);
    this.rand = opts.random ?? Math.random;
    this.tex = opts.textures ?? canvasEffectTextures();
    this.sparks = new Pool(this.sparkRoot, FX.sparkPool, () => centered(new Sprite(this.tex.spark)));
    this.decals = new Pool(this.decalRoot, FX.decalPool, () => centered(new Sprite(this.tex.glow)));
    this.bolts = new Pool(this.boltRoot, FX.boltPool, () => new Graphics());
    layer.addChild(this.decalRoot, this.boltRoot, this.sparkRoot);
  }

  /** The pooled display objects, for tests and the dev frame check. */
  pools(): { sparks: Sprite[]; decals: Sprite[]; bolts: Graphics[] } {
    return { sparks: this.sparks.items, decals: this.decals.items, bolts: this.bolts.items };
  }

  pop(at: XY, color: number): void {
    if (this.destroyed) return;
    const [lo, hi] = ANIM.sparks;
    let n = lo + Math.floor(this.rand() * (hi - lo + 1));
    if (this.reducedMotion) n = Math.round(n / 2);
    this.burst(at, n, () => color, 1);
  }

  blast(b: Blast, cellXY: CellXY): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        this.pending.delete(done);
        resolve();
      };
      this.pending.add(done);
      const tl = this.timeline(done);
      switch (b.kind) {
        case 'charge': this.charge(tl, b, cellXY); break;
        case 'arc': this.arc(tl, b, cellXY); break;
        case 'prism': this.prism(tl, b, cellXY, () => (b.color ? effectColor(b.color) : WHITE)); break;
        case 'supernova': this.supernova(tl, b, cellXY); break;
      }
    });
  }

  shake(px: number, ms: number): void {
    if (this.destroyed || this.reducedMotion || px <= 0 || ms <= 0) return;
    const base = this.shaking ? this.shaking.base : { x: this.stage.x, y: this.stage.y };
    this.stopShake();
    const q = { k: 0 };
    const tween = gsap.to(q, {
      k: 1, duration: S(ms), ease: 'none',
      onUpdate: () => {
        const a = px * (1 - q.k);
        this.stage.position.set(base.x + (this.rand() * 2 - 1) * a, base.y + (this.rand() * 2 - 1) * a);
      },
      onComplete: () => this.stopShake(),
    });
    this.shaking = { tween, base };
  }

  morph(sprite: PieceSprite): void {
    if (this.destroyed) return;
    const p = sprite.piece;
    const color = p.kind === 'gem' ? PIECE_COLORS[p.color] : WHITE;
    const at = { x: sprite.x, y: sprite.y };
    const cell = this.cellPx();
    const tl = this.timeline();
    this.grow(tl, this.tex.ring, at, color, 0, FX.morphRingMs, 0.6 * cell, 1.7 * cell, 1);
    this.grow(tl, this.tex.glow, at, color, 0, FX.morphRingMs, 1.6 * cell, 1.1 * cell, 0.8);
    const n = this.reducedMotion ? Math.round(FX.morphSparks / 2) : FX.morphSparks;
    this.burst(at, n, p.kind === 'prism' ? () => RAINBOW[Math.floor(this.rand() * RAINBOW.length)] : () => color, 0.8);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopShake();
    for (const a of this.live) a.kill();
    this.live.clear();
    for (const done of [...this.pending]) done();
    this.layer.removeChild(this.decalRoot, this.boltRoot, this.sparkRoot);
    for (const root of [this.decalRoot, this.boltRoot, this.sparkRoot]) root.destroy({ children: true });
    this.tex.destroy();
  }

  // --- blasts ---

  private charge(tl: gsap.core.Timeline, b: Blast, cellXY: CellXY): void {
    const at = cellXY(b.at.row, b.at.col);
    const cell = this.cellPx();
    // A rock line's Charge is tinted rock gray; a gem Charge is electric.
    const tint = b.color ? effectColor(b.color) : ELECTRIC;
    // The 3×3 flash, a hot core, then two shockwave rings racing out past it.
    this.grow(tl, this.tex.flash, at, tint, 0, FX.chargeFlashMs, (3 * cell) / FLASH_CORE, (3 * cell) / FLASH_CORE, 0.6, 4);
    this.grow(tl, this.tex.glow, at, WHITE, 0, FX.chargeFlashMs, 2.4 * cell, 1.2 * cell, 0.9);
    this.grow(tl, this.tex.ring, at, tint, 0, FX.chargeRingMs, 0.4 * cell, 2 * FX.chargeRingCells * cell, 1);
    this.grow(tl, this.tex.ring, at, WHITE, FX.chargeRingMs / 6, FX.chargeRingMs * 0.8, 0.3 * cell, 1.4 * FX.chargeRingCells * cell, 0.7);
    tl.call(() => this.burst(at, this.sparkCount(FX.chargeSparks), () => (this.rand() < 0.5 ? WHITE : tint), 1.6), undefined, 0);
    // Short lightning crackles out of the core.
    for (let i = 0; i < FX.chargeCrackles; i++) {
      const a = ((i + this.rand() * 0.6) / FX.chargeCrackles) * Math.PI * 2;
      const d = (1.1 + 0.7 * this.rand()) * cell;
      this.bolt(at, { x: at.x + Math.cos(a) * d, y: at.y + Math.sin(a) * d }, tint);
    }
  }

  private arc(tl: gsap.core.Timeline, b: Blast, cellXY: CellXY): void {
    const { row, col } = b.at;
    const at = cellXY(row, col);
    const cell = this.cellPx();
    const edge = {
      left: cellXY(row, -0.5).x, right: cellXY(row, BOARD_SIZE - 0.5).x,
      top: cellXY(-0.5, col).y, bottom: cellXY(BOARD_SIZE - 0.5, col).y,
    };
    // Four half-beams from the Arc to each board edge, all at one speed, the longest arriving at arcBeamMs.
    const halves = [
      { len: at.x - edge.left, rot: Math.PI }, { len: edge.right - at.x, rot: 0 },
      { len: at.y - edge.top, rot: -Math.PI / 2 }, { len: edge.bottom - at.y, rot: Math.PI / 2 },
    ].filter((h) => h.len > 0);
    const speed = Math.max(...halves.map((h) => h.len)) / S(ANIM.arcBeamMs);
    const parts = halves.map((h) => ({
      h,
      glow: this.beamPart(h.rot, ELECTRIC, at),
      core: this.beamPart(h.rot, WHITE, at),
      head: this.decal(this.tex.glow, at, WHITE),
    }));
    const center = this.decal(this.tex.glow, at, WHITE);
    const q = { t: 0, fade: 1 };
    const total = S(ANIM.arcBeamMs + FX.arcFadeMs);
    const thick = FX.arcBeamCells * cell;
    const apply = () => {
      const f = q.t < S(ANIM.arcBeamMs) ? 1 : 1 - (q.t - S(ANIM.arcBeamMs)) / S(FX.arcFadeMs);
      for (const p of parts) {
        const len = Math.min(p.h.len, speed * q.t);
        if (p.glow) size(p.glow, len, thick * (0.6 + 0.4 * f), 0.85 * f);
        if (p.core) size(p.core, len, thick * 0.28 * f, f);
        if (p.head) {
          p.head.position.set(at.x + Math.cos(p.h.rot) * len, at.y + Math.sin(p.h.rot) * len);
          const reaching = len < p.h.len ? 1 : f;
          square(p.head, 1.1 * cell * reaching, reaching);
        }
      }
      if (center) square(center, 1.8 * cell, f);
    };
    apply();
    tl.to(q, { t: total, duration: total, ease: 'none', onUpdate: apply }, 0);
    tl.call(() => {
      for (const p of parts) for (const s of [p.glow, p.core, p.head]) if (s) this.decals.give(s);
      if (center) this.decals.give(center);
    }, undefined, total);
    tl.call(() => this.burst(at, this.sparkCount(FX.chargeSparks), () => (this.rand() < 0.5 ? WHITE : ELECTRIC), 1.4), undefined, 0);
  }

  private beamPart(rot: number, tint: number, at: XY): Sprite | null {
    const s = this.decal(this.tex.beam, at, tint);
    if (!s) return null;
    s.anchor.set(0, 0.5);
    s.rotation = rot;
    return s;
  }

  /** Bolts from the blast's cell to each of its cells, `prismBoltStaggerMs` apart. */
  private prism(tl: gsap.core.Timeline, b: Blast, cellXY: CellXY, colorOf: (i: number) => number): void {
    const at = cellXY(b.at.row, b.at.col);
    const cell = this.cellPx();
    const span = Math.max(1, b.cells.length) * ANIM.prismBoltStaggerMs;
    // The source pulses for as long as it throws bolts.
    this.grow(tl, this.tex.glow, at, WHITE, 0, span + FX.boltMs, 2 * cell, 1.4 * cell, 1);
    this.grow(tl, this.tex.ring, at, colorOf(0), 0, FX.chargeRingMs, 0.4 * cell, 2.4 * cell, 0.8);
    b.cells.forEach((c, i) => {
      const to = cellXY(c.row, c.col);
      const at0 = S(i * ANIM.prismBoltStaggerMs);
      tl.call(() => this.bolt(at, to, colorOf(i), FX.prismBoltWeight), undefined, at0);
      this.grow(tl, this.tex.glow, to, colorOf(i), i * ANIM.prismBoltStaggerMs, FX.boltMs, 1.4 * cell, 0.6 * cell, 1);
    });
    tl.set({}, {}, S(span + FX.boltMs));
  }

  private supernova(tl: gsap.core.Timeline, b: Blast, cellXY: CellXY): void {
    const at = cellXY(b.at.row, b.at.col);
    const cell = this.cellPx();
    const boardCenter = cellXY((BOARD_SIZE - 1) / 2, (BOARD_SIZE - 1) / 2);
    const boardPx = (BOARD_SIZE * cell) / FLASH_CORE;
    const span = Math.max(1, b.cells.length) * ANIM.prismBoltStaggerMs;
    // Whole-board flash on detonation and again as the last bolt lands, a big shockwave between.
    this.grow(tl, this.tex.flash, boardCenter, WHITE, 0, FX.novaFlashMs, boardPx, boardPx, 0.6, 3);
    this.grow(tl, this.tex.ring, at, ELECTRIC, 0, FX.novaFlashMs * 1.4, 0.5 * cell, 2 * FX.novaRingCells * cell, 0.8);
    this.grow(tl, this.tex.ring, at, RAINBOW[4], FX.novaFlashMs / 4, FX.novaFlashMs * 1.4, 0.4 * cell, 1.6 * FX.novaRingCells * cell, 0.6);
    this.prism(tl, b, cellXY, (i) => RAINBOW[i % RAINBOW.length]);
    this.grow(tl, this.tex.flash, boardCenter, WHITE, span, FX.novaFlashMs, boardPx, boardPx, 0.7, 3);
    tl.call(() => this.burst(at, this.sparkCount(2 * FX.chargeSparks), () => RAINBOW[Math.floor(this.rand() * RAINBOW.length)], 2.2), undefined, 0);
  }

  /** One lightning bolt: a jagged glow stroke plus a white core, re-jagged as it flickers out; `weight` scales its width. */
  private bolt(from: XY, to: XY, color: number, weight = 1): void {
    if (this.destroyed) return;
    const g = this.bolts.take();
    if (!g) return;
    const cell = this.cellPx();
    const w = weight * cell;
    const draw = () => {
      g.clear();
      const pts = this.jag(from, to, cell);
      const path = () => {
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      };
      path();
      g.stroke({ width: 0.16 * w, color, alpha: 0.28, cap: 'round', join: 'round' });
      path();
      g.stroke({ width: 0.06 * w, color, alpha: 0.9, cap: 'round', join: 'round' });
      path();
      g.stroke({ width: 0.022 * w, color: WHITE, alpha: 1, cap: 'round', join: 'round' });
    };
    draw();
    const q = { k: 0 };
    let jags = 0;
    // Its own tween, not the blast timeline's: the timeline only fires it.
    const tween = gsap.to(q, {
      k: 1, duration: S(FX.boltMs), ease: 'power2.in',
      onUpdate: () => {
        const due = Math.floor(q.k * (FX.boltRejags + 1));
        if (due > jags) { jags = due; draw(); }
        g.alpha = 1 - q.k;
      },
      onComplete: () => {
        this.live.delete(tween);
        this.bolts.give(g);
      },
    });
    this.live.add(tween);
  }

  /** A jagged path from `a` to `b`, offset across the line, pinned at both ends. */
  private jag(a: XY, b: XY, cell: number): XY[] {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const n = Math.max(5, Math.round(len / (0.28 * cell)));
    const pts: XY[] = [a];
    for (let i = 1; i < n; i++) {
      const k = i / n;
      const off = (this.rand() * 2 - 1) * FX.boltJitterCells * cell * Math.min(1, 2.5 * Math.sin(Math.PI * k));
      pts.push({ x: a.x + dx * k + nx * off, y: a.y + dy * k + ny * off });
    }
    pts.push(b);
    return pts;
  }

  // --- building blocks ---

  private sparkCount(n: number): number {
    return this.reducedMotion ? Math.round(n / 2) : n;
  }

  /** A timeline that removes itself (and calls `done`) when it ends, and is killed on destroy. */
  private timeline(done?: () => void): gsap.core.Timeline {
    const tl = gsap.timeline({
      onComplete: () => {
        this.live.delete(tl);
        done?.();
      },
    });
    this.live.add(tl);
    return tl;
  }

  private decal(texture: Texture, at: XY, tint: number): Sprite | null {
    const s = this.decals.take();
    if (!s) return null;
    s.texture = texture;
    s.anchor.set(0.5);
    s.tint = tint;
    s.position.set(at.x, at.y);
    s.scale.set(0);
    return s;
  }

  /**
   * A decal that scales from `d0` to `d1` px across and fades from `alpha` to 0 over `ms`, from
   * `delayMs`; a higher `falloff` makes it a sharper flash.
   */
  private grow(tl: gsap.core.Timeline, texture: Texture, at: XY, tint: number, delayMs: number, ms: number,
    d0: number, d1: number, alpha: number, falloff = 1.6): void {
    let s: Sprite | null = null;
    const q = { k: 0 };
    const apply = () => {
      if (!s) return;
      const e = 1 - (1 - q.k) ** 3; // power3.out on size
      square(s, d0 + (d1 - d0) * e, alpha * (1 - q.k) ** falloff);
    };
    const start = () => {
      s = this.decal(texture, at, tint);
      apply();
    };
    if (delayMs <= 0) start();
    tl.to(q, {
      k: 1, duration: S(ms), ease: 'none',
      onStart: () => { if (!s) start(); },
      onUpdate: apply,
      onComplete: () => {
        if (s) this.decals.give(s);
        s = null;
      },
    }, S(Math.max(0, delayMs)));
  }

  /**
   * `n` sparks flying out of `at` with drag and a little gravity, each a streak along its
   * velocity that shrinks and fades. Positions are closed-form in time, so a slow frame never
   * throws one off course.
   */
  private burst(at: XY, n: number, colorOf: () => number, speedK: number): void {
    const cell = this.cellPx();
    const k = FX.sparkDrag;
    const g = FX.sparkGravity * cell;
    const [life0, life1] = FX.sparkLifeMs;
    const [v0, v1] = FX.sparkSpeed;
    const parts: { s: Sprite; vx: number; vy: number; life: number; size: number }[] = [];
    for (let i = 0; i < n; i++) {
      const s = this.sparks.take();
      if (!s) break;
      const angle = this.rand() * Math.PI * 2;
      const v = (v0 + this.rand() * (v1 - v0)) * speedK * cell;
      const c = colorOf();
      s.tint = this.rand() < FX.sparkWhiteShare ? whiter(c) : c;
      s.position.set(at.x, at.y);
      parts.push({
        s, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
        life: S(life0 + this.rand() * (life1 - life0)),
        size: FX.sparkSize * cell * (0.7 + 0.6 * this.rand()),
      });
    }
    if (parts.length === 0) return;
    const tw = this.sparks.items[0].texture.width || 1;
    const maxLife = Math.max(...parts.map((p) => p.life));
    const q = { t: 0 };
    const apply = () => {
      const t = q.t;
      const e = Math.exp(-k * t);
      const f = (1 - e) / k;
      for (const p of parts) {
        if (!p.s.visible) continue;
        const u = t / p.life;
        if (u >= 1) {
          this.sparks.give(p.s);
          continue;
        }
        const vyt = (p.vy + g / k) * e - g / k;
        const vxt = p.vx * e;
        p.s.position.set(at.x + p.vx * f, at.y + (p.vy + g / k) * f - (g * t) / k);
        p.s.rotation = Math.atan2(vyt, vxt);
        const w = p.size * (1 - 0.5 * u);
        const len = w * (1 + (FX.sparkStretch * Math.hypot(vxt, vyt)) / cell);
        p.s.scale.set(len / tw, w / tw);
        p.s.alpha = (1 - u) ** 1.5;
      }
    };
    apply();
    const tween = gsap.to(q, {
      t: maxLife, duration: maxLife, ease: 'none', onUpdate: apply,
      onComplete: () => {
        this.live.delete(tween);
        for (const p of parts) this.sparks.give(p.s);
      },
    });
    this.live.add(tween);
  }

  private stopShake(): void {
    const sh = this.shaking;
    if (!sh) return;
    this.shaking = null;
    sh.tween.kill();
    this.stage.position.set(sh.base.x, sh.base.y);
  }
}

function centered(s: Sprite): Sprite {
  s.anchor.set(0.5);
  return s;
}

/** Sizes a decal `d` px across (on its texture's larger side) at `alpha`. */
function square(s: Sprite, d: number, alpha: number): void {
  const tw = s.texture.width || 1;
  s.scale.set(Math.max(0, d) / tw);
  s.alpha = Math.max(0, alpha);
}

/** Sizes a beam `len` px long and `thick` px across. */
function size(s: Sprite, len: number, thick: number, alpha: number): void {
  s.scale.set(Math.max(0, len) / (s.texture.width || 1), Math.max(0, thick) / (s.texture.height || 1));
  s.alpha = Math.max(0, alpha);
}

/** Draws the effect textures once on a 2D canvas (soft white shapes, tinted per use). */
export function canvasEffectTextures(): EffectTextures {
  const made: Texture[] = [];
  const draw = (w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): Texture => {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    if (ctx) paint(ctx);
    const t = Texture.from(cv);
    made.push(t);
    return t;
  };
  const radial = (n: number, stops: [number, number][]) => draw(n, n, (ctx) => {
    const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    for (const [at, a] of stops) g.addColorStop(at, `rgba(255,255,255,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, n, n);
  });
  return {
    spark: radial(64, [[0, 1], [0.18, 1], [0.42, 0.4], [0.7, 0.08], [1, 0]]),
    glow: radial(128, [[0, 1], [0.22, 0.6], [0.5, 0.18], [0.75, 0.04], [1, 0]]),
    ring: radial(256, [[0, 0], [0.55, 0], [0.72, 0.25], [0.84, 1], [0.9, 0.45], [1, 0]]),
    beam: draw(16, 64, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 64);
      for (const [at, a] of [[0, 0], [0.3, 0.12], [0.44, 0.55], [0.5, 1], [0.56, 0.55], [0.7, 0.12], [1, 0]] as const) {
        g.addColorStop(at, `rgba(255,255,255,${a})`);
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 16, 64);
    }),
    flash: draw(128, 128, (ctx) => {
      // Core spans FLASH_CORE of the texture; the blur fades it out to the edge.
      const inset = (128 * (1 - FLASH_CORE)) / 2;
      ctx.shadowColor = 'rgba(255,255,255,1)';
      ctx.shadowBlur = inset * 1.3;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.roundRect(inset, inset, 128 - 2 * inset, 128 - 2 * inset, 14);
      ctx.fill();
    }),
    destroy() {
      for (const t of made) t.destroy(true);
      made.length = 0;
    },
  };
}
