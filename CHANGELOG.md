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
- The game is playable by clicking or tapping: select a piece, tap a neighbor to swap; tap a tray piece, then a board piece, to place it. Moves play back with real gravity. After a clear, every piece above a gap in every column starts falling on the same frame, accelerating at a constant rate. Refills enter from above the top edge, one cell apart, and every piece lands with a squash and a small rebound. Nothing blinks, snaps or overlaps between cascade rounds. A new board drops in from above.
- Drag, swipe and tray input: drag a piece toward a neighbor (mouse or finger) and the swap fires as soon as the drag passes a third of a cell, with no need to release. The piece follows the pointer up to half a cell, then the swap animation takes over from where it was, with no snap; an ignored or cancelled drag eases the piece home. A short drag still counts as a tap, a drag that leaves the canvas finishes cleanly, extra fingers are ignored, and nothing shows while a move plays or AI mode is on. Tray pieces can be dragged onto a board cell to place them. `scripts/input-check.ts` drives it in Playwright.
- Script player (`src/render/player.ts`), game controller (`src/app/controller.ts`), tap input (`src/render/input.ts`) and the shared ports for effects, hint, sound and saved preferences (`src/app/ports.ts`, `CueSink` in `src/audio/cues.ts`).
- One clock for the board: Pixi’s ticker drives GSAP (`src/render/clock.ts`).
- If the graphics can’t start, the canvas area says so (“Voltline couldn’t start the graphics. Try another browser.”) instead of staying blank.
- `scripts/feel-check.ts`: a Playwright check of the fall animation from per-frame sprite samples, with a slow-motion frame capture.
- Supplied sound set in `audio-src/`, a provenance sheet (`audio-src/voltline-sounds.xlsx`) and a generated `CREDITS.md`.
- Sound engine (`src/audio`): a cue manifest (bus, gain, voices, cooldown, variants, chain set) and a Web Audio `AudioEngine` with unlock-on-first-input, voice limits, small pitch and gain variation, chain pitch rise, mute and volume. Missing files degrade to silence. Not yet wired into the game.
- `npm run audio`: encodes `audio-src/` to Opus/WebM and AAC/M4A in `public/audio/`, loudness-matched to -20 dBFS RMS with a -3 dBTP limiter (`--report`, `--only`, `--force`). The encoded files are committed.
- Spec and implementation plan for the rebuild under `docs/superpowers/`.
- CI and deploy: `ci.yml` (lint, type-check, tests with coverage thresholds on `src/engine` and `src/ai`, build, AI bench run, bundle hygiene check), a tag-triggered `deploy.yml` that rsyncs `dist/` to `https://voltline.mrballistic.com` and creates the GitHub Release from the CHANGELOG section (`scripts/release-notes.mjs`), Dependabot config, Apache vhosts in `deploy/`, and `DEPLOY.md`.
- A funny, self-contained 404 page (`public/404.html`, no script) in the Voltline look. The Apache vhost now returns real 404s for unknown paths (no SPA fallback) and serves it; the deploy smoke test checks the status and page.
- Tooling: ESLint 10 with typescript-eslint, a `bench` script, and an `audio` script (planned encoding pipeline).
- Desktop app for macOS (Tauri 2, `src-tauri/`): the web build in a native 1100×900 window, with no plugins or IPC commands and the server’s CSP. `npm run desktop:dev` and `npm run desktop:build`.
- `scripts/make-macos-app.sh`: builds a universal (Apple Silicon and Intel) `Voltline.app`, signs it with a Developer ID under the hardened runtime, optionally notarizes it, and packages a zip and a drag-to-Applications disk image (background from `scripts/dmg-background.swift`). A `macos-universal.yml` workflow builds the unsigned universal app on pushes to `main`; `BUILDING.md` covers signing and notarizing it locally.
- App icon: the Prism ring around a magenta diamond (`src-tauri/icons/source.svg`), rendered by `scripts/render-icon.ts`.
- Game chrome in MUI: header with title, a score that counts up, best score, level bar, level-up line, mute and volume; Hint and New game under the tray; a persistent “Tray full” notice; a “No moves left” dialog with score, level and best (AI games show AI best). The page uses Orbitron and Rajdhani, self-hosted. Credits and MIT License links in the footer.
- Saved prefs in `localStorage` (`voltline.prefs.v1`): player best, AI best, AI speed, mute and volume. Unavailable or corrupt storage falls back to defaults.
- Favicon (`public/icon.svg`, the Prism ring mark).
- Hint shows the moves the AI found: faint arrows, each labelled with its value (“≈ 1,240”), from one cell to its neighbor for a swap and from the tray slot to the cell for a placement. Over a second the weaker ones fade out lowest first, leaving the best one pulsing for up to 4 seconds or until you act. Up to 12 arrows, at most 3 of them placements. Reduced motion keeps the same information without the pulse (`src/render/HintLayer.ts`).
- AI mode: an `AI` switch, `Slow / Medium / Fast` speeds, an `AI moves` counter and a `Thinking…` indicator under the board. The AI shows the same arrows before each move (shorter at faster speeds), then plays the best one. It pauses while the tab is hidden and resumes without catching up, drops a ranking that arrives after New game or after it was switched off, carries on into a new game, and stops at game over. If a move fails while it plays, AI mode switches itself off so you can take over. Any game the AI moved in counts toward the AI best. Hint is off while AI mode is on.
- `scripts/ai-check.ts`: a Playwright check that screenshots a hint mid-reveal and with the best isolated, holds a drag while AI mode turns on, and runs AI mode on Fast for two minutes, failing on a stall or a console error.

### Changed

- A drag held still on the board or the tray now eases back the moment input locks (AI mode turns on, a move or a new board starts), instead of on the next pointer event.
- Hint reports a failed ranking (other than a shut-down AI) instead of swallowing it. The level-up line’s 2 s lives in `ANIM.levelNoticeMs`.
- AI weights tuned with the benchmark, and the per-level score step raised from 750 to 2,500 so levels don’t fly by (subject to a feel test).
- The planner holds level-up and game-over until any tray flight lands, so the “tray full” notice can’t trail them. A clear that creates a special lasts at least the special’s morph. `planScript` rejects a time scale that isn’t a positive, finite number.
- Node 26 LTS everywhere (`.nvmrc`, `engines`, `@types/node` 26, CI). The `gh-pages` force-push in `deploy.sh` is retired in favor of the server deploy.
- Repo renamed from `bejeweled-ai` to Voltline; package renamed `voltline`.
- Dependencies brought current: React 19.3, TypeScript 6.0 (held below 7 until typescript-eslint supports it), Vite 8, Vitest 5, PixiJS 8, GSAP 3.15, MUI 9.
- README rewritten as product docs; technical detail moved to `ARCHITECTURE.md`.

### Removed

- The Gemini/LLM AI and all API-key handling. The game makes no network calls.
- `react-dnd` and its backends, and `uuid` (pieces use incrementing ids from the engine).
- The old `src` tree, `memory-bank/` and `tech-brief.md`.
