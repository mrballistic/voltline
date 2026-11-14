# CLAUDE.md

Guidance for Claude Code and any other agent working in this repo. Read it fully before changing code.

## What this is

**Voltline** is an original neon match-three game: an 8×8 board, special pieces (Charge, Arc, Prism), a collectable tray, rocks, levels, and a deterministic search AI that powers AI mode and Hint. It is a static, offline web app (React 19 + MUI 9 chrome around a PixiJS canvas). Live at https://voltline.mrballistic.com.

Any older notes you may have seen about "Bejeweled.ai", an LLM player, the Anthropic API, react-dnd, MUI 6, a CSS-grid renderer or GitHub Pages describe an abandoned design. Ignore them.

## Where the docs live

| File | Holds |
|---|---|
| `README.md` | Product docs only: how to play, the pieces, features |
| `ARCHITECTURE.md` | Technical docs: engine, AI, renderer, sound, layout, testing |
| `DEPLOY.md` | Release process, server, CI secrets, rollback |
| `BUILDING.md` | Desktop app build, signing and notarizing |
| `CHANGELOG.md` | Keep a Changelog; add to `## Unreleased` |
| `CREDITS.md` | Sound attribution (generated, see Sounds) |
| `docs/superpowers/specs/2026-11-13-voltline-rebuild-design.md` | The design spec |
| `docs/superpowers/plans/2026-11-13-voltline-rebuild.md` | The task plan |

Don't duplicate those docs here or in code comments; link to them.

## Commands

Run `nvm use` first (Node 26, per `.nvmrc`).

```bash
npm run dev            # Vite dev server
npm run build          # tsc --noEmit + vite build -> dist/
npm run preview        # serve the built dist/
npm run type-check     # tsc --noEmit
npm run lint           # ESLint
npm test               # Vitest, watch mode
npm run test:run       # Vitest, single run
npm run test:coverage  # Vitest with v8 coverage
npm run bench          # tsx scripts/bench.ts (AI/engine benchmark)
npm run smoke          # Playwright against `vite preview` of dist/ (run build first)
npm run audio          # scripts/encode-audio.sh (encode audio-src/ for the app)
npm run desktop:dev    # the game in a native window (Tauri 2; needs Rust, see BUILDING.md)
npm run desktop:build  # tauri build (unsigned); releases use scripts/make-macos-app.sh
```

Before calling work done: `npm run type-check && npm run lint && npm run test:run`.

## Architecture in brief

See `ARCHITECTURE.md` for detail.

- **Engine** (`src/engine`): a pure, seeded rules engine. A move in, next state plus an ordered **event script** out.
- **Planner** (`src/render/plan.ts`): a pure function from the event script to exact timed actions (and sound cues).
- **Renderer**: a PixiJS canvas that plays the plan back with GSAP timelines. It only plays back; it never decides rules.
- **AI** (`src/ai`): search over engine simulations, using only visible information (it never reads the hidden RNG). Runs in a Web Worker, with an inline fallback when no Worker is available.
- **App controller** (`src/app/controller.ts`): a non-React `GameController` orchestrating engine, renderer, AI and audio.
- **Audio** (`src/audio`, cue names in `src/audio/cues.ts`): Web Audio engine fed from the same script.

## Invariants every change must keep

1. `src/engine/**` and `src/ai/**` import nothing from DOM, React, Pixi, GSAP or audio. They must run in Node and in a Worker.
2. `applyMove` never mutates its input state; the engine is immutable from the caller's view.
3. All randomness goes through the seeded `Rng`. No `Math.random` in engine or AI code.
4. Single homes for tunables: animation timing only in `src/render/constants.ts`, AI weights only in `src/ai/weights.ts`, rule numbers (tray size, thresholds, rock rates, level targets, scores) only in `src/engine/rules.ts`. No magic numbers elsewhere.
5. The AI never reads hidden RNG state; it ranks moves from the visible state.
6. Strict CSP: no `unsafe-eval`. The renderer imports `pixi.js/unsafe-eval` so Pixi works under that CSP. The same policy is set in `deploy/apache-voltline-le-ssl.conf`.
7. TypeScript stays on 6.x until typescript-eslint supports 7. Check `npm view typescript-eslint peerDependencies` before moving.
8. No LLM code, no API keys, no runtime network calls (fonts are self-hosted via @fontsource).
9. Board coordinates: `row` 0 is the top, `col` 0 is the left; `BOARD_SIZE = 8`.
10. Vite `base: './'`; TypeScript `strict`, `noUnusedLocals`, `noUnusedParameters`.

## Conventions

- 2-space indent. PascalCase components, camelCase utils, `use` prefix for hooks. Functional components only.
- Commits: concise, lowercase, imperative (`add match detection`).
- No `console.log` in committed code.
- Tests live beside the subject as `*.test.ts(x)`. Engine and planner behavior is pinned by unit tests; add one with every rule or timing change.
- **User-facing copy** uses curly punctuation (’ “ ”), and em-dashes only where they earn their place, closed up (`word—word`), at most one per sentence. Tests asserting copy use the curly form. Code comments are exempt.
- **Docs travel with the change:** add to `CHANGELOG.md` under `## Unreleased`; update `README.md` for product changes and `ARCHITECTURE.md` for technical ones.
- Screenshots go in `docs/screenshots/`.

## Sounds

`audio-src/` plus `audio-src/voltline-sounds.xlsx` is the source of truth for sound provenance. Never edit `CREDITS.md` by hand; edit the sheet and regenerate:

```bash
uv run scripts/sound-credits.py
```

## Releases

Tag `vX.Y.Z` on `main` to deploy to https://voltline.mrballistic.com. Process, secrets and rollback are in `DEPLOY.md`.

## Originality

Voltline is an original game. Never reuse Bejeweled's name, art, look or sounds, in code, copy, assets or docs.
