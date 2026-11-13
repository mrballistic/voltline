// Interfaces shared by the controller and the pieces later tasks plug in (effects, hint layer,
// persistence). Each has a do-nothing or in-memory stand-in until its task lands.
import type { Blast } from '../engine';
import type { RankedMove } from '../ai/search';
import type { PieceSprite } from '../render/PieceSprite';

export interface Effects {
  pop(at: { x: number; y: number }, color: number): void;
  blast(b: Blast, cellXY: (r: number, c: number) => { x: number; y: number }): Promise<void>;
  shake(px: number, ms: number): void;
  morph(sprite: PieceSprite): void;
}

export const noopEffects: Effects = {
  pop() {},
  blast: () => Promise.resolve(),
  shake() {},
  morph() {},
};

export interface HintViewLike {
  show(ranked: RankedMove[], opts: { revealMs: number; holdMs: number; signal?: AbortSignal }): Promise<void>;
  clear(): void;
}

export type AISpeed = 'slow' | 'medium' | 'fast';

export interface Prefs { bestPlayer: number; bestAI: number; aiSpeed: AISpeed; muted: boolean; volume: number }

export interface PrefsStore { load(): Prefs; save(p: Prefs): void }
