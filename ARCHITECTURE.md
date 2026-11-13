# Architecture

How Voltline is put together. For what the game is and how to play it, see [README.md](./README.md). Sound provenance is in [CREDITS.md](./CREDITS.md).

Voltline is a work in progress. The rules engine and the search AI exist and are tested. The renderer, sound engine, app shell and UI, the desktop app and deployment are **planned** and marked as such below. The design is in `docs/superpowers/specs/2026-11-13-voltline-rebuild-design.md` and the task plan in `docs/superpowers/plans/2026-11-13-voltline-rebuild.md`.

- [Overview](#overview)
- [From tap to animation](#from-tap-to-animation)
- [The engine](#the-engine)
- [The AI](#the-ai)
- [The renderer (planned)](#the-renderer-planned)
- [Sound](#sound)
- [App shell (planned)](#app-shell-planned)
- [Stack](#stack)
- [Project layout](#project-layout)
- [Local development](#local-development)
- [Testing](#testing)
- [Conventions](#conventions)
- [History](#history)

## Overview

Three concerns, kept apart:

1. **A pure rules engine** (`src/engine`). A move in, the next state plus an ordered **event script** out. Deterministic for a given seed. No DOM, React, Pixi, GSAP or audio imports, so it runs on the main thread and in a Web Worker.
2. **A search AI** (`src/ai`) built on that engine. It powers both AI mode and Hint.
3. **A presentation layer** (planned): a PixiJS canvas board that only plays the script back, with React and MUI around it, and a Web Audio sound engine fed from the same script.

The client is static and offline: no server, no LLM, no API key, no runtime network calls.

## From tap to animation

This is the intended flow; steps 1 to 3 exist, the rest are planned.

1. **Input** (planned `render/input.ts`): a tap, drag, swipe or tray tap becomes a `Move`, either `{ type: 'swap', a, b }` or `{ type: 'place', slot, at }`.
2. **Controller** (planned `app/controller.ts`): ignores input while a script is playing, then calls `applyMove(state, move)`.
3. **Engine**: returns the new `GameState` and a `Step[]` script. Illegal swaps return a `swap-invalid` step and an unchanged state.
4. **Plan** (planned `render/plan.ts`): turns the script into timed animation, as pure code.
5. **Player** (planned `render/player.ts`): runs the plan with GSAP over Pixi display objects and fires sound cues at the moment their visual happens.
6. The controller commits the new state when the timeline ends.

The renderer owns every on-screen position. React never lays out the board, so there is no commit-then-animate blink, and a moved piece is the same sprite tweened, keyed by its engine id.

Script steps: `swap`, `swap-invalid`, `place`, `clear` (match groups, blasts, cleared pieces, created specials), `score`, `tray-earn`, `tray-full`, `tray-lost`, `fall` (falls and spawns), `level-up`, `game-over`.

## The engine

`src/engine/index.ts` is the public API: `newGame(seed)`, `applyMove`, `allowedMoves`, `productiveMoves`, `countProductiveMoves`, `isGameOver`, `findMatches`, `canPlace`, `cloneBoard`, plus the types and rule constants.

- **State.** `GameState` holds the board, level, score, level target, tray, per-color counters, move count, the next piece id, the RNG state, the game-over flag and the seed. A board is `(Piece | null)[8][8]`, `row` 0 at the top. A `Piece` is a gem (color plus `none | charge | arc`), a prism or a rock, each with a stable numeric id.
- **Determinism.** `rng.ts` is mulberry32 with a uint32 state stored in `GameState`. A seed plus a move list reproduces the same scripts and final state. `applyMove` never mutates its input.
- **Matches** (`matches.ts`). Runs of 3+ of one color in a row or column; intersecting runs are one group (`line3`, `line4`, `line5`, `cross`). Rocks match like a color of their own.
- **Specials** (`specials.ts`). Charge from `line4` (3×3), Arc from `cross` (row and column), Prism from `line5`. Priority when several apply: line5, then cross, then line4. A special lands on the moved piece if it is in the match, else at the run's center. Blasts that catch another special detonate it, staggered by `order`. A Prism swap clears the swapped color; a Prism caught in a blast clears the most common color on the board (ties by fixed color order). Prism plus Prism is a `supernova` that clears the board; Prism plus Charge or Arc converts that color to the special and detonates. A Prism never swaps with a rock.
- **Gravity** (`gravity.ts`). Every column falls and refills in one pass. Refills come from the seeded RNG, with a rock chance from level 10.
- **Tray** (`tray.ts`). Counters track clears of each color by any means; at 10 a plain piece enters the tray (capacity 5). When full, new pieces are lost. Placement is allowed only onto a plain gem, never a rock or special.
- **Scoring** (`scoring.ts`, numbers in `rules.ts`). Match base 100/200/500, cross 300; blast pieces 20 each; times chain multiplier (1, 2, 4, 8, 16, 32 cap) and combo multiplier (1.5, 2, 2.5 for 2, 3, 4+ simultaneous groups).
- **Levels.** Target is `1000 + 2500 * (level - 1)` (raised from the spec’s 750 step by the Task 9 benchmark). Reaching it replaces the board with a fresh one that has no matches and at least one legal move. Counters and tray carry over.
- **Moves** (`moves.ts`). `allowedMoves` is everything a player may do (swaps that match, Prism swaps, any tray placement on a plain gem). `productiveMoves` is the subset that makes a match. `isGameOver` is true exactly when `productiveMoves` is empty, which is the tray-can-save-you rule: a dud placement cannot keep a dead board alive.
- **Resolve** (`resolve.ts`). `applyMove` applies the move, then loops rounds of clear, create specials, score, bank to tray, fall, until quiet; then checks level-up and game over.

All rule numbers live in `src/engine/rules.ts`.

## The AI

`rankMoves(state, opts)` in `src/ai/search.ts` returns every productive move ranked by a single value in point units. The same number is the Hint label and the ranking.

- **Information rule.** The AI sees what a player sees: board, tray, counters, level and score. It never reads the game's RNG state. `hashVisible` (`hash.ts`, FNV-1a) hashes the visible state only, excluding `rngState` and `seed`, and the AI's own refill seeds are derived from that hash. The same board always yields the same ranking, and changing the hidden RNG does not change its choice.
- **Candidates.** Only `productiveMoves`, so it cannot propose an illegal move and cannot stall while a match exists.
- **Evaluation.** Each candidate is simulated with `applyMove`. The exactly known part is resolved as is; refills are sampled by Monte Carlo rollouts and averaged. The value combines expected points, level progress, bonuses for specials that survive on the board, rocks cleared and board health (how many productive moves remain), minus the value of a spent tray piece.
- **Budget.** The rollout budget is shared across candidates within a per-candidate minimum and maximum. Tray placements are costly in bulk, so only the best few get full rollouts. On a Mac a decision takes about 35 ms.
- **Weights.** Every weight lives in `src/ai/weights.ts` and is being tuned with the benchmark, so this document does not quote them.
- **Worker.** `worker.ts` runs `rankMoves` in a module Web Worker (request `{id, state}`, response `{id, ranked}`); `client.ts` (`createAIClient`) matches replies by id. On a worker `error` or `messageerror`, or if the worker can't be created, it rejects pending calls, terminates the worker and ranks in-process from then on. `dispose()` rejects pending and later calls with `Error('disposed')`. Tests inject a fake worker through `workerFactory`.
- **Planned.** The controller will discard stale results after New Game or an AI toggle, and pause the AI while the tab is hidden.

## The renderer

PixiJS 8 will draw the board, with GSAP timelines driving Pixi properties on one clock (planned). What exists now is the timing layer it will execute.

- **`src/render/constants.ts`** holds every animation timing value (`ANIM`) and `fallDurationMs(cells) = 1000·√(2·cells / gravity)`, constant acceleration from rest at 60 cells/s².
- **`src/render/plan.ts`**: `planScript(script, { timeScale })` is pure. It turns each engine step into `Planned { atMs, durMs, action }` items (swap, pop, morph, blast, fall, spawn, land, tray fly, score, notice, board in/out, sound cue) and a `totalMs`. Guarantees, each pinned by tests:
  - every fall and spawn in a round starts at the same instant, the end of that round's pops and blasts, and each ends in a `land`;
  - one `land` (or `rock-drop`, when the column's new pieces include a rock) cue per column, at its last landing;
  - the next round starts `cascadeOverlapMs` before the last landing ends;
  - blasts fire at `order × blastStaggerMs`, Charge and Arc cells pop when the blast fires, Prism and supernova cells pop as each bolt arrives (`prismBoltStaggerMs` apart), and a chained blast fires `blastStaggerMs` after its parent reaches its seed cell;
  - specials created by a Prism swap morph first and detonate `createMs` later;
  - `timeScale` divides every time (reduced motion uses `ANIM.reducedMotionTimeScale`).
- **`src/audio/cues.ts`** declares `CueName`; the cue manifest arrives with the sound engine.
- **Planned:** textures generated from vector code at the device pixel ratio, a pre-rendered halo per piece type for the idle glow, a masked board so refills enter from above the top edge, `prefers-reduced-motion` support, and the hint layer.

## Sound

Exists: the supplied sound files in `audio-src/` and the provenance sheet `audio-src/voltline-sounds.xlsx`. `CREDITS.md` is generated from the sheet by `uv run scripts/sound-credits.py`; edit the sheet, not the file. `scripts/make-sound-sheet.py` builds the sheet.

Planned: `npm run audio` encodes the sources to Opus/WebM with an AAC fallback in `public/audio/` (loudness-normalized, per the plan), and a small Web Audio `AudioEngine` with sfx, ui and music buses, cues scheduled from the same timeline as the animation, small pitch and gain variation, voice limits and cooldowns, and a mute toggle. Missing files degrade to silence.

## App shell (planned)

`app/` (controller, bootstrap, local storage for prefs and best scores) and `components/` (header, score, level bar, AI controls, game-over dialog, tray notice) with MUI. Best score for player games and a separate best for AI games persist in `localStorage`; corrupt or unavailable storage falls back to defaults. A desktop app is also planned.

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript 6.0, strict (held below 7 until typescript-eslint supports it) |
| Runtime | Node `>=26` for tooling (`.nvmrc`, CI and the deploy build all use 26) |
| Build | Vite 8, `base: './'`, ES-module workers |
| UI | React 19.3, MUI 9 (shell), fonts via `@fontsource` (Orbitron, Rajdhani) |
| Board | PixiJS 8 and GSAP 3.15 (planned use; installed) |
| Tests | Vitest 5, Testing Library, jsdom; Playwright for a planned smoke test (`npm run smoke` is not wired into CI yet) |
| Lint | ESLint 10, typescript-eslint, react-hooks |

## Project layout

```
src/
  engine/        types, rules, rng, matches, board, gravity, specials, scoring,
                 tray, moves, resolve, testing (fixture helpers), index (public API)
  ai/            weights, hash, search (rankMoves)
  App.tsx, main.tsx   placeholder shell
scripts/         bench.ts, make-sound-sheet.py, sound-credits.py
audio-src/       supplied sounds and voltline-sounds.xlsx
docs/superpowers/  design spec and implementation plan
CREDITS.md       generated sound credits
```

Planned directories: `src/render/`, `src/audio/`, `src/app/`, `src/components/`, `public/audio/`. Tests sit beside code as `*.test.ts`.

## Local development

```bash
npm install
npm run dev        # Vite dev server
npm run build      # tsc --noEmit && vite build
npm run lint
npm run bench      # headless AI benchmark (scripts/bench.ts)
npm run type-check # tsc --noEmit
```

Use Node 26 (`nvm use` reads `.nvmrc`).

## Testing

```bash
npm run test:run   # Vitest, one pass (npm test watches)
npm run test:coverage  # same, plus v8 coverage with thresholds
```

Coverage thresholds (lines 90, branches 85, functions 90) apply to `src/engine/**` and `src/ai/**` only, configured in `vite.config.ts`.

Engine tests cover matches (3/4/5, L/T), specials and priority, blasts and chaining, Prism rules, gravity and refills, rock spawning, tray rules, scoring, levels, game over and replay determinism. AI tests check that it never returns an illegal move, picks the known best move on fixtures, and does not depend on hidden randomness. Board fixtures come from `parseBoard` and `boardToString` in `src/engine/testing.ts`.

## CI, deploy and release

- **CI** (`.github/workflows/ci.yml`, on PRs to `main`, pushes to `main` and as a reusable workflow): `npm ci`, lint, type-check, tests with coverage thresholds, build, a short AI bench run (`npm run bench -- --games 5 --max-moves 200`), and a bundle hygiene check that fails if `dist/` contains an API key shape, an LLM endpoint or a Google Fonts URL. The Playwright smoke test is planned and is a commented placeholder in the workflow. Actions are pinned to commit SHAs.
- **Deploy** (`.github/workflows/deploy.yml`, on `v*` tags): verifies the tag is on `main`, matches `package.json` and has a CHANGELOG section, runs CI, builds, rsyncs `dist/` to the Apache server at `https://voltline.mrballistic.com`, smoke-tests the live site, then creates the GitHub Release from the CHANGELOG section (`scripts/release-notes.mjs`).
- **Release steps:** bump `version` in `package.json`, rename `## Unreleased` in `CHANGELOG.md` to `## <version> (date)`, merge to main, then `git tag -a vX.Y.Z -m "…" && git push origin vX.Y.Z`.
- **Dependabot** updates npm and actions monthly, holding TypeScript and `@types/node` majors.

The site has no client-side routes, so Apache has no SPA fallback: any unknown path returns a real 404 status with `public/404.html` (a self-contained page with inline CSS and no script, shipped to `dist/404.html`; `ErrorDocument 404`). Missing `/assets` and `/audio` files therefore 404 too, which the audio loader relies on. The deploy smoke test checks both.

Server layout, the deploy user, secrets, one-time setup and rollback are in [DEPLOY.md](./DEPLOY.md).

## Conventions

- `src/engine/**` and `src/ai/**` import nothing from DOM, React, Pixi, GSAP or audio.
- Every rule number lives in `src/engine/rules.ts`, every AI weight in `src/ai/weights.ts`, and (planned) every animation timing in `src/render/constants.ts`.
- User-facing copy uses curly quotes and apostrophes, with sparing closed-up em-dashes. Code comments are exempt.
- No `console.log` in committed code.
- Commits are concise, lowercase and imperative.
- Coordinates: `row` 0 is top, `col` 0 is left; `BOARD_SIZE` is 8.

## History

Voltline replaces an earlier React and SVG game called Bejeweled.ai, whose AI was an LLM (Gemini). Both the old code and that approach were dropped in a ground-up rebuild; the repo was renamed. See [CHANGELOG.md](./CHANGELOG.md).
