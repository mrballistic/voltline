import { applyMove, productiveMoves } from '../engine';
import type { GameState, Move, Step } from '../engine';
import { hashVisible } from './hash';
import { HEALTH_CAP, W } from './weights';

export interface RankedMove { move: Move; value: number; expectedPoints: number }

export interface RankOptions {
  rolloutBudget?: number; // total rollouts shared across candidates, default 2400
  minRollouts?: number; // per candidate, default 8
  maxRollouts?: number; // per candidate, default 32
}

// murmur3 fmix32
function fmix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** The AI's own refill seed for candidate `i`, rollout `k`: a function of visible state only. */
function mix(hash: number, i: number, k: number): number {
  return fmix(fmix(hash ^ Math.imul(i + 1, 0x9e3779b9)) ^ Math.imul(k + 1, 0x7feb352d));
}

/**
 * Bonus value of a created special. Only specials still on the resulting board count: one that
 * detonated later in the cascade (or every gem a prism swap converted) has already paid out in
 * points, and a level-up replaces the board.
 */
function specialsValue(script: Step[], result: GameState): number {
  const onBoard = new Set<number>();
  for (const row of result.board) {
    for (const p of row) {
      if (p && (p.kind === 'prism' || (p.kind === 'gem' && p.special !== 'none'))) onBoard.add(p.id);
    }
  }
  let value = 0;
  for (const step of script) {
    if (step.t !== 'clear') continue;
    for (const { piece } of step.created) {
      if (!onBoard.has(piece.id)) continue;
      if (piece.kind === 'prism') value += W.special.prism;
      else if (piece.kind === 'gem' && piece.special !== 'none') value += W.special[piece.special];
    }
  }
  return value;
}

function evaluate(state: GameState, move: Move, rngState: number): { value: number; points: number } {
  const { state: result, script } = applyMove({ ...state, rngState }, move);
  const points = result.score - state.score;
  let value = points + specialsValue(script, result);
  for (const step of script) {
    if (step.t === 'clear') value += W.rockCleared * step.cleared.filter((c) => c.key === 'rock').length;
    else if (step.t === 'level-up') value += W.levelUp;
  }
  // A finished game has no productive moves by definition, so skip listing them.
  const health = result.over ? 0 : productiveMoves(result).length;
  value += W.healthPerMove * Math.min(health, HEALTH_CAP);
  if (health < W.healthFloor) value -= W.belowFloorPenalty;
  if (result.over) value += W.gameOver;
  if (move.type === 'place') value -= W.trayPieceSpent;
  return { value, points };
}

/**
 * Ranks every productive move by its mean value over Monte Carlo refill rollouts, best first;
 * ties keep `productiveMoves` order. Rollout seeds come from a hash of the visible state, never
 * from the game's `rngState`, so the same visible board always yields the same ranking.
 */
export function rankMoves(state: GameState, opts: RankOptions = {}): RankedMove[] {
  const { rolloutBudget = 2400, minRollouts = 8, maxRollouts = 32 } = opts;
  if (state.over) return [];
  const candidates = productiveMoves(state);
  if (candidates.length === 0) return [];
  const rollouts = Math.min(Math.max(Math.floor(rolloutBudget / candidates.length), minRollouts), maxRollouts);
  const hash = hashVisible(state);

  const ranked = candidates.map((move, i) => {
    let value = 0;
    let points = 0;
    for (let k = 0; k < rollouts; k++) {
      const r = evaluate(state, move, mix(hash, i, k));
      value += r.value;
      points += r.points;
    }
    return { index: i, move, value: value / rollouts, expectedPoints: points / rollouts };
  });
  ranked.sort((a, b) => b.value - a.value || a.index - b.index);
  return ranked.map(({ move, value, expectedPoints }) => ({ move, value, expectedPoints }));
}
