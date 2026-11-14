import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Texture } from 'pixi.js';
import { gsap } from 'gsap';
import type { Piece } from '../engine';
import { ANIM } from './constants';
import { PieceSprite } from './PieceSprite';
import type { PieceTextures } from './textures';

const tex: PieceTextures = { cellPx: 60, piece: () => Texture.EMPTY, halo: () => Texture.EMPTY, selectRing: Texture.EMPTY, destroy() {} };
const prism: Piece = { id: 1, kind: 'prism' };
const gem: Piece = { id: 2, kind: 'gem', color: 'red', special: 'none' };

let now = 0;
beforeAll(() => {
  gsap.ticker.remove(gsap.updateRoot);
  now = gsap.globalTimeline.time();
});
afterAll(() => gsap.ticker.add(gsap.updateRoot));
const advance = (s: number) => { now += s; gsap.updateRoot(now); };

// body and halo are private children; read them through the container.
const kids = (s: PieceSprite) => ({ halo: s.children[0], body: s.children[2] });

describe('PieceSprite prism spin', () => {
  it('a Prism with breathing on turns body and halo together over time', () => {
    const s = new PieceSprite(prism, tex);
    s.setBreathing(true);
    const { body, halo } = kids(s);
    advance(0.1);
    const r1 = body.rotation;
    advance(ANIM.prismSpinS / 4);
    expect(body.rotation).not.toBe(r1);
    expect(halo.rotation).toBe(body.rotation);
    s.setSelected(true);
    const r2 = body.rotation;
    advance(1);
    expect(body.rotation).not.toBe(r2);
    s.destroy();
  });

  it('a gem never rotates', () => {
    const s = new PieceSprite(gem, tex);
    s.setBreathing(true);
    advance(3);
    expect(kids(s).body.rotation).toBe(0);
    expect(kids(s).halo.rotation).toBe(0);
    s.destroy();
  });

  it('a Prism with breathing off stays at 0, and turning breathing off zeroes it', () => {
    const s = new PieceSprite(prism, tex);
    advance(3);
    expect(kids(s).body.rotation).toBe(0);
    s.setBreathing(true);
    advance(2);
    s.setBreathing(false);
    expect(kids(s).body.rotation).toBe(0);
    advance(2);
    expect(kids(s).body.rotation).toBe(0);
    s.destroy();
  });

  it('setPiece from Prism to gem stops and zeroes the rotation', () => {
    const s = new PieceSprite(prism, tex);
    s.setBreathing(true);
    advance(2);
    s.setPiece(gem, tex);
    expect(kids(s).body.rotation).toBe(0);
    expect(kids(s).halo.rotation).toBe(0);
    advance(2);
    expect(kids(s).body.rotation).toBe(0);
    s.destroy();
  });

  it('destroy kills the tween', () => {
    const before = gsap.globalTimeline.getChildren().length;
    const s = new PieceSprite(prism, tex);
    s.setBreathing(true);
    expect(gsap.globalTimeline.getChildren().length).toBe(before + 2);
    s.destroy();
    expect(gsap.globalTimeline.getChildren().length).toBe(before);
  });
});
