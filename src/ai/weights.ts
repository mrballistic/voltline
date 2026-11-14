// Every AI evaluation weight, in point units, tuned with `npm run bench` (scripts/bench.ts).
//
// Benchmark, `npm run bench -- --games 20 --max-moves 400 --seed 1` (2026-11-13, dev Mac, Node,
// rules: levelTarget 1000 + 2500·(n−1), rockChance unchanged):
//
//   player    mean score  median score  mean lvl  median lvl  lvl>=10  mean moves  game over  move cap
//   ai           235914        236050      13.8          14    20/20       385.9          3        17
//   baseline      70207         69360       8.1           8     0/20       400.0          0        20
//   ai/baseline 3.36×. AI decision ms, median of 3 runs: p50 26.0 (25.3–29.0), p95 35.1 (32.9–46.2);
//   with ≥3 tray pieces (95% of decisions): p50 26.2, p95 35.2.
//
// Starting values (special 150/250/600, rockCleared 40, trayPieceSpent 300) with the old 750 level
// step scored 191316 vs 68551 (2.79×) and reached level 21. Changes: a cheaper tray piece (the tray
// is full most of the time, so a hoarded piece mostly blocks the next one) and doubled special
// bonuses gave about +7% and +3% over two 20-game seed sets; rockCleared 150 a little more past
// level 10. Health-floor, level-up and tray-cost-by-tightness variants were within noise.
export const W = {
  special: { charge: 300, arc: 500, prism: 1200 },
  rockCleared: 150,
  levelUp: 1500,
  healthPerMove: 15,
  healthFloor: 3,
  belowFloorPenalty: 400,
  gameOver: -100000,
  trayPieceSpent: 100,
};

// Board health counts at most this many productive moves; past it, more options add nothing.
export const HEALTH_CAP = 20;

// Default rollout budget for `rankMoves`: rollouts per rolled-out candidate (swaps + top placements)
// = clamp(floor(budget / count), min, max). Sized so a mid-game decision takes ≤ 40 ms median in
// Node on the dev Mac. The earlier 2400/8/32 was benchmarked at about 2× the time for +6% score, inside
// the run-to-run noise, so it stays lowered.
export const ROLLOUTS = { budget: 160, min: 4, max: 16 };

// Only this many tray placements (best by one cheap simulation) get full rollouts; the rest keep
// their cheap value, so a full tray can't multiply the search cost.
export const TOP_PLACEMENTS = 3;
