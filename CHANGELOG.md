# Changelog

All notable changes to Voltline are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

The first release of Voltline, an original neon match-three game. Play it at https://voltline.mrballistic.com, or build the macOS app (see `BUILDING.md`).

### Added

**The game**

- An 8×8 board of seven colors, each with its own shape (circle, rounded square, triangle, hexagon, diamond, plus and star), so the game doesn’t rely on color alone.
- Swap two neighbors to line up three or more. Pieces above fall under real gravity, every column at once, new ones drop in from above, and each link of a chain scores more than the last, with a bonus for several matches at once. A swap that makes no match shakes and slides back.
- Special pieces: a **Charge** (4 in a line) clears the 3×3 around it, an **Arc** (an L or T) clears its row and column, and a **Prism** (5 in a line) swapped with any colored piece clears every piece of that color. Specials set each other off. Two Prisms clear the board; a Prism with a Charge or Arc turns that whole color into one and detonates them.
- The tray: every 10 pieces of a color you clear earns a spare one, up to five. Tap or drag it onto a plain piece of another color to place it. A “Tray full” notice warns you before an earned piece is lost.
- Rocks from level 10, more often the deeper you go. They clear only in a match of three rocks or in an explosion.
- Levels with a progress bar and a fresh board at each level-up. The game ends when no move can make a match, tray placements included, with a “No moves left” summary of score, level and best.
- **Hint** shows every good move the AI found as an arrow labelled with roughly what it’s worth (“≈ 1,240”), fades the weaker ones out, and leaves the best pulsing.
- **AI mode** plays for you at Slow, Medium or Fast, showing its arrows before each move, with a move counter. It pauses in a background tab. Games the AI moved in count toward a separate AI best.
- Click or tap, drag or swipe to swap; tap or drag tray pieces to place them.
- Explosions, sparks, lightning and screen shake for the specials; reduced motion tones them down and drops the shake and pulsing.
- Sound for every move, special, tray flight, level-up and game over, timed to what you see. It starts on your first tap or key press, goes quiet in a background tab, and has mute and volume controls.
- Best scores, AI speed, mute and volume saved on the device.
- A macOS desktop app (Apple Silicon and Intel) with the same game in a native window.
- A 404 page in the Voltline look.
- No accounts, no API keys and no third-party requests: everything, fonts included, comes from the game’s own server.

**For developers**

- A pure, seeded rules engine (`src/engine`): a move in, the next state and an ordered event script out, never mutating its input. `?seed=N` gives a reproducible board.
- A search AI (`src/ai`) that ranks moves with Monte Carlo rollouts over refills it samples itself, from the visible state only. It runs in a Web Worker, with an in-process fallback.
- A PixiJS 8 renderer that plays each event script back on GSAP timelines from a pure planner (`src/render/plan.ts`), under a strict Content-Security-Policy without `unsafe-eval`.
- A Web Audio sound engine fed from the same script, and `npm run audio`, which encodes `audio-src/` to loudness-matched Opus and AAC files plus the list of files the engine loads. `CREDITS.md` is generated from the provenance sheet.
- Tests: Vitest with coverage thresholds on the engine and the AI, `npm run bench` (the AI must beat a baseline player by 1.5×), and `npm run smoke`, a Playwright run of the production build under the production CSP that fails on console errors, CSP violations or failed requests. Further Playwright checks live in `scripts/`.
- CI on every pull request, a tag-triggered deploy to the Apache host that also publishes the GitHub Release from this file, an unsigned universal macOS build on `main`, and Dependabot. See `DEPLOY.md` and `BUILDING.md`.
- Built on React 19, MUI 9, TypeScript 6, Vite 8, PixiJS 8, GSAP 3, Tauri 2 and Node 26. MIT licensed; `AI-ASSISTANCE.md` describes how AI tools were used to build it.

### Removed

- The earlier prototype that lived in this repository, including its LLM-driven player and API-key handling, `react-dnd`, `uuid` and the GitHub Pages deploy.
