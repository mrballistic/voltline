// One on-screen piece, keyed by its engine id for its whole life (spec §6.1). The container's
// position is the cell center and belongs to the script player; this class only animates its
// own children (the halo's breathing, the selection ring), so it never fights a timeline.
import { Container, Sprite } from 'pixi.js';
import type { DestroyOptions } from 'pixi.js';
import { gsap } from 'gsap';
import type { Piece } from '../engine';
import { ANIM } from './constants';
import { PIECE_COLORS, type PieceTextures } from './textures';

const G = ANIM.glow;
/** Halo alpha while selected: brighter than any idle breath. */
const SELECTED_ALPHA = { lo: 0.6, hi: 1 } as const;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class PieceSprite extends Container {
  id: number;
  piece: Piece;
  private readonly halo = new Sprite();
  private readonly ring = new Sprite();
  private readonly body = new Sprite();
  /** 0 → `glow.alphaLo`/`scaleLo`, 1 → `alphaHi`/`scaleHi`; tweened by the breathing loop. */
  private readonly breath = { v: 0.5 };
  private tween: gsap.core.Tween | null = null;
  private spin: gsap.core.Tween | null = null;
  private breathing = false;
  private selected = false;

  constructor(p: Piece, tex: PieceTextures) {
    super();
    this.id = p.id;
    this.piece = p;
    for (const s of [this.halo, this.ring, this.body]) s.anchor.set(0.5);
    this.ring.visible = false;
    this.addChild(this.halo, this.ring, this.body);
    this.setPiece(p, tex);
  }

  setPiece(p: Piece, tex: PieceTextures): void {
    this.piece = p;
    this.body.texture = tex.piece(p);
    this.ring.texture = tex.selectRing;
    this.ring.tint = p.kind === 'gem' ? PIECE_COLORS[p.color] : 0xffffff;
    const halo = tex.halo(p);
    this.halo.visible = halo !== null;
    if (halo) this.halo.texture = halo;
    this.restart();
    this.restartSpin();
  }

  /** Idle breathing of the halo, with a random phase so the board never pulses in unison. */
  setBreathing(on: boolean): void {
    if (on === this.breathing) return;
    this.breathing = on;
    this.restart();
    this.restartSpin();
  }

  /** Steady bright ring plus a faster, brighter halo pulse (when motion is allowed). */
  setSelected(on: boolean): void {
    if (on === this.selected) return;
    this.selected = on;
    this.ring.visible = on;
    this.restart();
  }

  private apply = () => {
    const v = this.breath.v;
    if (this.selected) {
      this.halo.alpha = lerp(SELECTED_ALPHA.lo, SELECTED_ALPHA.hi, v);
      this.halo.scale.set(lerp(G.scaleLo, G.scaleHi, v));
    } else {
      this.halo.alpha = lerp(G.alphaLo, G.alphaHi, v);
      this.halo.scale.set(lerp(G.scaleLo, G.scaleHi, v));
    }
  };

  /** The Prism turns slowly at rest (same gate as breathing); it never touches the container. */
  private restartSpin() {
    const want = this.breathing && this.piece.kind === 'prism';
    if (want && this.spin) return;
    this.spin?.kill();
    this.spin = null;
    this.body.rotation = 0;
    this.halo.rotation = 0;
    if (!want) return;
    const turn = { a: 0 };
    this.spin = gsap.to(turn, {
      a: Math.PI * 2, duration: ANIM.prismSpinS, ease: 'none', repeat: -1,
      onUpdate: () => { this.body.rotation = turn.a; this.halo.rotation = turn.a; },
    });
    this.spin.totalTime(Math.random() * ANIM.prismSpinS);
    // totalTime() doesn't fire onUpdate, so set the starting angle now (no snap from 0 on the first frame).
    this.body.rotation = turn.a;
    this.halo.rotation = turn.a;
  }

  private restart() {
    const phase = this.tween ? this.tween.totalTime() : Math.random() * G.periodS;
    this.tween?.kill();
    this.tween = null;
    if (!this.breathing || !this.halo.visible) {
      // Still: the midpoint of the breath (or full brightness when selected), at rest scale.
      this.breath.v = this.selected ? 1 : 0.5;
      this.apply();
      this.halo.scale.set(1);
      return;
    }
    const halfPeriod = (this.selected ? ANIM.selectPulseS : G.periodS) / 2;
    this.breath.v = 0;
    this.tween = gsap.to(this.breath, {
      v: 1, duration: halfPeriod, ease: 'sine.inOut', yoyo: true, repeat: -1, onUpdate: this.apply,
    });
    this.tween.totalTime(phase % (2 * halfPeriod));
    this.apply();
  }

  override destroy(options?: DestroyOptions): void {
    this.tween?.kill();
    this.tween = null;
    this.spin?.kill();
    this.spin = null;
    // Textures belong to PieceTextures and are shared by every sprite: never destroy them here.
    super.destroy({ ...(typeof options === 'object' ? options : {}), children: true, texture: false, textureSource: false });
  }
}
