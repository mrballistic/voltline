# Changelog

All notable changes to Voltline are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- Ground-up rebuild as **Voltline**, a neon match-three game with its own pieces, look and sounds.
- Deterministic, seeded rules engine (`src/engine`), pure TypeScript with no DOM:
  - match detection for 3, 4 and 5 in a line, with L and T shapes counted as one match;
  - Charge (4 in a line), Arc (L/T) and Prism (5 in a line) specials, with chaining and the Prism pair rules;
  - gravity and refills;
  - rocks from level 10, with a spawn chance that rises per level and is capped;
  - the tray: 10 clears of a color earn a piece, capacity 5, placement onto plain pieces;
  - scoring with chain and combo multipliers;
  - levels, and game over when no productive move remains (tray placements included);
  - `applyMove` returns the next state plus an ordered event script for a renderer to play back, and never mutates its input.
- Search AI (`src/ai`): ranks every productive move with Monte Carlo rollouts over refills it samples itself, never reading the game’s hidden randomness. Its own RNG is seeded from a hash of the visible state, so the same board gives the same ranking. About 35 ms per decision on a Mac.
- AI worker and client (`src/ai/worker.ts`, `src/ai/client.ts`): moves are ranked off the main thread; if the worker fails, the client rejects what was pending and carries on in-process.
- Animation timing constants (`src/render/constants.ts`) and a pure script planner (`src/render/plan.ts`) that turns engine event scripts into timed actions and sound cues: every column starts falling on the same frame, explosions reach cells before they pop, chained blasts wait for the bolt that triggers them, and specials converted by a Prism show their change before they detonate.
- The board is drawn for the first time: a PixiJS 8 canvas with the neon pieces (seven gems, Charge and Arc overlays, Prism, rock) on a dark circuit-grid page, the tray strip under the board, and soft halos that breathe out of phase (off with reduced motion). It re-lays out on resize and runs under a strict CSP without `unsafe-eval`.
- A 404 page (“No moves left.”) and real 404 statuses on the server.
- `npm run bench`: plays seeded games with the AI and a first-legal-move baseline and fails unless the AI scores at least 1.5× more (it scores about 3.4×, reaching level 14 in 400 moves against the baseline’s 8).
- Supplied sound set in `audio-src/`, a provenance sheet (`audio-src/voltline-sounds.xlsx`) and a generated `CREDITS.md`.
- Spec and implementation plan for the rebuild under `docs/superpowers/`.
- CI and deploy: `ci.yml` (lint, type-check, tests with coverage thresholds on `src/engine` and `src/ai`, build, AI bench run, bundle hygiene check), a tag-triggered `deploy.yml` that rsyncs `dist/` to `https://voltline.mrballistic.com` and creates the GitHub Release from the CHANGELOG section (`scripts/release-notes.mjs`), Dependabot config, Apache vhosts in `deploy/`, and `DEPLOY.md`.
- A funny, self-contained 404 page (`public/404.html`, no script) in the Voltline look. The Apache vhost now returns real 404s for unknown paths (no SPA fallback) and serves it; the deploy smoke test checks the status and page.
- Tooling: ESLint 10 with typescript-eslint, a `bench` script, and an `audio` script (planned encoding pipeline).
- Desktop app for macOS (Tauri 2, `src-tauri/`): the web build in a native 1100×900 window, with no plugins or IPC commands and the server’s CSP. `npm run desktop:dev` and `npm run desktop:build`.
- `scripts/make-macos-app.sh`: builds a universal (Apple Silicon and Intel) `Voltline.app`, signs it with a Developer ID under the hardened runtime, optionally notarizes it, and packages a zip and a drag-to-Applications disk image (background from `scripts/dmg-background.swift`). A `macos-universal.yml` workflow builds the unsigned universal app on pushes to `main`; `BUILDING.md` covers signing and notarizing it locally.
- App icon: the Prism ring around a magenta diamond (`src-tauri/icons/source.svg`), rendered by `scripts/render-icon.ts`.

### Changed

- AI weights tuned with the benchmark, and the per-level score step raised from 750 to 2,500 so levels don’t fly by (subject to a feel test).

- Node 26 LTS everywhere (`.nvmrc`, `engines`, `@types/node` 26, CI). The `gh-pages` force-push in `deploy.sh` is retired in favor of the server deploy.
- Repo renamed from `bejeweled-ai` to Voltline; package renamed `voltline`.
- Dependencies brought current: React 19.3, TypeScript 6.0 (held below 7 until typescript-eslint supports it), Vite 8, Vitest 5, PixiJS 8, GSAP 3.15, MUI 9.
- README rewritten as product docs; technical detail moved to `ARCHITECTURE.md`.

### Removed

- The Gemini/LLM AI and all API-key handling. The game makes no network calls.
- `react-dnd` and its backends, and `uuid` (pieces use incrementing ids from the engine).
- The old `src` tree, `memory-bank/` and `tech-brief.md`.
