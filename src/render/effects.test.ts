import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { gsap } from 'gsap';
import type { Blast, BlastKind, Pos } from '../engine';
import { ANIM } from './constants';
import { PixiEffects, type EffectTextures } from './effects';
import { PieceSprite } from './PieceSprite';
import { effectColor } from './textures';
import type { PieceTextures } from './textures';

const FRAME_MS = 1000 / 60;
const CELL = 60;
const ORIGIN = { x: 100, y: 50 };
const cellXY = (r: number, c: number) => ({ x: ORIGIN.x + (c + 0.5) * CELL, y: ORIGIN.y + (r + 0.5) * CELL });

const stubTextures = (): EffectTextures => ({
  spark: Texture.WHITE, glow: Texture.WHITE, ring: Texture.WHITE, beam: Texture.WHITE, flash: Texture.WHITE, destroy() {},
});

let now = 0;
beforeAll(() => {
  gsap.ticker.remove(gsap.updateRoot);
  now = gsap.globalTimeline.time();
});
afterAll(() => gsap.ticker.add(gsap.updateRoot));
const frame = () => {
  now += FRAME_MS / 1000;
  gsap.updateRoot(now);
};
const frames = (ms: number) => { for (let i = 0; i < Math.ceil(ms / FRAME_MS); i++) frame(); };

function rig(reducedMotion = false) {
  const layer = new Container();
  const stage = new Container();
  const fx = new PixiEffects(layer, stage, reducedMotion, { cellPx: () => CELL, textures: stubTextures() });
  const sprites = () => fx.pools().sparks;
  const sparks = () => sprites().filter((s) => s.visible);
  const decals = () => fx.pools().decals.filter((s) => s.visible);
  const bolts = () => fx.pools().bolts.filter((g) => g.visible);
  return { layer, stage, fx, sparks, decals, bolts, sprites };
}

const blast = (kind: BlastKind, at: Pos, cells: Pos[]): Blast => ({ kind, at, cells, order: 0 });
const row = (r: number) => Array.from({ length: 8 }, (_, c) => ({ row: r, col: c }));

async function settle(p: Promise<void>, maxMs = 5000): Promise<boolean> {
  let done = false;
  void p.then(() => { done = true; });
  for (let t = 0; t < maxMs && !done; t += FRAME_MS) {
    frame();
    await Promise.resolve();
  }
  return done;
}

describe('PixiEffects', () => {
  let r: ReturnType<typeof rig>;
  beforeEach(() => { r = rig(); });

  it('a pop bursts ANIM.sparks additive sparks in the piece color', () => {
    for (let i = 0; i < 20; i++) {
      const fresh = rig();
      fresh.fx.pop({ x: 200, y: 200 }, 0xff3b5c);
      const live = fresh.sparks();
      expect(live.length).toBeGreaterThanOrEqual(ANIM.sparks[0]);
      expect(live.length).toBeLessThanOrEqual(ANIM.sparks[1]);
      for (const s of live) {
        expect(s.blendMode).toBe('add');
        // The piece color, or that color half-way to white for a hot core.
        expect([0xff3b5c, 0xff9dad]).toContain(s.tint);
      }
      fresh.fx.destroy();
    }
  });

  it('sparks come from a fixed pool that never grows, and go back to it when they fade', () => {
    const pool = r.sprites().length;
    expect(pool).toBe(ANIM.fx.sparkPool);
    for (let i = 0; i < 200; i++) r.fx.pop({ x: 200, y: 200 }, 0x4de8ff);
    expect(r.sprites()).toHaveLength(pool);
    expect(r.sparks().length).toBeLessThanOrEqual(pool);
    frames(ANIM.fx.sparkLifeMs[1] + 50);
    expect(r.sparks()).toHaveLength(0);
    r.fx.pop({ x: 200, y: 200 }, 0x4de8ff);
    expect(r.sparks().length).toBeGreaterThanOrEqual(ANIM.sparks[0]);
  });

  it('sparks fly outward from the pop and fade', () => {
    r.fx.pop({ x: 200, y: 200 }, 0x4de8ff);
    const live = r.sparks();
    frames(120);
    for (const s of live) {
      expect(Math.hypot(s.x - 200, s.y - 200)).toBeGreaterThan(0.1 * CELL);
      expect(s.alpha).toBeLessThan(1);
    }
  });

  it('reduced motion halves the sparks and never shakes', () => {
    const rm = rig(true);
    for (let i = 0; i < 20; i++) {
      rm.fx.pop({ x: 200, y: 200 }, 0xff3b5c);
      const n = rm.sparks().length;
      expect(n).toBeGreaterThanOrEqual(Math.round(ANIM.sparks[0] / 2));
      expect(n).toBeLessThanOrEqual(Math.round(ANIM.sparks[1] / 2));
      frames(ANIM.fx.sparkLifeMs[1] + 50);
    }
    rm.fx.shake(5, 200);
    for (let t = 0; t < 250; t += FRAME_MS) {
      frame();
      expect(rm.stage.position.x).toBe(0);
      expect(rm.stage.position.y).toBe(0);
    }
  });

  it('shake jitters the stage within its amplitude, then puts it back', () => {
    r.stage.position.set(4, 7);
    r.fx.shake(3, 150);
    let moved = false;
    for (let t = 0; t < 200; t += FRAME_MS) {
      frame();
      const dx = r.stage.x - 4;
      const dy = r.stage.y - 7;
      if (dx !== 0 || dy !== 0) moved = true;
      expect(Math.abs(dx)).toBeLessThanOrEqual(3);
      expect(Math.abs(dy)).toBeLessThanOrEqual(3);
    }
    expect(moved).toBe(true);
    expect(r.stage.x).toBe(4);
    expect(r.stage.y).toBe(7);
  });

  it('a second shake while one runs restarts from the rest position', () => {
    r.fx.shake(3, 150);
    frames(50);
    r.fx.shake(3, 150);
    frames(200);
    expect(r.stage.x).toBe(0);
    expect(r.stage.y).toBe(0);
  });

  it('every blast kind resolves and leaves nothing behind, even with no cells of its own', async () => {
    const cases: Blast[] = [
      blast('charge', { row: 3, col: 3 }, [{ row: 2, col: 2 }, { row: 3, col: 3 }]),
      blast('charge', { row: 0, col: 0 }, []),
      blast('arc', { row: 4, col: 2 }, row(4)),
      blast('arc', { row: 7, col: 7 }, []),
      { ...blast('prism', { row: 3, col: 3 }, row(5)), color: 'cyan' },
      { ...blast('prism', { row: 3, col: 3 }, row(2)), color: 'rock' },
      blast('prism', { row: 3, col: 3 }, []),
      blast('supernova', { row: 3, col: 4 }, [...row(0), ...row(7)]),
      blast('supernova', { row: 3, col: 4 }, []),
    ];
    for (const b of cases) {
      const p = r.fx.blast(b, cellXY);
      expect(r.decals().length + r.bolts().length, b.kind).toBeGreaterThan(0);
      expect(await settle(p), b.kind).toBe(true);
      frames(ANIM.fx.sparkLifeMs[1] + 50);
      expect(r.decals(), b.kind).toHaveLength(0);
      expect(r.bolts(), b.kind).toHaveLength(0);
      expect(r.sparks(), b.kind).toHaveLength(0);
    }
  });

  it('a charge draws an expanding shockwave ring and a 3×3 flash', () => {
    r.fx.blast(blast('charge', { row: 3, col: 3 }, []), cellXY);
    frame();
    const live = r.decals();
    const w0 = new Map(live.map((s) => [s, s.width]));
    // The flash covers the 3×3 from the start.
    expect(Math.max(...w0.values())).toBeGreaterThanOrEqual(3 * CELL);
    frames(ANIM.fx.chargeRingMs / 2);
    // The ring grows from small to well past one cell across.
    expect(live.some((s) => w0.get(s)! < CELL && s.width > 2 * CELL)).toBe(true);
    const { x, y } = cellXY(3, 3);
    for (const s of r.decals()) {
      expect(s.x).toBeCloseTo(x, 0);
      expect(s.y).toBeCloseTo(y, 0);
    }
  });

  it('an arc sweeps beams along its row and column, reaching the board edges by arcBeamMs', () => {
    r.fx.blast(blast('arc', { row: 4, col: 2 }, row(4)), cellXY);
    frame();
    const extent = () => {
      const ds = r.decals();
      const xs = ds.flatMap((s) => { const b = s.getBounds(); return [b.minX, b.maxX]; });
      const ys = ds.flatMap((s) => { const b = s.getBounds(); return [b.minY, b.maxY]; });
      return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    };
    const early = extent();
    frames(ANIM.arcBeamMs);
    const full = extent();
    expect(full.w).toBeGreaterThan(early.w);
    expect(full.w).toBeGreaterThanOrEqual(8 * CELL - 1);
    expect(full.h).toBeGreaterThanOrEqual(8 * CELL - 1);
  });

  it('a prism throws one bolt per target, prismBoltStaggerMs apart', () => {
    const targets = row(6);
    r.fx.blast({ ...blast('prism', { row: 1, col: 1 }, targets), color: 'green' }, cellXY);
    const started = new Set<Graphics>();
    const seen: number[] = [];
    for (let t = 0; t <= targets.length * ANIM.prismBoltStaggerMs; t += FRAME_MS) {
      for (const g of r.bolts()) started.add(g);
      seen.push(started.size);
      frame();
    }
    // Bolts arrive over time, not at once, and every target gets one.
    expect(seen[0]).toBeLessThanOrEqual(2);
    expect(started.size).toBeGreaterThanOrEqual(Math.min(targets.length, ANIM.fx.boltPool) - 1);
    const at = (ms: number) => seen[Math.floor(ms / FRAME_MS)];
    expect(at(3 * ANIM.prismBoltStaggerMs)).toBeLessThan(targets.length);
    for (const g of started) expect(g.blendMode).toBe('add');
  });

  it('a prism swapped with a rock throws its bolts in rock gray', () => {
    const rocks = [{ row: 1, col: 1 }, { row: 0, col: 5 }, { row: 6, col: 2 }];
    r.fx.blast({ ...blast('prism', { row: 1, col: 1 }, rocks), color: 'rock' }, cellXY);
    frame();
    const tints = new Set(r.decals().map((s) => s.tint));
    expect(tints.has(effectColor('rock'))).toBe(true);
    expect(r.bolts().length).toBeGreaterThan(0);
  });

  it('a supernova flashes the whole board', () => {
    r.fx.blast(blast('supernova', { row: 3, col: 4 }, [...row(0), ...row(1)]), cellXY);
    frames(40);
    const board = 8 * CELL;
    expect(r.decals().some((s) => s.width >= board - 1 && s.height >= board - 1 && s.alpha > 0.2)).toBe(true);
  });

  it('a morph rings the new special and throws sparks', () => {
    const tex: PieceTextures = { cellPx: CELL, piece: () => Texture.EMPTY, halo: () => Texture.EMPTY, selectRing: Texture.EMPTY, destroy() {} };
    const s = new PieceSprite({ id: 1, kind: 'gem', color: 'orange', special: 'charge' }, tex);
    s.position.set(130, 80);
    r.fx.morph(s);
    expect(r.decals().length).toBeGreaterThan(0);
    expect(r.sparks().length).toBeGreaterThan(0);
    for (const d of r.decals()) expect([d.x, d.y]).toEqual([130, 80]);
    frames(ANIM.fx.sparkLifeMs[1] + 50);
    expect(r.decals()).toHaveLength(0);
    s.destroy();
  });

  it('destroy mid-effect resolves pending blasts and frees the pools', async () => {
    const p = r.fx.blast(blast('supernova', { row: 3, col: 4 }, row(2)), cellXY);
    r.fx.shake(3, 500);
    frames(50);
    r.fx.destroy();
    let done = false;
    void p.then(() => { done = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toBe(true);
    expect(r.stage.x).toBe(0);
    expect(r.layer.children).toHaveLength(0);
    // Calls after destroy are ignored.
    r.fx.pop({ x: 0, y: 0 }, 0xffffff);
    expect(await settle(r.fx.blast(blast('charge', { row: 0, col: 0 }, []), cellXY), 50)).toBe(true);
  });

  it('pool sprites are plain Sprites under the layer', () => {
    expect(r.sprites().every((s) => s instanceof Sprite && s.parent !== null)).toBe(true);
  });
});
