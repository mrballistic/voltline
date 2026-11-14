// Headless benchmark: plays seeded games with the search AI and with a "first productive move"
// baseline, then prints score, level, game length and AI decision time.
//
//   npm run bench -- --games 20 --max-moves 400 [--seed 1] [--rollouts 160,4,16]
//                    [--weights '{"trayPieceSpent":200,"special":{"prism":800}}'] [--per-game]
//
// --rollouts and --weights override the defaults for one run, for tuning experiments; the tuned
// values themselves live in src/ai/weights.ts.
//
// Game i of a run uses engine seed `seed * 1000 + i` for both players, so a run is deterministic for
// a given --seed (only the timing columns vary). Exits 1 if the AI's mean score is below 1.5× the
// baseline's.
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { applyMove, newGame, productiveMoves } from '../src/engine';
import type { GameState, Move } from '../src/engine';
import { rankMoves } from '../src/ai/search';
import type { RankOptions } from '../src/ai/search';
import { W } from '../src/ai/weights';

const REQUIRED_RATIO = 1.5;
const TRAY_HEAVY = 3; // decisions with at least this many tray pieces are also timed separately

interface GameResult { score: number; level: number; moves: number; over: boolean; places: number }
interface Timings { all: number[]; trayHeavy: number[] }
type Chooser = (state: GameState) => Move;

const { values } = parseArgs({
  options: {
    games: { type: 'string', default: '20' },
    'max-moves': { type: 'string', default: '400' },
    seed: { type: 'string', default: '1' },
    rollouts: { type: 'string' }, // budget[,min,max]
    weights: { type: 'string' }, // JSON merged into W
    'per-game': { type: 'boolean', default: false }, // also print one line per game
  },
});
const games = positiveInt(values.games, 'games');
const maxMoves = positiveInt(values['max-moves'], 'max-moves');
const seed = Number.parseInt(values.seed, 10);
if (!Number.isFinite(seed)) fail('--seed must be an integer');
const rankOpts = parseRollouts(values.rollouts);
if (values.weights) overrideWeights(values.weights);

function positiveInt(raw: string, name: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) fail(`--${name} must be a positive integer`);
  return n;
}

function parseRollouts(raw: string | undefined): RankOptions {
  if (!raw) return {};
  const [rolloutBudget, minRollouts, maxRollouts] = raw.split(',').map((v) => (v === '' ? undefined : Number(v)));
  return { rolloutBudget, minRollouts, maxRollouts };
}

function overrideWeights(raw: string): void {
  const target = W as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(JSON.parse(raw) as Record<string, unknown>)) {
    if (!(key in target)) fail(`--weights: unknown weight ${key}`);
    if (typeof value === 'object' && value !== null) Object.assign(target[key] as object, value);
    else target[key] = value;
  }
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function play(gameSeed: number, choose: Chooser): GameResult {
  let state = newGame(gameSeed);
  let places = 0;
  while (!state.over && state.moves < maxMoves) {
    const move = choose(state);
    const { state: next } = applyMove(state, move);
    if (move.type === 'place') places++;
    state = next;
  }
  return { score: state.score, level: state.level, moves: state.moves, over: state.over, places };
}

const baseline: Chooser = (state) => productiveMoves(state)[0];

function timedAi(timings: Timings): Chooser {
  return (state) => {
    const t0 = performance.now();
    const ranked = rankMoves(state, rankOpts);
    const ms = performance.now() - t0;
    timings.all.push(ms);
    if (state.tray.length >= TRAY_HEAVY) timings.trayHeavy.push(ms);
    return ranked[0].move;
  };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

// Nearest-rank percentile.
function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

function row(cells: (string | number)[], widths: number[]): string {
  return cells.map((c, i) => String(c).padStart(widths[i])).join('  ');
}

const fmt = (n: number, digits = 0) => (Number.isNaN(n) ? '–' : n.toFixed(digits));

const timings: Timings = { all: [], trayHeavy: [] };
const ai = timedAi(timings);
const results: Record<'ai' | 'baseline', GameResult[]> = { ai: [], baseline: [] };
const started = performance.now();
for (let i = 0; i < games; i++) {
  const gameSeed = seed * 1000 + i;
  results.baseline.push(play(gameSeed, baseline));
  results.ai.push(play(gameSeed, ai));
}
const wall = (performance.now() - started) / 1000;

if (values['per-game']) {
  for (let i = 0; i < games; i++) {
    for (const name of ['ai', 'baseline'] as const) {
      const r = results[name][i];
      process.stdout.write(`seed ${seed * 1000 + i} ${name}: score ${r.score}, level ${r.level}, moves ${r.moves}, ${r.over ? 'game over' : 'move cap'}, places ${r.places}\n`);
    }
  }
}

const header = ['player', 'mean score', 'median score', 'mean lvl', 'median lvl', 'lvl>=10', 'mean moves', 'game over', 'move cap', 'places'];
const widths = header.map((h) => Math.max(h.length, 8));
const extras = [values.rollouts && `rollouts ${values.rollouts}`, values.weights && `weights ${values.weights}`].filter(Boolean);
process.stdout.write(`games ${games}, max moves ${maxMoves}, seed ${seed}${extras.map((e) => `, ${e}`).join('')}\n`);
process.stdout.write(`${row(header, widths)}\n`);
for (const name of ['ai', 'baseline'] as const) {
  const rs = results[name];
  const over = rs.filter((r) => r.over).length;
  process.stdout.write(`${row([
    name,
    fmt(mean(rs.map((r) => r.score))),
    fmt(percentile(rs.map((r) => r.score), 50)),
    fmt(mean(rs.map((r) => r.level)), 1),
    fmt(percentile(rs.map((r) => r.level), 50)),
    rs.filter((r) => r.level >= 10).length,
    fmt(mean(rs.map((r) => r.moves)), 1),
    over,
    rs.length - over,
    fmt(mean(rs.map((r) => r.places)), 1),
  ], widths)}\n`);
}
process.stdout.write(
  `ai decision ms: p50 ${fmt(percentile(timings.all, 50), 1)}, p95 ${fmt(percentile(timings.all, 95), 1)} (n ${timings.all.length}); `
  + `tray>=${TRAY_HEAVY}: p50 ${fmt(percentile(timings.trayHeavy, 50), 1)}, p95 ${fmt(percentile(timings.trayHeavy, 95), 1)} (n ${timings.trayHeavy.length})\n`,
);

const aiMean = mean(results.ai.map((r) => r.score));
const baseMean = mean(results.baseline.map((r) => r.score));
const ratio = baseMean > 0 ? aiMean / baseMean : Infinity;
const pass = ratio >= REQUIRED_RATIO;
process.stdout.write(`ai/baseline mean score ${fmt(ratio, 2)}× (need ${REQUIRED_RATIO}×): ${pass ? 'PASS' : 'FAIL'}; ${fmt(wall, 1)} s\n`);
process.exit(pass ? 0 : 1);
