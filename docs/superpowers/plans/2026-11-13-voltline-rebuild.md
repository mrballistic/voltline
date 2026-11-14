# Voltline Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Bejeweled.ai codebase with Voltline: a neon match-three game with special pieces, a collectable tray, rocks, levels, a deterministic search AI that powers AI mode and hints, physically correct PixiJS animation, and a Web Audio sound engine.

**Architecture:** A pure, seeded TypeScript rules engine (`src/engine`) turns a move into an ordered event script. A pure planner (`src/render/plan.ts`) turns that script into timed actions. A PixiJS renderer executes them with GSAP timelines, firing sound cues at the same timestamps. A search AI (`src/ai`) ranks moves in a Web Worker using only visible information. A non-React `GameController` orchestrates engine, renderer, AI and audio; React 19 + MUI 9 render the chrome around the canvas.

**Tech Stack:** Node 26 LTS, React 19.3.1, TypeScript 6.0.3, Vite 8.3.8, PixiJS 8.23.0, GSAP 3.15.1, MUI 9.5.0, Vitest 5.1.0, ESLint 10.14.0 + typescript-eslint 8.72.2, tsx 4.23.15, Playwright 1.65.0, ffmpeg (Homebrew).

**Spec:** `docs/superpowers/specs/2026-11-13-voltline-rebuild-design.md` (read it before any task; section numbers below refer to it).

## Global Constraints

- Work on branch `voltline-rebuild`. Commit author email is `mrballistic@gmail.com` (already set in repo config); verify with `git config user.email` before the first commit.
- Commit style: concise, lowercase, imperative (`add match detection`), ending with a `Co-Authored-By:` line naming the model that wrote the commit.
- Node 26 LTS (26.13.1 at planning time): `.nvmrc` `26`, `engines.node ">=26"`, `@types/node` `^26`, CI `node-version: 26`. (Tasks 1–19 started on 24; Task 20 moves the repo to 26.)
- Exact versions: react/react-dom `19.3.1`, @types/react/@types/react-dom `19.3.0`, typescript `6.0.3` (NOT 7.x: typescript-eslint 8.72.2 peers `typescript <6.1.0`), vite `8.3.8`, @vitejs/plugin-react `6.3.0`, vitest `5.1.0`, pixi.js `8.23.0`, gsap `3.15.1`, @mui/material `9.5.0`, @emotion/react `11.14.0`, @emotion/styled `11.14.1`, eslint `10.14.0`, @eslint/js `10.0.1`, typescript-eslint `8.72.2`, eslint-plugin-react-hooks `7.1.1`, globals `17.14.0`, jsdom `31.0.1`, @testing-library/react `16.3.3`, @testing-library/jest-dom (latest 6.x), tsx `4.23.15`, @playwright/test `1.65.0`, @types/node `26.x` (from Task 20; `24.x` before), @vitest/coverage-v8 `5.1.0` (exact pair with vitest; Task 20), @fontsource/orbitron `5.3.0`, @fontsource/rajdhani `5.3.0`. Use caret ranges at these versions.
- No LLM code, no API keys, no network calls at runtime (fonts are self-hosted via @fontsource).
- Vite `base: './'`. TypeScript `strict`, `noUnusedLocals`, `noUnusedParameters`.
- `src/engine/**` and `src/ai/**` import nothing from DOM, React, Pixi, GSAP or audio; they must run in Node and in a Worker.
- All user-facing copy uses curly quotes/apostrophes (’ “ ”) and closed-up em-dashes used sparingly; tests asserting copy use the curly form. Code comments are exempt.
- No `console.log` in committed code (one `console.warn` per missing audio file in dev is allowed, §6.4).
- Board coordinates: `row` 0 is top, `col` 0 is left. Board is `BOARD_SIZE = 8`.
- Engine is immutable from the caller's view: `applyMove` never mutates its input state.
- Every animation timing value lives in `src/render/constants.ts`; every AI weight in `src/ai/weights.ts`; every rule number (tray size, thresholds, rock rates, level targets, scores) in `src/engine/rules.ts`.

## Review Focus

1. **Input while busy** (double-tap, drag during a cascade, Hint or New Game pressed mid-move): ignored or queued cleanly; the board model and sprites never disagree. Pinned in Task 13 (`controller ignores submit while busy`, `new game waits for current move`).
2. **AI toggled off, or New Game, while the AI is thinking:** the stale ranking is discarded and no move lands on the new state. Pinned in Task 17 (`stale ai result is discarded after new game`).
3. **`localStorage` unavailable or corrupt** (Safari private mode throws, junk JSON): defaults load, nothing crashes, saving silently no-ops. Pinned in Task 16 (`storage survives throwing and corrupt localStorage`).
4. **Resize or rotate mid-game, including mid-cascade:** layout recomputes, sprites snap to model positions after the current timeline, nothing is lost. Pinned in Task 12 (`computeLayout` cases) and Task 13 (`resize during play re-lays out after timeline`).
5. **Tab hidden mid-AI-run:** AI loop pauses while `document.hidden`, resumes on return, never fires a burst of queued moves. Pinned in Task 17 (`ai pauses while document hidden`).

---

## File Structure

```
src/
  engine/
    types.ts        all engine types + BOARD_SIZE, COLORS
    rules.ts        rule numbers (tray, thresholds, rock rates, scores, levelTarget)
    rng.ts          seeded PRNG
    testing.ts      parseBoard / boardToString fixtures helpers (used by tests + bench)
    matches.ts      findMatches, swapCreatesMatch
    board.ts        cloneBoard, createBoard
    gravity.ts      applyGravity (falls + refills + rock spawns)
    specials.ts     special creation + blast resolution
    scoring.ts      scoreRound
    tray.ts         counters / earn / placement validation
    moves.ts        allowedMoves, productiveMoves, isGameOver
    resolve.ts      applyMove (cascade loop, level-up, game over), newGame
  ai/
    weights.ts      evaluation weights
    hash.ts         hashVisible
    search.ts       rankMoves
    worker.ts       Worker entry
    client.ts       createAIClient (worker or inline fallback)
  render/
    constants.ts    ANIM values, fallDurationMs
    layout.ts       computeLayout
    plan.ts         planScript (pure timing)
    textures.ts     piece / halo / tray textures from vector code
    PieceSprite.ts  piece sprite + halo breathing
    BoardView.ts    sprites by id, masking, positions
    TrayView.ts     tray strip
    effects.ts      particles, shockwave, beams, bolts, shake
    HintLayer.ts    arrows + reveal, pickHintArrows
    input.ts        pointer select / drag / swipe / tray tap
    player.ts       ScriptPlayer (executes plan with GSAP)
  audio/
    cues.ts         cue manifest + CueName
    engine.ts       AudioEngine
  app/
    ports.ts        shared interfaces: Effects, HintViewLike, AISpeed, Prefs, PrefsStore
    storage.ts      prefs + best scores
    controller.ts   GameController
    bootstrap.ts    createGame (Pixi + views + controller)
    useGame.ts      React binding
  components/       App, Header, ScoreDisplay, LevelBar, AIControls, GameControls, GameOverDialog, TrayNotice
  theme.ts
  main.tsx
scripts/bench.ts, scripts/encode-audio.sh, scripts/smoke.spec.ts
audio-src/ (Todd's WAVs), public/audio/ (encoded)
```

Tests live beside code as `*.test.ts(x)`.

---

### Task 1: Reset repo and toolchain

**Files:**
- Delete: `src/**` (all), `memory-bank/`, `tech-brief.md`, `.env.example`, `start.sh`, `vitest.config.ts`, `public/diamond-icon.png` (replace with a neon icon later in Task 16)
- Create: `package.json` (rewrite), `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `src/main.tsx`, `src/App.tsx`, `src/smoke.test.ts`
- Modify: `index.html`, `.gitignore`

**Interfaces:**
- Produces: scripts `dev`, `build` (`tsc --noEmit && vite build`), `preview`, `lint` (`eslint .`), `test` (`vitest`), `test:run` (`vitest run`), `bench` (`tsx scripts/bench.ts`), `audio` (`bash scripts/encode-audio.sh`). `package.json` `name: "voltline"`, `version: "1.0.0-dev"`, `engines.node: ">=24"`.

- [ ] **Step 1:** Delete the listed files with `git rm -r`. Remove `react-dnd*`, `rdndmb-*`, `uuid`, `@types/uuid` from dependencies; install every Global Constraints package at its pinned version (`npm i …` / `npm i -D …`).
- [ ] **Step 2:** `vite.config.ts`: `base: './'`, react plugin, `test: { environment: 'node', setupFiles: [] }`, `worker: { format: 'es' }`. `tsconfig.json`: the existing compiler options (ES2022 target/lib, bundler resolution, strict, noUnused*) plus `"types": ["vite/client"]`, include `src`, `scripts`. `eslint.config.js`: flat config with `@eslint/js` recommended, `typescript-eslint` recommended, `react-hooks` recommended, browser + node globals, ignore `dist`, `.superpowers`, `.playwright-mcp`.
- [ ] **Step 3:** `index.html`: title `Voltline`, remove Google Fonts links, mount `#app`. `src/main.tsx` renders `<App/>`; `src/App.tsx` renders the text `Voltline`. `src/smoke.test.ts`: `expect(1 + 1).toBe(2)`.
- [ ] **Step 4:** Run `npm run lint && npm run build && npm run test:run`. Expected: all three exit 0.
- [ ] **Step 5:** Commit `reset repo for voltline rebuild`.

---

### Task 2: Engine types, rules, RNG and fixture helpers

**Files:**
- Create: `src/engine/types.ts`, `src/engine/rules.ts`, `src/engine/rng.ts`, `src/engine/testing.ts`
- Test: `src/engine/rng.test.ts`, `src/engine/testing.test.ts`

**Interfaces:**
- Produces (`types.ts`):
```ts
export const BOARD_SIZE = 8;
export const COLORS = ['red','blue','yellow','green','magenta','orange','cyan'] as const;
export type Color = typeof COLORS[number];
export type GemSpecial = 'none' | 'charge' | 'arc';
export type Piece =
  | { id: number; kind: 'gem'; color: Color; special: GemSpecial }
  | { id: number; kind: 'prism' }
  | { id: number; kind: 'rock' };
export type Board = (Piece | null)[][];          // [row][col]
export interface Pos { row: number; col: number }
export type MatchKey = Color | 'rock';
export type MatchShape = 'line3' | 'line4' | 'line5' | 'cross';
export interface MatchGroup { key: MatchKey; cells: Pos[]; shape: MatchShape }
export type Move = { type: 'swap'; a: Pos; b: Pos } | { type: 'place'; slot: number; at: Pos };
export type BlastKind = 'charge' | 'arc' | 'prism' | 'supernova';
export interface Blast { kind: BlastKind; at: Pos; cells: Pos[]; order: number; color?: Color }
export interface Cleared { id: number; at: Pos; cause: 'match' | 'blast'; key: MatchKey | 'prism' }
export interface Fall { id: number; from: Pos; to: Pos }
export interface Spawn { piece: Piece; to: Pos; fromRow: number }   // fromRow < 0
export interface GameState {
  board: Board; level: number; score: number; levelStartScore: number; levelTarget: number;
  tray: Color[]; counters: Record<Color, number>; moves: number; nextId: number;
  rngState: number; over: boolean; seed: number;
}
export type Step =
  | { t: 'swap'; a: Pos; b: Pos; ids: [number, number] }
  | { t: 'swap-invalid'; a: Pos; b: Pos; ids: [number, number] }
  | { t: 'place'; slot: number; at: Pos; removedId: number; piece: Piece }
  | { t: 'clear'; chain: number; groups: MatchGroup[]; blasts: Blast[]; cleared: Cleared[];
      created: { at: Pos; piece: Piece }[] }
  | { t: 'score'; chain: number; combo: number; points: number; total: number }
  | { t: 'tray-earn'; color: Color; from: Pos; slot: number }
  | { t: 'tray-full' }
  | { t: 'tray-lost'; color: Color; from: Pos }
  | { t: 'fall'; falls: Fall[]; spawns: Spawn[] }
  | { t: 'level-up'; level: number; board: Board }
  | { t: 'game-over' };
```
- Produces (`rules.ts`, values from spec §5): `TRAY_CAPACITY = 5`, `TRAY_THRESHOLD = 10`, `ROCK_START_LEVEL = 10`, `rockChance(level: number): number` (`0` below 10, else `min(0.03 + 0.01*(level-10), 0.10)`), `MATCH_BASE: Record<MatchShape, number> = { line3: 100, line4: 200, line5: 500, cross: 300 }`, `BLAST_PIECE_BASE = 20`, `CHAIN_MULT = [1,2,4,8,16,32]`, `comboMult(groups: number): number` (1→1, 2→1.5, 3→2, ≥4→2.5), `levelTarget(level: number): number` (`1000 + 750*(level-1)`).
- Produces (`rng.ts`): `class Rng { constructor(state: number); next(): number /* [0,1) */; int(n: number): number; pick<T>(xs: readonly T[]): T; get state(): number }` (mulberry32; state is a uint32).
- Produces (`testing.ts`): `parseBoard(src: string): Board` and `boardToString(b: Board): string`. Grammar: rows separated by newlines, cells by whitespace; tokens `R B Y G M O C` (red blue yellow green magenta orange cyan), optional suffix `c` (charge) or `a` (arc), `X` rock, `P` prism, `.` empty. Ids assigned row-major from 1. Also `makeState(board: Board, over?: Partial<GameState>): GameState` with defaults level 1, score 0, levelStartScore 0, levelTarget `levelTarget(1)`, empty tray, zero counters, moves 0, nextId = max id + 1, rngState 1, seed 1, over false.

- [ ] **Step 1: Failing tests.** `rng.test.ts`: `same seed gives same sequence` (two `new Rng(42)` produce identical first 100 `next()`); `state round-trips` (`new Rng(r.state)` continues identically); `int stays in range` (10 000 draws of `int(7)` all in 0..6 and every value appears). `testing.test.ts`: `parseBoard reads specials` (`parseBoard('Rc Ba X P\n. . . .')` → `[0][0]` is gem red charge id 1, `[0][1]` blue arc, `[0][2]` rock, `[0][3]` prism, row 1 nulls); `boardToString round-trips`.
- [ ] **Step 2:** `npm run test:run -- src/engine` → FAIL (modules missing).
- [ ] **Step 3:** Implement the three files per the interfaces.
- [ ] **Step 4:** `npm run test:run -- src/engine` → PASS.
- [ ] **Step 5:** Commit `add engine types, rules, rng and fixtures`.

---

### Task 3: Match detection

**Files:**
- Create: `src/engine/matches.ts`
- Test: `src/engine/matches.test.ts`

**Interfaces:**
- Consumes: Task 2 types, `parseBoard`.
- Produces: `matchKeyOf(p: Piece | null): MatchKey | null` (gem → color incl. specials, rock → `'rock'`, prism/null → null); `findMatches(board: Board): MatchGroup[]`; `swapCreatesMatch(board: Board, a: Pos, b: Pos): boolean` (true only if the swapped board has a group touching `a` or `b`; does not mutate).

Algorithm: collect horizontal and vertical runs ≥3 of equal `matchKeyOf`. Union runs that share a cell (same key) into one group. Shape: any run of length ≥5 → `line5`; else group made of ≥2 runs → `cross`; else run length 4 → `line4`; else `line3`. Cells deduplicated, sorted row-major.

- [ ] **Step 1: Failing tests:** `finds horizontal and vertical line3`; `line4 and line5 classified` (a run of 6 is `line5`); `L and T are one cross group` (an L of 5 red cells → one group, 5 cells, `cross`); `cross containing a 5-run is line5`; `different colors never merge`; `rocks match as rock key`; `prism and empty cells break runs`; `charge and arc gems match by color`; `swapCreatesMatch true and false cases, input unchanged` (deep-equal before/after).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `add match detection`.

---

### Task 4: Board creation and gravity

**Files:**
- Create: `src/engine/board.ts`, `src/engine/gravity.ts`
- Test: `src/engine/board.test.ts`, `src/engine/gravity.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces: `cloneBoard(b: Board): Board` (rows copied, pieces shared, since pieces are treated as immutable); `randomPiece(rng: Rng, level: number, id: number): Piece` (rock with `rockChance(level)`, else uniform gem color, special `'none'`; never prism); `createBoard(rng: Rng, level: number, firstId: number): { board: Board; nextId: number }`; `applyGravity(board: Board, rng: Rng, level: number, nextId: number): { board: Board; falls: Fall[]; spawns: Spawn[]; nextId: number }`.

`createBoard`: fill row-major, re-rolling a cell while it would complete a 3-run with its two left or two upper neighbours (same match key); then require `hasProductiveSwap` (any adjacent pair where `swapCreatesMatch`), else regenerate (max 100 attempts, then keep regenerating with level 1 rock rate 0 to guarantee termination). `applyGravity`: per column, compact non-null pieces downward (preserve order); `Fall` for each piece whose row changed; for `k` empties left at the top, spawn into rows `0..k-1` with `fromRow = row - k`. Spawned pieces use ids from `nextId` upward, assigned column by column left to right, top row first.

- [ ] **Step 1: Failing tests:** `createBoard has no matches and a productive swap` (200 seeds, levels 1 and 15); `createBoard is deterministic per seed`; `no rocks below level 10` (200 boards at level 9, zero rocks); `rocks appear at level 15` (across 200 boards, rock fraction between 0.04 and 0.12); `gravity compacts a column and spawns above` (column with gaps at rows 2 and 5 → falls keep relative order, spawns have `fromRow` -2 and -1 for rows 0 and 1, no nulls remain); `spawn ids are sequential from nextId`; `full column produces no falls or spawns`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `add board creation and gravity`.

---

### Task 5: Specials and blasts

**Files:**
- Create: `src/engine/specials.ts`
- Test: `src/engine/specials.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces:
  - `specialFor(shape: MatchShape): 'charge' | 'arc' | 'prism' | null` (line4→charge, cross→arc, line5→prism, line3→null).
  - `specialCell(group: MatchGroup, moved: Pos[]): Pos`: the first `moved` cell inside the group, else the group's center cell (for lines the middle index, lower/left on ties; for crosses the intersection cell).
  - `mostCommonColor(board: Board): Color | null` (ties broken by `COLORS` order; null if no gems).
  - `resolveBlasts(board: Board, seeds: { at: Pos; kind: BlastKind; color?: Color }[], alreadyCleared: Set<string>): { blasts: Blast[]; cells: Pos[] }`: breadth-first chaining. Charge = 3×3 clipped to board; arc = full row + column; prism = all gems of `color` (rocks excluded) plus itself; supernova = every cell. Any charge/arc gem caught → enqueues its own blast with `order + 1`; any prism caught (not the seed) → prism blast on `mostCommonColor` of the board at that moment. Each cell cleared once; cell keys `"r,c"`.

- [ ] **Step 1: Failing tests:** `specialFor maps shapes`; `specialCell prefers moved cell`; `specialCell center for line4 is lower-left of middle` (cells cols 2–5 → col 3); `specialCell for cross is intersection`; `charge clears 3x3 clipped at corner` (corner charge → 4 cells); `arc clears row and column` (15 cells); `charge catching an arc chains with order 1`; `prism caught in blast clears most common color` (board with 5 blue, 3 red → blue cleared); `prism blast never includes rocks`; `supernova clears everything`; `no cell appears twice across chained blasts`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `add special pieces and blast resolution`.

---

### Task 6: Scoring and tray rules

**Files:**
- Create: `src/engine/scoring.ts`, `src/engine/tray.ts`
- Test: `src/engine/scoring.test.ts`, `src/engine/tray.test.ts`

**Interfaces:**
- Consumes: Task 2 `rules.ts`.
- Produces:
  - `scoreRound(groups: MatchGroup[], blastOnlyPieces: number, chain: number): { points: number; combo: number }` = `(Σ MATCH_BASE[shape] + blastOnlyPieces × BLAST_PIECE_BASE) × CHAIN_MULT[min(chain,5)] × comboMult(groups.length)` rounded to an integer; with zero groups the combo multiplier is 1.
  - `countClears(counters: Record<Color, number>, tray: Color[], cleared: Cleared[]): { counters; tray; events: Step[] }`. For each cleared gem in order (key is a Color): increment; at `TRAY_THRESHOLD` subtract it; if `tray.length < TRAY_CAPACITY` push and emit `{t:'tray-earn', color, from: at, slot}`, and if the tray just reached capacity also emit `{t:'tray-full'}`; else emit `{t:'tray-lost', color, from: at}`. Rocks and prisms are ignored.
  - `canPlace(board: Board, tray: Color[], slot: number, at: Pos): boolean`: slot exists; target is a gem with `special === 'none'`; target color ≠ tray color (a same-color placement is refused as a no-op).

- [ ] **Step 1: Failing tests:** `single line3 at chain 0 scores 100`; `two groups at chain 2 score (100+200)*4*1.5 = 1800`; `chain caps at 32x` (chain 9 line3 → 3200); `blast-only pieces score 20 each`; `tenth red clear earns a red tray piece`; `counter carries remainder` (12 reds → counter 2, one earn); `filling the tray emits tray-full once`; `earn while full is lost and tray unchanged`; `rocks and prisms do not count`; `canPlace rejects rock, special, prism, same color, bad slot`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `add scoring and tray rules`.

---

### Task 7: Moves and applyMove (the cascade loop)

**Files:**
- Create: `src/engine/moves.ts`, `src/engine/resolve.ts`, `src/engine/index.ts` (re-exports the public engine API)
- Test: `src/engine/moves.test.ts`, `src/engine/resolve.test.ts`

**Interfaces:**
- Consumes: Tasks 2–6.
- Produces:
  - `isAdjacent(a: Pos, b: Pos): boolean`.
  - `productiveMoves(state: GameState): Move[]`: swaps where `swapCreatesMatch`, plus swaps where either piece is a prism and the other is a gem or prism (never rock), plus placements (`canPlace`) whose result contains a match. Placements deduplicated by `(color, at)`: when two slots hold the same color only the lowest slot is listed. Each swap is listed once with `a` before `b` in row-major order.
  - `allowedMoves(state: GameState): Move[]`: productive swaps + every `canPlace` placement (deduplicated the same way).
  - `isGameOver(state: GameState): boolean` ⇔ `productiveMoves(state).length === 0`.
  - `newGame(seed: number): GameState`.
  - `applyMove(state: GameState, move: Move): { state: GameState; script: Step[] }`.

`applyMove` semantics (spec §5):
1. If `state.over`, return the state unchanged with an empty script.
2. **Swap**, not adjacent or neither matching nor a legal prism swap: script `[swap-invalid]`, state unchanged (no move counted). Prism↔rock is invalid.
3. **Swap**, valid: emit `swap`. If a prism is involved: prism+prism → seed `supernova`; prism+charge/arc gem of color X → every gem of color X becomes that special (`created` entries) then each detonates as a seed; prism+plain gem X → seed `prism` with color X at the prism cell. Otherwise proceed to the cascade with `moved = [a, b]`.
4. **Place**: if `!canPlace`, return the state unchanged with an empty script. Else shift the slot out of the tray, replace the target with a new plain gem (`nextId++`), emit `place`. The removed piece is not scored or counted. Proceed to the cascade with `moved = [at]` (a placement with no match ends after `place`). Counts as a move.
5. **Cascade round** (chain starts at 0): `groups = findMatches`; special seeds = specials (charge/arc gems) inside matched cells; `resolveBlasts`; for each group with `specialFor(shape)` place the new special at `specialCell(group, moved)`. The created special's gem keeps that cell's piece id and color (a prism gets a new `kind:'prism'` piece with the same id), and that cell is excluded from clearing. Build `cleared`, emit `clear`, then `score` (blast-only pieces = cleared by blast and not in any group), then tray events from `countClears`, then `applyGravity` → `fall`. Repeat with `chain + 1` and `moved = []` while matches exist. Rounds that start from blasts but have no groups still emit `clear`/`score`/`fall`.
6. After the cascade: `moves + 1`; if `score - levelStartScore >= levelTarget` level up once: `level + 1`, `levelStartScore = score`, `levelTarget = levelTarget(level)`, fresh `createBoard` emitted as `level-up`. Then if `isGameOver` set `over` and emit `game-over`.
7. All randomness comes from `new Rng(state.rngState)`; the returned state carries the advanced `rngState`.

- [ ] **Step 1: Failing tests (`moves.test.ts`):** `productive swaps found on a fixture with exactly two`; `prism swap is productive with gem, not rock`; `placement listed only if it makes a match`; `allowedMoves includes non-matching placements, productiveMoves excludes them`; `same-color tray slots deduplicated`; `game over when no productive move even with dud placements available`; `not over when only a matching tray placement exists`.
- [ ] **Step 2: Failing tests (`resolve.test.ts`):** `invalid swap returns swap-invalid and same state`; `line3 swap: swap, clear, score 100, fall in that order`; `line4 creates charge at moved cell with same id`; `L creates arc`; `5-line creates prism`; `matched charge detonates and blast-only pieces score 20`; `prism + gem clears that color`; `prism + prism supernova clears board`; `prism + charge converts color then detonates`; `cascade chain increments and multiplies` (fixture where the refill is forced via seed; assert `score.chain` sequence 0,1); `non-matching placement emits only place and counts a move`; `matching placement resolves like a swap`; `placement onto rock returns empty script`; `level up replaces board once and resets progress`; `game-over emitted when the resulting board is dead`; `applyMove does not mutate input` (deep-frozen input via `structuredClone` + compare); `replay is deterministic` (`newGame(7)` + the first 30 `productiveMoves()[0]` moves twice → identical scripts and final states).
- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4:** Implement.
- [ ] **Step 5:** Run → PASS. Also `npm run lint`.
- [ ] **Step 6:** Commit `add move resolution and cascade loop`.

---

### Task 8: Search AI

**Files:**
- Create: `src/ai/weights.ts`, `src/ai/hash.ts`, `src/ai/search.ts`
- Test: `src/ai/search.test.ts`

**Interfaces:**
- Consumes: engine `index.ts`.
- Produces:
  - `hashVisible(state: GameState): number`: FNV-1a over board pieces (kind, color, special; not ids), tray, counters, level, score. Excludes `rngState` and `seed`.
  - `interface RankedMove { move: Move; value: number; expectedPoints: number }`.
  - `interface RankOptions { rolloutBudget?: number /* default 2400 */; minRollouts?: number /* 8 */; maxRollouts?: number /* 32 */ }`.
  - `rankMoves(state: GameState, opts?: RankOptions): RankedMove[]`, sorted by `value` descending, ties broken by move order from `productiveMoves`. Empty when there are no productive moves.
  - `weights.ts`: `export const W = { special: { charge: 150, arc: 250, prism: 600 }, rockCleared: 40, levelUp: 1500, healthPerMove: 15, healthFloor: 3, belowFloorPenalty: 400, gameOver: -100000, trayPieceSpent: 300 }` (starting values; tuned in Task 9).

Evaluation: `rollouts = clamp(floor(rolloutBudget / candidates), minRollouts, maxRollouts)`. For candidate *i* and rollout *k*, simulate `applyMove({ ...state, rngState: mix(hashVisible(state), i, k) }, move)`. The game's real `rngState` is never read. From the script and resulting state: `points` (score delta), specials created (by kind), rocks cleared, level-up, `productiveMoves(result).length` as health (`healthPerMove × min(count, 20)`, minus `belowFloorPenalty` when under `healthFloor`), `gameOver` if over, minus `trayPieceSpent` for placements. `value` = mean over rollouts (point units); `expectedPoints` = mean points.

- [ ] **Step 1: Failing tests:** `returns only productive moves`; `empty on dead board`; `ignores the hidden rng` (same state with `rngState` 1 vs 999 → identical ranking); `same state same ranking` (determinism); `prefers a 5-line over a 3-line` (fixture with both available); `avoids a move that ends the game when another exists` (fixture where one swap leaves zero productive moves); `values are in point units` (single line3 option with no cascade possible → `expectedPoints` ≈ 100 ± refill cascades, `value` ≥ `expectedPoints - W.trayPieceSpent`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `add search ai`.

---

### Task 9: Benchmark and tuning

**Files:**
- Create: `scripts/bench.ts`

**Interfaces:**
- Consumes: `newGame`, `applyMove`, `productiveMoves`, `rankMoves`.
- Produces: `npm run bench -- --games 20 --max-moves 400 [--seed 1]` prints, for `ai` and `baseline` (first productive move), the mean and median final score, mean level reached, mean moves, games ending by game-over vs move cap, and AI p50/p95 decision ms. Exits non-zero if the AI's mean score is not at least 1.5× the baseline's.

- [ ] **Step 1:** Dry run first, per Todd's standing rule: `npm run bench -- --games 1 --max-moves 50`. Expected: prints both rows, exits 0 or 1 within a minute.
- [ ] **Step 2:** Full run: `npm run bench -- --games 20 --max-moves 400`. Expected: exit 0; p95 decision under 150 ms on this Mac (a phone is roughly 3–4× slower; if p95 > 50 ms here, lower the default `rolloutBudget`).
- [ ] **Step 3:** Tune `src/ai/weights.ts`, and if levels fly by or never arrive, `levelTarget`/`rockChance` in `rules.ts`, so the AI typically reaches level 10+ within 400 moves. Record the final numbers in a comment at the top of `weights.ts`. Re-run `npm run test:run` (tests must still pass).
- [ ] **Step 4:** Commit `add ai benchmark and tune weights`.

---

### Task 10: AI worker and client

**Files:**
- Create: `src/ai/worker.ts`, `src/ai/client.ts`
- Test: `src/ai/client.test.ts`

**Interfaces:**
- Consumes: `rankMoves`, `RankedMove`.
- Produces: `interface AIClient { rank(state: GameState): Promise<RankedMove[]>; dispose(): void }`; `createAIClient(opts?: { inline?: boolean }): AIClient`. Worker protocol: request `{ id: number; state: GameState }`, response `{ id: number; ranked: RankedMove[] }`. Uses `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` when `typeof Worker !== 'undefined' && !opts.inline`, else runs `rankMoves` inline (in a resolved promise). Concurrent calls resolve independently by id; `dispose` terminates the worker and rejects pending calls with an `Error('disposed')`.

- [ ] **Step 1: Failing tests (inline mode):** `inline client ranks like rankMoves`; `concurrent ranks resolve to their own states`; `dispose rejects pending`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; `npm run build` succeeds and emits a worker chunk in `dist/assets`.
- [ ] **Step 5:** Commit `add ai worker client`.

---

### Task 11: Animation constants and script planner

**Files:**
- Create: `src/render/constants.ts`, `src/render/plan.ts`
- Test: `src/render/plan.test.ts`

**Interfaces:**
- Consumes: engine `Step`, `Piece`, `Pos`, `Blast`, `Color`, `Board`; `CueName` from Task 18 (declare `CueName` in `src/audio/cues.ts` now as the string union of every cue in spec §6.4, with the manifest values filled in Task 18).
- Produces (`constants.ts`, spec §6.2): `ANIM = { swapMs: 180, invalidMs: 160, popGrowMs: 110, popScale: 1.15, popCollapseMs: 140, sparks: [8, 14], gravity: 60 /* cells/s² */, landMs: 120, landSquash: { x: 1.08, y: 0.88 }, landReboundCells: 0.1, cascadeOverlapMs: 40, chargeShake: { px: 3, ms: 150 }, blastStaggerMs: 60, arcBeamMs: 200, prismBoltStaggerMs: 30, createMs: 220, trayFlyMs: 450, placeMs: 220, boardOutMs: 500, glow: { alphaLo: 0.221, alphaHi: 0.793, scaleLo: 0.983, scaleHi: 1.031, periodS: 3.46 }, selectPulseS: 0.9, hint: { revealMs: 1000, holdMs: 4000, maxArrows: 12, maxPlacements: 3 }, reducedMotionTimeScale: 1.6 }`; `fallDurationMs(cells: number): number = 1000 × √(2·cells / ANIM.gravity)`.
- Produces (`plan.ts`):
```ts
export type Action =
  | { a: 'swap'; ids: [number, number]; to: [Pos, Pos] }
  | { a: 'swap-back'; ids: [number, number]; a1: Pos; b1: Pos }
  | { a: 'place'; removedId: number; piece: Piece; slot: number; at: Pos }
  | { a: 'pop'; id: number; at: Pos; key: string }
  | { a: 'morph'; id: number; piece: Piece }
  | { a: 'blast'; blast: Blast }
  | { a: 'fall'; id: number; col: number; fromRow: number; toRow: number }
  | { a: 'spawn'; piece: Piece; col: number; fromRow: number; toRow: number }
  | { a: 'land'; id: number }
  | { a: 'tray-fly'; color: Color; from: Pos; slot: number }
  | { a: 'tray-lost'; color: Color; from: Pos }
  | { a: 'score'; total: number; points: number; chain: number; combo: number }
  | { a: 'notice'; kind: 'tray-full' | 'level-up' | 'game-over'; level?: number }
  | { a: 'board-out' } | { a: 'board-in'; board: Board }
  | { a: 'cue'; name: CueName; chain?: number };
export interface Planned { atMs: number; durMs: number; action: Action }
export function planScript(script: Step[], opts?: { timeScale?: number }): { items: Planned[]; totalMs: number };
```
Timing rules (all durations divided by `timeScale`): steps play sequentially. `swap` → `swap` action + `cue swap` at its start. `swap-invalid` → swap then swap-back (each `invalidMs`), `cue swap-invalid` at the start of the back leg. `clear`: pops at the step start (`popGrowMs + popCollapseMs`), blasts start at `step start + order × blastStaggerMs`, morphs of `created` at the step start (`createMs`), cues `match` (with `chain`) at start, `<kind>-blast` per blast, `<special>-create` per created, `rock-break` if any rock cleared. `score` → zero-duration `score` action at the clear step's start. `tray-earn` → `tray-fly` starting when the clear's pops finish + `cue tray-earn` at its end; `tray-full` → `notice` + cue at the fly end; `tray-lost` → action + cue. `fall`: **every** fall and spawn starts at the same instant: the end of the preceding clear (pops and blasts) minus nothing; each lasts `fallDurationMs(toRow - fromRow)` and is followed by a `land` (`landMs`) at its end; one `cue land` per column at that column's last landing (or `rock-drop` if the column's landing pieces include a rock). The next step starts at the last landing's end minus `cascadeOverlapMs`. `level-up` → `notice`, `cue level-up`, `board-out` (`boardOutMs`), then `board-in` (+ `cue board-in`) whose duration is `fallDurationMs(BOARD_SIZE) + landMs`. `game-over` → `notice` + `cue game-over`.

- [ ] **Step 1: Failing tests:** `fallDurationMs(1) ≈ 182.6 and (8) ≈ 516.4`; `all falls and spawns in a step share one start time`; `spawn fromRow is preserved` (spawn from -2 to 0 lasts `fallDurationMs(2)`); `each fall has a land at its end`; `next clear starts after last landing minus overlap`; `blast start offsets follow order × 60`; `invalid swap is out-and-back with cue at the back leg`; `one land cue per column`; `tray fly begins after pops`; `timeScale 2 halves totalMs`; `score action shares the clear start`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `add animation constants and script planner`.

---

### Task 12: Static Pixi board with breathing glow

**Files:**
- Create: `src/render/layout.ts`, `src/render/textures.ts`, `src/render/PieceSprite.ts`, `src/render/BoardView.ts`, `src/render/TrayView.ts`, `src/app/bootstrap.ts` (first version), `src/components/BoardCanvas.tsx`
- Modify: `src/App.tsx`
- Test: `src/render/layout.test.ts`

**Interfaces:**
- Consumes: engine types, `ANIM`, `docs/superpowers/specs/assets/voltline-pieces-reference.html` (symbols `v1`–`v9`: v1 red circle, v2 blue rounded square, v3 yellow triangle, v4 green hexagon, v5 magenta diamond, v6 orange plus, v7 cyan star, v8 rock chip, v9 prism ring; copy the geometry and colors from it).
- Produces:
  - `computeLayout(width: number, height: number): { cellPx: number; board: { x: number; y: number; size: number }; tray: { x: number; y: number; w: number; h: number; slotPx: number }; portrait: boolean }`: the tray strip always sits under the board; `cellPx` is an integer, max 72, chosen so board + tray fit inside the container.
  - `buildTextures(renderer: Renderer, cellPx: number, resolution: number): PieceTextures` with `piece(p: Piece): Texture` (gem by color + special overlay: charge = inner pulse ring, arc = crackle edge marks; prism; rock) and `halo(p: Piece): Texture | null` (pre-blurred, null for rock). Regenerated on layout change.
  - `class PieceSprite extends Container { id: number; setPiece(p: Piece, tex: PieceTextures): void; setBreathing(on: boolean): void; setSelected(on: boolean): void }`. Breathing animates the halo's alpha and scale between `ANIM.glow` values over `periodS`, ease sine in-out, yoyo, random phase per sprite.
  - `type Layout = ReturnType<typeof computeLayout>` (exported from `layout.ts`).
  - `class BoardView { readonly root: Container; constructor(tex: PieceTextures, reducedMotion: boolean /* true → no halo breathing, halos at the midpoint alpha */); setLayout(l: Layout, tex: PieceTextures): void; setBoard(b: Board): void; sprite(id: number): PieceSprite | undefined; cellXY(row: number, col: number): { x: number; y: number }; adopt(p: Piece, row: number, col: number): PieceSprite; release(id: number): void; snapToModel(b: Board): void }`. The board container has a rectangular mask the size of the board, so pieces above row 0 are invisible.
  - `class TrayView { readonly root: Container; setLayout(l: Layout, tex: PieceTextures): void; setTray(t: Color[]): void; slotXY(slot: number): { x: number; y: number }; setSelected(slot: number | null): void; setHinted(slots: number[]): void }`: five slots, empty slots drawn as dim outlines.
  - `createGame(host: HTMLElement, opts: { seed?: number }): Promise<GameHandle>`, first version: `new Application(); await app.init({ resizeTo: host, antialias: true, autoDensity: true, resolution: devicePixelRatio, backgroundAlpha: 0 })`, builds views, renders `newGame(seed)`. `GameHandle` is extended in Task 13.
  - `BoardCanvas` React component: a `div` host plus `useEffect` that calls `createGame` and destroys it on unmount (`app.destroy(true)`).
- Look (spec §6.3): page background `#0a0a11` with faint `rgba(120,140,255,.06)` 24px grid lines (CSS on body); board panel `rgba(0,0,0,.4)` with 1px `rgba(140,160,255,.14)` inset border, radius 10.

- [ ] **Step 1: Failing tests:** `computeLayout portrait 390x844` (portrait true, board fits width minus margins, tray under board); `landscape 1440x900` (cellPx capped at 72); `tiny 320x480 still fits`; `cellPx is an integer`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `layout.ts`, then the views.
- [ ] **Step 4:** Run → PASS. `npm run dev`; open with Playwright at 1440×900 and 390×844, screenshot both to `.playwright-mcp/`, view them: 64 neon pieces with visibly breathing halos (take two screenshots 1.7 s apart and confirm halo brightness differs), board panel and empty tray strip visible, no console errors.
- [ ] **Step 5:** Commit `render static board with breathing glow`.

---

### Task 13: Script player, controller, click play

**Files:**
- Create: `src/app/ports.ts`, `src/render/player.ts`, `src/app/controller.ts`, `src/render/input.ts` (click/tap only in this task)
- Modify: `src/app/bootstrap.ts`
- Test: `src/app/controller.test.ts`

**Interfaces:**
- Consumes: `planScript`, `BoardView`, `TrayView`, `applyMove`, `productiveMoves`, `isGameOver`, `newGame`, `AIClient`; `CueSink` (declare `interface CueSink { cue(name: CueName, opts?: { chain?: number }): void }` in `src/audio/cues.ts` now; no-op implementation here).
- Creates `src/app/ports.ts`, the shared interfaces later tasks implement:
```ts
export interface Effects { pop(at: {x:number;y:number}, color: number): void; blast(b: Blast, cellXY: (r:number,c:number)=>{x:number;y:number}): Promise<void>; shake(px: number, ms: number): void; morph(sprite: PieceSprite): void }
export const noopEffects: Effects;
export interface HintViewLike { show(ranked: RankedMove[], opts: { revealMs: number; holdMs: number; signal?: AbortSignal }): Promise<void>; clear(): void }
export type AISpeed = 'slow' | 'medium' | 'fast';
export interface Prefs { bestPlayer: number; bestAI: number; aiSpeed: AISpeed; muted: boolean; volume: number }
export interface PrefsStore { load(): Prefs; save(p: Prefs): void }
```
- Produces:
  - `interface ScriptPlayerLike { play(script: Step[]): Promise<void>; relayout(): void }`.
  - `class ScriptPlayer implements ScriptPlayerLike { constructor(deps: { board: BoardView; tray: TrayView; effects: Effects; audio: CueSink; onAction: (a: Action) => void; reducedMotion: boolean }) }`: builds one GSAP timeline per `play` from `planScript` (timeScale `ANIM.reducedMotionTimeScale` when reduced motion), resolves when it completes, then `snapToModel` with the final board. Fall/spawn tweens use `ease: 'power2.in'` on `y` only; `land` is a squash to `ANIM.landSquash` and back with a rebound of `landReboundCells` (`power2.out`). Spawned sprites are adopted at `cellXY(fromRow, col)` (above the mask). Popped sprites are released after their pop. `score`/`notice`/`tray-*` actions are forwarded to `onAction` at their timestamps. Selection/hover never uses CSS or a tween on the same property as the timeline.
  - `interface UiSnapshot { score: number; level: number; levelProgress: number; tray: Color[]; trayFull: boolean; moves: number; over: boolean; busy: boolean; selected: Pos | null; selectedSlot: number | null; aiOn: boolean; aiSpeed: AISpeed; aiMoves: number; best: { player: number; ai: number }; notice: { kind: 'tray-full' | 'level-up' | 'game-over'; level?: number } | null }`.
  - `class GameController { constructor(deps: { player: ScriptPlayerLike; ai: AIClient; hint: HintViewLike; prefs: PrefsStore; onChange: (s: UiSnapshot) => void; seed?: number; doc?: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'> }); readonly state: GameState; snapshot(): UiSnapshot; tapCell(p: Pos): void; tapSlot(slot: number): void; swap(a: Pos, b: Pos): void; submit(move: Move): Promise<void>; newGame(): Promise<void>; hint(): Promise<void>; setAI(on: boolean): void; setAISpeed(s: AISpeed): void; relayout(): void; dispose(): void }`. Tests use `{ show: async () => {}, clear: () => {} }` for the hint view and an in-memory `PrefsStore`.
  - Displayed score (`snapshot().score`) updates from `score` actions during playback, not from the engine state up front; it equals `state.score` when `busy` turns false.
  - Selection rules: tap selects; tapping an adjacent cell swaps; tapping a non-adjacent cell moves the selection; tapping the selected cell deselects. With `selectedSlot` set, tapping a cell submits `{type:'place'}` (if `canPlace`, else clears the slot selection). Input is ignored while `busy` or while AI mode is on.
  - `bootstrap.ts` now builds `ScriptPlayer`, `GameController`, `attachInput(app, boardView, trayView, { tapCell, tapSlot, swap })`, and on resize calls `computeLayout` → `setLayout` → `controller.relayout()` (which defers to the end of the running timeline if busy). `GameHandle = { controller: GameController; destroy(): void }`.

- [ ] **Step 1: Failing tests (fake player that records scripts and resolves on demand, inline AI):** `tap adjacent swaps and plays script`; `controller ignores submit while busy` (second submit during an unresolved play is dropped; state advanced once); `invalid swap does not count a move`; `score in snapshot follows score actions`; `tray slot then cell submits place`; `new game waits for current move` (newGame during play resolves after it and yields fresh state with score 0); `resize during play re-lays out after timeline` (`relayout` called on the player only after the play resolves); `best player score saved on game over`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Feel check.** `npm run dev`; play 10+ moves by clicking. In Playwright, record a video or take a 30 fps screenshot burst through one cascade and confirm: no piece ever appears at its destination before falling; every column starts falling on the same frame; new pieces enter from above the top edge, spaced one cell apart; landings squash and settle; no blink between cascade rounds. Fix anything that fails before committing.
- [ ] **Step 6:** Commit `play engine scripts with gravity animation`.

---

### Task 14: Effects: pops, particles, blasts, shake

**Files:**
- Create: `src/render/effects.ts`
- Modify: `src/render/player.ts` (call effects for `pop`, `blast`, `morph`), `src/app/bootstrap.ts`

**Interfaces:**
- Consumes: `Effects` from `src/app/ports.ts` (Task 13).
- Produces: `class PixiEffects implements Effects { constructor(layer: Container, stage: Container, reducedMotion: boolean) }`.
- Spec §6.2 values: pop sparks `ANIM.sparks` per piece, additive blend, color of the piece; charge = expanding ring + 3×3 flash + `chargeShake`; arc = two beams sweeping the row and column over `arcBeamMs`; prism = a bolt from the prism to each target staggered `prismBoltStaggerMs`; supernova = all prism bolts plus a full-board flash. Reduced motion: no shake, half the sparks. Particles come from a fixed pool (no allocation per frame).

- [ ] **Step 1:** Implement. **Step 2:** In the dev build, add a dev-only query flag `?fixture=<name>` (stripped from production via `import.meta.env.DEV`) that loads one of four fixture boards from `src/app/devFixtures.ts`: `charge`, `arc`, `prism`, `supernova`, each one move away from that effect. Trigger each in Playwright and screenshot mid-effect; view all four.
- [ ] **Step 3: Frame check.** In Playwright, run the `supernova` fixture with `performance.now()` frame sampling via `requestAnimationFrame` for 2 s; assert p95 frame time < 16.7 ms on this Mac. Record the number in the commit body.
- [ ] **Step 4:** `npm run lint && npm run test:run` → PASS. Commit `add particle and blast effects`.

---

### Task 15: Drag, swipe and tray input

**Files:**
- Modify: `src/render/input.ts`
- Test: `src/render/input.test.ts`

**Interfaces:**
- Produces: `gestureToMove(start: {x:number;y:number}, end: {x:number;y:number}, cellPx: number, startCell: Pos): Pos | null`: returns the neighbour cell when the drag exceeds `0.3 × cellPx` along its dominant axis and stays on the board, else null. `attachInput` uses pointer events on the Pixi stage (`eventMode = 'static'`): pointerdown on a cell starts a gesture; crossing the threshold triggers `swap` immediately (no need to release); a release under the threshold is a tap. Tray slots are tappable. While dragging, the grabbed piece follows the pointer up to 0.5 cell along the dominant axis, then the swap tween takes over from its current position.

- [ ] **Step 1: Failing tests:** `right drag past threshold returns right neighbour`; `short drag is tap (null)`; `diagonal resolves to dominant axis`; `drag off board edge returns null`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS. Manual check in Playwright with mouse drag, plus touch emulation (`hasTouch: true`, 390×844) swipe.
- [ ] **Step 5:** Commit `add drag, swipe and tray input`.

---

### Task 16: Chrome UI, persistence and notices

**Files:**
- Create: `src/theme.ts`, `src/app/storage.ts`, `src/app/useGame.ts`, `src/components/Header.tsx`, `src/components/ScoreDisplay.tsx`, `src/components/LevelBar.tsx`, `src/components/GameControls.tsx`, `src/components/GameOverDialog.tsx`, `src/components/TrayNotice.tsx`, `public/icon.svg`
- Modify: `src/App.tsx`, `src/components/BoardCanvas.tsx`, `index.html` (favicon)
- Test: `src/app/storage.test.ts`, `src/components/GameOverDialog.test.tsx`, `src/components/TrayNotice.test.tsx`

**Interfaces:**
- Produces:
  - `createPrefsStore(store?: Storage | null): PrefsStore` (implements `PrefsStore` from `ports.ts`; defaults `bestPlayer 0, bestAI 0, aiSpeed 'medium', muted false, volume 0.8`). Key `voltline.prefs.v1`, one JSON object. Any throw or invalid shape → defaults / silent no-op.
  - `useGame(host: RefObject<HTMLElement>): { ui: UiSnapshot | null; actions: { newGame(); hint(); setAI(on: boolean); setAISpeed(s: AISpeed); setMuted(m: boolean); setVolume(v: number) } }`.
  - Theme: MUI dark, background `#0a0a11`, display font Orbitron (scores, level, titles), body Rajdhani, imported from `@fontsource/orbitron/700.css`, `@fontsource/rajdhani/500.css`, `@fontsource/rajdhani/700.css`.
  - `ScoreDisplay`: counts up to the new value over ~400 ms with `requestAnimationFrame` (tabular numerals, no layout shift). `LevelBar`: `Level {n}` plus a neon progress bar from `levelProgress`.
  - Exact copy (curly punctuation): tray full notice `Tray full—spend one to free a slot.`; level up `Level {n}!`; game over title `No moves left`; game over body lines `Score {score}`, `Level {level}`, `Best {best}` (AI games label it `AI best {best}`); new best line `New best!`; buttons `Hint`, `New game`, `Play again`.
- `TrayNotice` is visible whenever `ui.trayFull` is true (persistent, not a timed toast) and announces via `aria-live="polite"`.

- [ ] **Step 1: Failing tests:** `storage survives throwing and corrupt localStorage` (store whose `getItem`/`setItem` throw → defaults, no throw; store containing `"{bad"` → defaults); `prefs round-trip`; `GameOverDialog shows score, level and best with curly copy` (renders `No moves left`); `GameOverDialog labels AI best for AI games`; `TrayNotice renders the full message only when trayFull`. Use `/** @vitest-environment jsdom */` in component tests.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement and wire into `App` (header: title `Voltline`, score, level bar, mute; under the canvas: Hint, New game; dialogs).
- [ ] **Step 4:** Run → PASS. Screenshot desktop and phone layouts in Playwright; view both.
- [ ] **Step 5:** Commit `add game chrome, persistence and notices`.

---

### Task 17: Hint layer and AI mode

**Files:**
- Create: `src/render/HintLayer.ts`, `src/components/AIControls.tsx`
- Modify: `src/app/controller.ts`, `src/app/bootstrap.ts`, `src/App.tsx`
- Test: `src/render/HintLayer.test.ts`, extend `src/app/controller.test.ts`

**Interfaces:**
- Produces:
  - `pickHintArrows(ranked: RankedMove[], maxArrows = ANIM.hint.maxArrows, maxPlacements = ANIM.hint.maxPlacements): RankedMove[]`: keeps every swap and the top `maxPlacements` placements, then the top `maxArrows` by value, sorted descending.
  - `class HintLayer implements HintViewLike { constructor(board: BoardView, tray: TrayView, audio: CueSink) }` (`HintViewLike` from `ports.ts`). Arrows: swap = arrow between the two cell centres; placement = arrow from `tray.slotXY(slot)` to the target cell centre (the Pixi stage holds both, so the arrow is never clipped); each labelled `≈ {value}` formatted with thousands separators. Over `revealMs` arrows fade out lowest-value first; the best stays pulsing for `holdMs` or until `clear()`; `show` resolves when the reveal finishes (not the hold). Plays `cue hint-scan` at start and `cue hint-lock` when one remains.
  - Controller: `hint()` ranks the current state and calls `show(…, ANIM.hint)`; any tap, swap or new game calls `clear()`. AI speeds: `AI_PACE = { slow: { revealMs: 1000, pauseMs: 600 }, medium: { revealMs: 500, pauseMs: 300 }, fast: { revealMs: 150, pauseMs: 100 } }` in `controller.ts`. AI loop: while on and not over: `await rank` → `await show({ revealMs, holdMs: 0 })` → `clear()` → `await submit(best.move)` → `aiMoves++` → wait `pauseMs`. Each loop iteration and each `rank` captures a generation number; a result arriving after `setAI(false)`, `newGame()` or a newer generation is discarded. While `doc.hidden` the loop waits for `visibilitychange`. Games where AI mode made any move are AI games for best-score purposes.
  - `AIControls`: an `AI` on/off switch, `Slow / Medium / Fast` toggle, `AI moves {n}` counter, and a small `Thinking…` indicator while ranking.

- [ ] **Step 1: Failing tests:** `pickHintArrows caps placements then arrows`; `pickHintArrows keeps best first`; `hint shows ranked moves and clears on tap`; `ai plays until game over` (fake AI returning first productive move; dead-ending fixture → stops with `over`); `stale ai result is discarded after new game` (rank promise resolved after `newGame()` → no move applied, `moves` 0); `ai pauses while document hidden` (fake doc hidden → no rank calls until `visibilitychange` with hidden false); `ai game best stored as ai best, not player best`; `player input ignored while ai on`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Manual check: press Hint on a live board and watch arrows fade to one; run AI on Fast for 2 minutes in Playwright and confirm it keeps playing (or reaches game over) without stalls or console errors.
- [ ] **Step 6:** Commit `add hint visualization and ai mode`.

---

### Task 18: Sound engine and audio pipeline

**Files:**
- Modify: `src/audio/cues.ts` (fill manifest)
- Create: `src/audio/engine.ts`, `scripts/encode-audio.sh`, `audio-src/README.md`, `public/audio/.gitkeep`
- Modify: `src/app/bootstrap.ts`, `src/app/useGame.ts`, `src/components/Header.tsx` (mute + volume), `package.json`
- Test: `src/audio/engine.test.ts`, `src/render/plan.test.ts` (cue coverage)

**Interfaces:**
- Produces:
  - `CUES: Record<CueName, { bus: 'sfx' | 'ui' | 'music'; gain: number; voices: number; cooldownMs: number; variants?: number; chainSet?: number; loop?: boolean; stereo?: boolean }>` covering every cue in spec §6.4 (`select, swap, swap-invalid, match, land, charge-create, charge-blast, arc-create, arc-blast, prism-create, prism-blast, prism-supernova, rock-drop, rock-break, tray-earn, tray-full, tray-lost, tray-pick, tray-place, hint-scan, hint-lock, level-up, board-in, game-over, new-best, ui-click, ui-toggle, music-loop`). `match.chainSet = 5`, `land: { voices: 3, cooldownMs: 40, variants: 3 }`; `stereo: true` for `level-up, game-over, prism-supernova, new-best, music-loop`.
  - `class AudioEngine implements CueSink { constructor(deps: { createContext: () => AudioContext; fetch: typeof fetch; base: string; rng?: () => number }); load(): Promise<void>; unlock(): void; cue(name: CueName, opts?: { chain?: number }): void; setMuted(m: boolean): void; setVolume(v: number): void; suspend(): void; resume(): void }`. Load picks `.webm` if `new Audio().canPlayType('audio/webm; codecs="opus"')` else `.m4a`, fetches `${base}/${name}[-n].ext` for each cue/variant/chain file, decodes, and silently skips 404s or decode errors (one `console.warn` per missing file, dev only). `cue`: no-op until unlocked or if muted/missing; enforces `voices` and `cooldownMs`; random pitch `±3%` and gain `±1.5 dB`; `match` with `chain` uses `match-chain-{min(chain+1,5)}` if loaded, else `playbackRate × 2^(min(chain,7)/12)`. `unlock` is called from the first `pointerdown`/`keydown`; `suspend`/`resume` on `visibilitychange`.
  - `encode-audio.sh`: for each `audio-src/*.wav`: trim with `silenceremove` (start and stop, −60 dB); **loudness-normalize, never peak-normalize** (Todd: they must not come out too loud): measure each trimmed file's RMS level (`astats` overall RMS, which works on sounds shorter than the 400 ms LUFS gating block) and apply gain so every file sits at `TARGET_RMS = -20 dBFS`, then a true-peak limiter (`alimiter=limit=0.708`, i.e. −3 dBTP) so nothing clips after lossy encoding; relative mix balance between cues comes only from `CUES[cue].gain` at runtime, never from the source files. `npm run audio -- --report` prints each file's measured RMS, peak and applied gain without writing anything. Then encode `public/audio/<name>.webm` (libopus, 64k mono; 128k stereo for the stereo cues and `music-*`) and `public/audio/<name>.m4a` (aac, 96k mono / 160k stereo). Skips files whose outputs are newer than the source. Prints a table of name, duration, sizes. Exits non-zero if ffmpeg is missing, with a `brew install ffmpeg` hint. Source files may be `.wav`, `.mp3`, `.flac` or `.aif(f)`; the cue name is the file stem (`land-2.wav` → variant 2 of `land`); subfolders (the Freesound packs) and non-audio files are ignored.
  - `audio-src/README.md`: points at `voltline-sounds.xlsx` (the source of truth for cues, files and provenance), the format guidance, and `uv run scripts/sound-credits.py` to regenerate `CREDITS.md` after editing the sheet. Starting `CUES` gains: ui −8 dB, `land`/`select`/`tray-pick` −6 dB, blasts and `level-up`/`game-over` 0 dB, everything else −3 dB; tune by ear.

- [ ] **Step 1: Failing tests (fake AudioContext/fetch):** `missing files degrade to silence without throwing`; `cue is silent until unlock`; `voice limit and cooldown hold under a burst` (50 `land` cues in 10 ms → ≤3 sources started); `chain pitch rises a semitone per level capped at 7`; `chain set file preferred when present`; `muted plays nothing`. In `plan.test.ts`: `every cue name planned exists in CUES` and `cues fire at their action timestamps` (pop cue at the clear start, land cue at the column's last landing end).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement and wire into `ScriptPlayer`, `HintLayer`, controller (`select`, `tray-pick`, `tray-place`, `ui-*`, `new-best`).
- [ ] **Step 4:** Run → PASS. Dry run the encoder on one generated test tone: `ffmpeg -f lavfi -i sine=f=880:d=0.3 audio-src/select.wav && npm run audio`, confirm `public/audio/select.webm` and `.m4a` exist and play in the dev build on tap; then delete the test tone and its outputs.
- [ ] **Step 5:** Commit `add sound engine and audio pipeline`.

---

### Task 19: Docs, rename, deploy and smoke test

**Files:**
- Rewrite: `README.md`, `CLAUDE.md`, `AGENTS.md`
- Modify: `package.json` (`"license": "MIT"`), `LICENSE` (copyright line → `Copyright (c) 2025–2026 Todd Greco`)
- Create: `scripts/smoke.spec.ts`, `playwright.config.ts`, `AI-ASSISTANCE.md`

**Interfaces:**
- Produces: `npm run smoke` (`playwright test scripts/smoke.spec.ts`) against `vite preview`: loads the page, waits for the canvas, makes three swaps from `productiveMoves` exposed via a dev-only `window.__voltline` handle (only when `import.meta.env.DEV || ?debug=1`), presses Hint, toggles AI for 10 s, asserts no console errors and that `moves > 0`, and saves screenshots at 1440×900 and 390×844 under `.playwright-mcp/`.

- [ ] **Step 1:** Ask Todd to confirm he has renamed the GitHub repo to `mrballistic/voltline` (Settings → General → Repository name). Do not proceed with Step 2 until he confirms.
- [ ] **Step 2:** `git remote set-url origin https://github.com/mrballistic/voltline.git`; `git remote -v` shows the new URL. (`deploy.sh` is retired in Task 20 in favour of the Pages workflow; leave it untouched here.)
- [ ] **Step 3:** Rewrite `README.md` (what Voltline is, features, controls, AI/hint explanation, sound pipeline, commands, live URL `https://voltline.mrballistic.com`), `CLAUDE.md` (the architecture, module map, invariants from this plan's Global Constraints, commands; drop every Anthropic/Gemini/react-dnd/MUI 6 instruction) and `AGENTS.md` (short pointer to CLAUDE.md conventions). README links `LICENSE` (MIT) and has an **AI assistance** heading linking `AI-ASSISTANCE.md`.
- [ ] **Step 3b:** Write `AI-ASSISTANCE.md`: design, code, tests and docs were produced with Anthropic's Claude via Claude Code under Todd's direction and review; piece art is drawn in code from mockups made the same way; the in-game AI and hints are a deterministic search engine, not generative AI, and make no network calls; a line for the sound files reading `Sound effects: supplied by Todd Greco. Origin: TODO (Todd to fill in).` Public copy: no em-dashes, never the phrase "load bearing". Update `LICENSE` and `package.json` as listed above.
- [ ] **Step 4:** Run the full gate: `npm run lint && npm run test:run && npm run build && npm run bench -- --games 5 --max-moves 200 && npm run smoke`. Expected: all exit 0. View the smoke screenshots.
- [ ] **Step 5:** Commit `rewrite docs and add smoke test for voltline`. Do not push or deploy until Todd asks.

---

### Task 20: CI/CD pipeline and Node 26

Modeled on `~/current_work/brass-lantern/.github/` (`ci.yml`, `dependabot.yml`) and, for deployment, `~/current_work/infocom-office-space` (`.github/workflows/deploy.yml`, `DEPLOY.md`, `deploy/apache-initech*.conf`): Voltline ships to Todd's server at `https://voltline.mrballistic.com`, not GitHub Pages (Todd, 2026-11-13). Read those first; same conventions: SHA-pinned actions with the version in a comment, `persist-credentials: false`, least-privilege `permissions`, comments explaining each non-obvious step).

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `.github/dependabot.yml`, `.nvmrc`, `CHANGELOG.md`, `scripts/release-notes.mjs`, `DEPLOY.md`, `deploy/apache-voltline.conf` (port 80 → https redirect + ACME), `deploy/apache-voltline-le-ssl.conf` (443 vhost)
- Modify: `package.json` (engines, @types/node, @vitest/coverage-v8, `test:coverage`, `type-check`), `vite.config.ts` (coverage config), `README.md`/`CLAUDE.md` (CI, release and deploy sections)
- Delete: `deploy.sh`

**Interfaces:**
- Produces: scripts `type-check` (`tsc --noEmit`), `test:coverage` (`vitest run --coverage`). Coverage (v8) thresholds apply to `src/engine/**` and `src/ai/**` only: lines 90, branches 85, functions 90. `scripts/release-notes.mjs <version>` prints the `## <version>` section of `CHANGELOG.md` and exits 1 if missing. `CHANGELOG.md` starts with `## 1.0.0` describing the rebuild; `package.json` version becomes `1.0.0`.
- `ci.yml` (push to main, PRs to main, `workflow_call`; `contents: read`): job `check` on ubuntu-latest, Node 26: `npm ci`, `lint`, `type-check`, `test:coverage`, `build`, `npm run bench -- --games 5 --max-moves 200`, bundle hygiene (fail if `dist/` contains `AIza[0-9A-Za-z_-]{35}`, `sk-ant-`, `generativelanguage.googleapis`, `api.anthropic.com`, or any `fonts.googleapis.com`), then `npx playwright install --with-deps chromium` and `npm run smoke`; on failure upload the Playwright report and `.playwright-mcp/` screenshots with `actions/upload-artifact` (v7).
- `deploy.yml` (tags `v*`; `contents: read`; concurrency group `deploy`, no cancel), the initech flow minus the backend: job `verify` (tag on main, tag equals `package.json` version, `release-notes.mjs` succeeds) → `ci` (`uses: ./.github/workflows/ci.yml`) → `deploy` in environment `production` (url `https://voltline.mrballistic.com`; secrets `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, `DEPLOY_HOST`, `DEPLOY_USER`): `npm ci && npm run build`, SSH config with `StrictHostKeyChecking yes`, rsync `dist/` to `/var/www/voltline` (`--chmod=D755,F644`, everything except `index.html` first, then a `--delete` pass), smoke test `curl -fsS https://voltline.mrballistic.com/ | grep -q '<title>Voltline</title>'` plus one hashed asset returning 200 → `release` job (`contents: write`, never sees deploy secrets) creates the GitHub Release `Voltline <version>` from the CHANGELOG section (prerelease when the version has a `-`), leaving an existing one alone.
- Apache vhosts (static only, no proxy): `DocumentRoot /var/www/voltline`, `Options -Indexes`, `FallbackResource /index.html`, immutable caching for hashed `assets/*` and `audio/*`, `no-cache` for `index.html`, HSTS and the same defense-in-depth headers as initech, `AddType audio/webm .webm` and `AddType audio/mp4 .m4a`, and a CSP matching the Tauri one (`default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:`).
- `DEPLOY.md`: releasing, what the pipeline does, production layout, the `voltline-deploy` user (owns `/var/www/voltline`, `restrict`ed CI key, no sudo), one-time server setup (user + dir, port-80 vhost before certbot, `certbot --apache -d voltline.mrballistic.com`, replace certbot's 443 vhost with the repo's), CI secrets, rollback (re-run the deploy for an older tag), and the initech gotchas that apply to a static site.
- `dependabot.yml`: npm monthly with minor/patch grouped; ignore `typescript` and `@types/node` semver-major (comment why: TS held on 6.x until typescript-eslint accepts 7; @types/node follows the Node runtime major); github-actions monthly.
- Action versions verified at planning time (re-check with `gh api repos/<owner>/<repo>/releases/latest --jq .tag_name` and pin the SHA of that tag): checkout v7.0.1, setup-node v7.1.0, upload-artifact v7.0.2.

- [ ] **Step 1:** Node 26: write `.nvmrc` (`26`), set `engines.node` to `>=26`, `npm i -D @types/node@^26 @vitest/coverage-v8@5.1.0`; `nvm use` then `npm ci && npm run test:run && npm run build` → exit 0.
- [ ] **Step 2:** Add `type-check`, `test:coverage` and the coverage thresholds; `npm run test:coverage` → exit 0 with thresholds met (if not, add the missing engine/AI tests rather than lowering thresholds).
- [ ] **Step 3:** Write `release-notes.mjs` and `CHANGELOG.md`; `node scripts/release-notes.mjs 1.0.0` prints the section; `node scripts/release-notes.mjs 9.9.9` exits 1.
- [ ] **Step 4:** Write `ci.yml`, `deploy.yml`, `dependabot.yml`, the two vhost files and `DEPLOY.md`; delete `deploy.sh` (the gh-pages force-push is retired). `actionlint` (install with `brew install actionlint` if missing) → no findings. Compare the vhosts line by line with initech's known-good ones.
- [ ] **Step 5:** Docs: README/CLAUDE.md describe CI, the server deploy and the release steps (bump version, add the CHANGELOG section, merge to main, `git tag -a vX.Y.Z -m … && git push origin vX.Y.Z`). The live URL everywhere becomes `https://voltline.mrballistic.com`.
- [ ] **Step 6:** Commit `add ci and server deploy pipeline on node 26`. Do not push.
- [ ] **Step 7 (controller, not the implementer; Todd authorized SSH changes on 2026-11-13; needs the `voltline.mrballistic.com` DNS record to resolve):** one-time server setup over SSH following `DEPLOY.md`: create `voltline-deploy` and `/var/www/voltline`, install the port-80 vhost, `certbot --apache -d voltline.mrballistic.com`, install the 443 vhost, `apache2ctl configtest && systemctl reload apache2`, generate the CI deploy key and install its public half with `restrict`, add the four `production` environment secrets with `gh secret set --env production`, restrict the environment to `v*` tags. Inspect existing vhosts first and change nothing that belongs to other sites.

---

### Task 21: Desktop app (Tauri 2) and signed universal macOS build

Modeled on Snipes (`~/current_work/Snipes/scripts/make-macos-app.sh`, `.github/workflows/macos-universal.yml`, `BUILDING.md`): CI builds an unsigned universal app; Todd signs and notarizes locally with his Developer ID and notary keychain profile.

**Files:**
- Create: `src-tauri/` (`Cargo.toml`, `build.rs`, `src/main.rs`, `tauri.conf.json`, `capabilities/default.json`, `icons/` generated with `npx tauri icon` from a 1024 px PNG rendered from `public/icon.svg`), `scripts/make-macos-app.sh`, `.github/workflows/macos-universal.yml`, `BUILDING.md`
- Modify: `package.json` (`@tauri-apps/cli` `2.12.4` dev dep; scripts `desktop:dev` = `tauri dev`, `desktop:build` = `tauri build`), `.gitignore` (`src-tauri/target`), `README.md` (download/build section)

**Interfaces:**
- `tauri.conf.json`: `productName` `Voltline`, `identifier` `com.mrballistic.voltline`, `version` read from `../package.json`, `build.frontendDist` `../dist`, `build.devUrl` `http://localhost:5173`, `beforeDevCommand` `npm run dev`, `beforeBuildCommand` `npm run build`; one window titled `Voltline`, 1100×900, min 380×640, resizable; `bundle.targets` `["app", "dmg"]`, `bundle.category` `public.app-category.puzzle-games`, `bundle.license` `MIT`, `bundle.copyright` `Copyright (c) 2025–2026 Todd Greco`, `bundle.macOS.minimumSystemVersion` `13.0`. CSP: `default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:`. No Tauri plugins or IPC commands (the game is a pure web app); `capabilities/default.json` grants only `core:default`.
- `scripts/make-macos-app.sh` (same CLI shape as Snipes): `--no-sign` builds `dist-desktop/Voltline.app` for the current arch; `--universal` builds `--target universal-apple-darwin` (needs `rustup target add aarch64-apple-darwin x86_64-apple-darwin`); `--app PATH` signs an existing app. Signing: `SIGN_IDENTITY` (default: first `Developer ID Application` identity in the keychain), `codesign --force --options runtime --timestamp --sign`; then, if `NOTARY_PROFILE` is set, `xcrun notarytool submit --keychain-profile "$NOTARY_PROFILE" --wait` and `xcrun stapler staple`. Packages `dist-desktop/Voltline-<version>-macos-universal.zip` and, if `create-dmg` is installed, a signed and notarized drag-to-Applications `.dmg`. Verifies with `spctl -a -vvv -t exec` and `codesign --verify --deep --strict`.
- `macos-universal.yml` (push to main + `workflow_dispatch`, macos-latest, `contents: read`): Node 26, Rust stable with both Apple targets, `npm ci`, `npm run build`, `scripts/make-macos-app.sh --universal --no-sign`, upload `Voltline-universal-unsigned.zip` (upload-artifact v7).
- `BUILDING.md`: web build, desktop dev, the unsigned CI artifact, and Todd's local sign/notarize/package steps (`gh run download … --name Voltline-universal-unsigned`, then `NOTARY_PROFILE=<profile> scripts/make-macos-app.sh --app …`).

- [ ] **Step 1:** `npm i -D @tauri-apps/cli@2.12.4`; `npx tauri init` non-interactively (or hand-write) the files above; `npm run desktop:dev` opens the game in a native window; the board animates, sound unlocks on first click, best score persists across relaunch.
- [ ] **Step 2:** `scripts/make-macos-app.sh --universal --no-sign` → `dist-desktop/Voltline.app`; `lipo -archs dist-desktop/Voltline.app/Contents/MacOS/*` shows `x86_64 arm64`; the app launches.
- [ ] **Step 3:** Local signing only: `scripts/make-macos-app.sh --app dist-desktop/Voltline.app` with no `NOTARY_PROFILE` → `codesign --verify --deep --strict` passes. **Stop here and ask Todd before notarizing**: notarization uploads the binary to Apple. When he confirms (and names the profile, e.g. the existing `snipes-notary`), run with `NOTARY_PROFILE` set and confirm `spctl` reports `source=Notarized Developer ID`.
- [ ] **Step 4:** Write `macos-universal.yml`; `actionlint` clean. Write `BUILDING.md` and the README section.
- [ ] **Step 5:** Commit `add tauri desktop app and signed universal macos build`. Do not push or publish a release.

---

### Task 22 (POST-RELEASE — do not execute in the initial run): Windows and Linux build path

**Files:** Modify `BUILDING.md`, `.github/workflows/` (new `desktop-other.yml`).

- Document building from source on Windows (WebView2, MSVC build tools, `npm ci && npm run desktop:build` → `.msi`/NSIS) and Linux (WebKitGTK 4.1 packages for Debian/Ubuntu and Fedora, `npm run desktop:build` → AppImage/.deb). Note the WebKitGTK WebGL caveat and how to report rendering problems.
- `desktop-other.yml` (`workflow_dispatch` only): ubuntu-latest and windows-latest matrix building unsigned bundles and uploading them as artifacts, so the documented path is exercised. No signing for these platforms.
- Smoke-test each artifact by launching it (Linux under `xvfb-run`), and record results in BUILDING.md.
