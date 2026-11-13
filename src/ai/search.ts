import { applyMove, countProductiveMoves, productiveMoves } from '../engine';
import type { GameState, Move, Step } from '../engine';
import { hashVisible } from './hash';
import { HEALTH_CAP, ROLLOUTS, TOP_PLACEMENTS, W } from './weights';

export interface RankedMove { move: Move; value: number; expectedPoints: number }

export interface RankOptions {
  rolloutBudget?: number; // total rollouts shared across rolled-out candidates, default ROLLOUTS.budget
  minRollouts?: number; // per candidate, default ROLLOUTS.min
  maxRollouts?: number; // per candidate, default ROLLOUTS.max
  onRollout?: (move: Move) => void; // observation hook, called once per full rollout (tests)
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

interface Outcome { value: number; points: number; result: GameState }

// One simulation scored on its immediate terms only: points, specials, rocks, level-up, game over
// and the spent tray piece. No board-health count.
function simulate(state: GameState, move: Move, rngState: number): Outcome {
  const { state: result, script } = applyMove({ ...state, rngState }, move);
  const points = result.score - state.score;
  let value = points + specialsValue(script, result);
  for (const step of script) {
    if (step.t === 'clear') value += W.rockCleared * step.cleared.filter((c) => c.key === 'rock').length;
    else if (step.t === 'level-up') value += W.levelUp;
  }
  if (result.over) value += W.gameOver;
  if (move.type === 'place') value -= W.trayPieceSpent;
  return { value, points, result };
}

// A full rollout: the immediate terms plus board health.
function rollout(state: GameState, move: Move, rngState: number): Outcome {
  const out = simulate(state, move, rngState);
  // A finished game has no productive moves by definition, so skip counting them.
  const health = out.result.over ? 0 : countProductiveMoves(out.result, Math.max(HEALTH_CAP, W.healthFloor));
  out.value += W.healthPerMove * Math.min(health, HEALTH_CAP);
  if (health < W.healthFloor) out.value -= W.belowFloorPenalty;
  return out;
}

// Seed for the single pre-ranking simulation of a placement; distinct from every rollout's k >= 0.
const PRE_RANK = -1;

interface Scored { index: number; move: Move; value: number; expectedPoints: number }

/**
 * Ranks every productive move, best first; ties keep `productiveMoves` order. Swaps and the
 * TOP_PLACEMENTS best placements (by one cheap simulation) get Monte Carlo refill rollouts, with the
 * rollout budget shared among them; the other placements keep their cheap value. Every seed comes
 * from a hash of the visible state, never from the game's `rngState`, so the same visible board
 * always yields the same ranking.
 */
export function rankMoves(state: GameState, opts: RankOptions = {}): RankedMove[] {
  const { rolloutBudget = ROLLOUTS.budget, minRollouts = ROLLOUTS.min, maxRollouts = ROLLOUTS.max } = opts;
  if (state.over) return [];
  const candidates = productiveMoves(state);
  if (candidates.length === 0) return [];
  const hash = hashVisible(state);

  const swaps: Scored[] = [];
  const placements: Scored[] = [];
  candidates.forEach((move, index) => {
    if (move.type === 'swap') {
      swaps.push({ index, move, value: 0, expectedPoints: 0 });
    } else {
      const cheap = simulate(state, move, mix(hash, index, PRE_RANK));
      placements.push({ index, move, value: cheap.value, expectedPoints: cheap.points });
    }
  });
  placements.sort(byValue);
  const deep = [...swaps, ...placements.slice(0, TOP_PLACEMENTS)];

  const rollouts = Math.min(Math.max(Math.floor(rolloutBudget / deep.length), minRollouts), maxRollouts);
  for (const c of deep) {
    let value = 0;
    let points = 0;
    for (let k = 0; k < rollouts; k++) {
      opts.onRollout?.(c.move);
      const r = rollout(state, c.move, mix(hash, c.index, k));
      value += r.value;
      points += r.points;
    }
    c.value = value / rollouts;
    c.expectedPoints = points / rollouts;
  }

  return [...swaps, ...placements].sort(byValue).map(({ move, value, expectedPoints }) => ({ move, value, expectedPoints }));
}

function byValue(a: Scored, b: Scored): number {
  return b.value - a.value || a.index - b.index;
}
