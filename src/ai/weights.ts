// Every AI evaluation weight, in point units (starting values; Task 9's benchmark tunes them).
export const W = {
  special: { charge: 150, arc: 250, prism: 600 },
  rockCleared: 40,
  levelUp: 1500,
  healthPerMove: 15,
  healthFloor: 3,
  belowFloorPenalty: 400,
  gameOver: -100000,
  trayPieceSpent: 300,
};

// Board health counts at most this many productive moves; past it, more options add nothing.
export const HEALTH_CAP = 20;

// Default rollout budget for `rankMoves`: rollouts per candidate = clamp(floor(budget / candidates),
// min, max). Sized so a mid-game decision takes ≤ 40 ms median in Node on the dev Mac.
export const ROLLOUTS = { budget: 160, min: 8, max: 16 };
