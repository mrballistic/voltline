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
- Supplied sound set in `audio-src/`, a provenance sheet (`audio-src/voltline-sounds.xlsx`) and a generated `CREDITS.md`.
- Spec and implementation plan for the rebuild under `docs/superpowers/`.
- Tooling: ESLint 10 with typescript-eslint, a `bench` script, and an `audio` script (planned encoding pipeline).

### Changed

- Repo renamed from `bejeweled-ai` to Voltline; package renamed `voltline`.
- Dependencies brought current: React 19.3, TypeScript 6.0 (held below 7 until typescript-eslint supports it), Vite 8, Vitest 5, PixiJS 8, GSAP 3.15, MUI 9.
- README rewritten as product docs; technical detail moved to `ARCHITECTURE.md`.

### Removed

- The Gemini/LLM AI and all API-key handling. The game makes no network calls.
- `react-dnd` and its backends, and `uuid` (pieces use incrementing ids from the engine).
- The old `src` tree, `memory-bank/` and `tech-brief.md`.
