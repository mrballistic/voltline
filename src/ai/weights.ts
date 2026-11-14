// Every AI evaluation weight, in point units, tuned with `npm run bench` (scripts/bench.ts).
//
// Benchmark, `npm run bench -- --games 20 --max-moves 400 --seed 1` (2026-11-13, dev Mac, Node 26,
// 1.1 rules: rocks from level 5, stingy refills and more rocks past 8, tray counting pauses while
// full, Prism + rock, rock lines of 4+ explode; weights unchanged from 1.0):
//
//   player    mean score  median score  mean lvl  median lvl  lvl>=10  mean moves  game over  move cap
//   ai           150286        165100      10.9          12    14/20       308.7         10        10
//   baseline      55064         62600       7.2           8     0/20       331.4         10        10
//   ai/baseline 2.73×. AI decision ms: p50 31.6, p95 46.7; with ≥3 tray pieces: p50 33.2, p95 48.0.
//
// Under the 1.0 rules the same weights scored 235914 vs 70207 (3.36×), mean level 13.8, 20/20
// reaching level 10; the drop is the harder 1.1 rules, not the AI.
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
