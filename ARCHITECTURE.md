# Architecture

How Voltline is put together. For what the game is and how to play it, see [README.md](./README.md). Sound provenance is in [CREDITS.md](./CREDITS.md).

This describes Voltline 1.0.0: the rules engine, the search AI, the renderer with its effects and hint layer, AI mode, the MUI chrome, click, drag and swipe input, the sound engine and the macOS desktop app, all built and tested. The only work planned after the release is a Windows and Linux desktop build path. The design is in `docs/superpowers/specs/2026-11-13-voltline-rebuild-design.md` and the task plan in `docs/superpowers/plans/2026-11-13-voltline-rebuild.md`.

- [Overview](#overview)
- [From tap to animation](#from-tap-to-animation)
- [The engine](#the-engine)
- [The AI](#the-ai)
- [The renderer](#the-renderer)
- [Sound](#sound)
- [App shell](#app-shell)
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
3. **A presentation layer**: a PixiJS canvas board that only plays the script back, driven by a non-React controller, with React and MUI around it and a Web Audio sound engine fed from the same script.

The client is static and offline: no server, no LLM, no API key, no runtime network calls.

## From tap to animation

1. **Input** (`render/input.ts`): a tap on a cell or a tray slot goes to the controller, which owns the selection rules (tap selects, a neighbor swaps, a far cell moves the selection, the same cell deselects; a selected tray slot then a cell places). A drag past 0.3 cell along its dominant axis swaps with that neighbor at once (`gestureToMove`); a shorter one is a tap. A drag from a tray slot onto a cell places it.
2. **Controller** (`app/controller.ts`): drops input while a script is playing or AI mode is on, then calls `applyMove(state, move)`.
3. **Engine**: returns the new `GameState` and a `Step[]` script. Illegal swaps return a `swap-invalid` step and an unchanged state.
4. **Plan** (`render/plan.ts`): turns the script into timed actions, as pure code.
5. **Player** (`render/player.ts`): runs the plan as one GSAP timeline over Pixi display objects, fires sound cues and forwards score, notice and tray actions to the controller at their planned instants (a tray flight when it lands, the instant the “tray full” notice is planned for).
6. When the timeline ends the player snaps every sprite to the engine's board and the controller clears `busy`.

The engine state advances as soon as a move is accepted; what the player sees (score, level, tray, notices) follows the planned actions and matches the engine state once `busy` is false. The renderer owns every on-screen position. React never lays out the board, so there is no commit-then-animate blink, and a moved piece is the same sprite tweened, keyed by its engine id.

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
- **In the app.** Bootstrap uses the worker client; tests use `createAIClient({ inline: true })` or a fake. The controller's AI loop and Hint consume the ranking (see App shell).

## The renderer

PixiJS 8 draws the board; GSAP timelines move it, on one clock.

- **`src/render/constants.ts`** holds every animation timing value (`ANIM`) and `fallDurationMs(cells) = 1000·√(2·cells / gravity)`, constant acceleration from rest at 60 cells/s².
- **`src/render/plan.ts`**: `planScript(script, { timeScale })` is pure. It turns each engine step into `Planned { atMs, durMs, action }` items (swap, pop, morph, blast, fall, spawn, land, tray fly, score, notice, board in/out, sound cue) and a `totalMs`. Guarantees, each pinned by tests:
  - every fall and spawn in a round starts at the same instant, the end of that round's pops and blasts, and each ends in a `land`;
  - one `land` (or `rock-drop`, when the column's new pieces include a rock) cue per column, at its last landing;
  - the next round starts `cascadeOverlapMs` before the last landing ends;
  - blasts fire at `order × blastStaggerMs`, Charge and Arc cells pop when the blast fires, Prism and supernova cells pop as each bolt arrives (`prismBoltStaggerMs` apart), and a chained blast fires `blastStaggerMs` after its parent reaches its seed cell;
  - specials created by a Prism swap morph first and detonate `createMs` later, and a clear that creates a special lasts at least `createMs`;
  - level-up and game-over wait for any tray flight to land, so the tray-full notice never follows them;
  - `timeScale` divides every time (reduced motion uses `ANIM.reducedMotionTimeScale`); it must be positive and finite.
- **`src/render/player.ts`**: `ScriptPlayer` builds one GSAP timeline per `play(script, end)` and resolves when it completes, then snaps every sprite to `end` (the engine's board and tray). `show(state)` deals a fresh board: the old one falls out of the bottom edge under the same gravity, the new one drops in from above as one block. Positions are tweened in cell units through proxy objects and mapped to pixels with `BoardView.cellXY` on every update, so falls are measured in real cells and a resize mid-cascade stays on course.
  - Fall and spawn tweens are `power2.in` over `√(2d/g)` on the row only, which is exactly constant gravity. A spawned sprite is created when its fall starts, at its `fromRow` above the masked top edge, so refills enter one cell apart as if the column continued upward.
  - `land` squashes to `ANIM.landSquash` with the bottom planted, rebounds `landReboundCells` and settles (`ANIM.landPhases` split `landMs`); no `bounce` ease.
  - Pops swell to `popScale` and collapse to nothing, and the sprite is released when the pop ends. Morphs restyle the sprite in place. Tray flights, placements and lost pieces are loose sprites in the unmasked tray layer.
  - An invalid swap ends with both pieces shaking side to side on their cells (`ANIM.invalidShake`, after the back leg; none with reduced motion).
  - Effects are called from the timeline and never awaited: a spark burst as each pop peaks, `blast` when a blast fires (its promise is ignored; the pops it causes are already planned), `morph` when a special is made, and a screen shake for Charge (`chargeShake`) and supernova (`supernovaShake`) blasts unless reduced motion is on.
  - Selection and the idle glow animate the sprite's own children (`PieceSprite`), never the properties a timeline drives.
- **`src/render/clock.ts`**: `driveGsapFrom(ticker)` unhooks GSAP's own requestAnimationFrame loop and steps GSAP from Pixi's ticker (high priority, before the render) by the ticker's capped `deltaMS`. Every tween and every frame share one clock, and a hitch slows a frame instead of jumping a cascade to its end. Only the newest ticker drives, so a StrictMode double mount can't double the speed.
- **`src/render/effects.ts`**: `PixiEffects` implements the `Effects` port on its own layer above the board and tray (unmasked, so sparks can fly past the edge); `shake` jitters the whole stage and puts it back. Everything is additive and drawn from fixed pools made up front (`ANIM.fx.sparkPool` sparks, `decalPool` rings, flashes and beams, `boltPool` lightning `Graphics`), so nothing is allocated per frame and a pool running dry just draws less. Soft white textures (spark, glow, ring, beam, flash) are drawn once on a 2D canvas and tinted per use.
  - **Pop:** `ANIM.sparks` sparks (8–14) in the piece color, some half-way to white for hot cores, each a streak along its velocity under drag and a little gravity, in closed form over time so a slow frame can't throw one off course.
  - **Charge:** a 3×3 flash, a hot core, two shockwave rings, electric sparks and short lightning crackles. **Arc:** four half-beams from the Arc to each board edge at one speed, the longest arriving at `arcBeamMs`, with glowing heads, then a fade. **Prism:** a jagged bolt from the Prism to each target, `prismBoltStaggerMs` apart, re-jagged as it flickers out, with an impact glow. **Supernova:** all the Prism's bolts in rainbow colors, a whole-board flash at detonation and again as the last bolt lands, and a wide shockwave. **Morph:** a ring and sparks in the new special's color (rainbow for a Prism).
  - Motion runs on GSAP tweens, so it shares the board's clock and follows the global time scale in slow-motion captures. Reduced motion halves every spark count and turns `shake` into a no-op. Effect-only values live in `ANIM.fx`; none of them delays a play.
- **`src/render/input.ts`**: `attachInput(app, board, tray, handlers)` turns pointer gestures on the stage into `tapCell`, `tapSlot`, `swap` or `place` via `BoardView.cellAt` and `TrayView.slotAt`. Only the first pointer counts; pointer capture plus window-level move/up/cancel listeners let a drag leave the canvas and still finish or cancel; the canvas has `touch-action: none`. While a drag is under way the grabbed piece follows the pointer (dominant axis, capped at `DRAG.maxOffsetCells`, never toward a board edge) by shifting its `pivot`, which the script player never writes. On a swap the offset eases to zero over `ANIM.swapMs` while the player's tween runs from the cell, so the piece never snaps; a cancelled or ignored drag eases home over `ANIM.dragReturnMs`. Nothing is drawn while `controller.canAcceptInput` is false (a move playing, AI mode, game over). `scripts/input-check.ts` drives mouse, touch, tap, invalid and busy cases in Playwright against the dev server.
- **`src/render/BoardView.ts`, `TrayView.ts`, `PieceSprite.ts`, `textures.ts`, `layout.ts`**: the masked board panel and its sprites keyed by engine id, the tray strip, textures drawn from vector code at the device pixel ratio (rebuilt when the cell size changes) with a pre-rendered halo per piece type for the breathing glow, and the pure layout.
- **`src/audio/cues.ts`** declares `CueName` and the `CueSink` the player sends cues to; the game uses a silent sink until the sound engine exists.
- **Dev fixtures** (`src/app/devFixtures.ts`, dev build only): `?fixture=charge|arc|prism|supernova` starts the game one swap from that effect (the charge one chains three Charges). `bootstrap.ts` loads it behind `import.meta.env.DEV`, so it isn't in a production bundle. The dev debug handle (`src/app/debug.ts`) also has `profile()`/`stopProfile()`, which time each frame's main-thread work from the first ticker callback to the end of the render.
- **`src/render/HintLayer.ts`**: the hint and AI-move view (`HintViewLike`), a container on the stage above the board and tray, so a placement arrow from a tray slot to its cell is never clipped. `pickHintArrows(ranked)` keeps every swap and the best `ANIM.hint.maxPlacements` placements, then the best `ANIM.hint.maxArrows`, highest first. Each `HintArrow` is a dark outline, a white core tinted cyan (candidates) or yellow (the best), and a `≈ {value}` label (never below 0: a game-ending move ranks last but reads as 0) with thousands separators and a dark stroke, set beside the line (above a horizontal arrow, right of a vertical one). `show(ranked, { revealMs, holdMs, signal })` cues `hint-scan`, fades the weaker arrows lowest first in equal steps across `revealMs`, then cues `hint-lock`, resolves, and pulses the best (`ANIM.hint.pulseS`; none under reduced motion) until `holdMs` passes or `clear()`. `clear()`, a newer `show` or the abort signal end it at once and resolve its promise. Tray slots of placement arrows are marked with `TrayView.setHinted` while they show. Bootstrap clears it on relayout.
- **Held drags.** While a gesture is held, `attachInput` checks `canAcceptInput` every ticker frame, so a drag held still eases home as soon as input locks (AI mode, a move or a deal starting); a drag that already fired its swap is left to the swap tween.

## Sound

Exists:

- **Sources.** The supplied sound files in `audio-src/` and the provenance sheet `audio-src/voltline-sounds.xlsx`. `CREDITS.md` is generated from the sheet by `uv run scripts/sound-credits.py`; edit the sheet, not the file. `scripts/make-sound-sheet.py` builds the sheet.
- **Pipeline.** `npm run audio` (`scripts/encode-audio.sh`, needs ffmpeg) trims silence, measures each file's overall RMS, applies gain to -20 dBFS RMS (loudness-normalized, never peak-normalized), limits at -3 dBTP, and writes `public/audio/<name>.webm` (Opus) and `.m4a` (AAC). Mono, except the stereo cues and `music-*`. Outputs newer than their source are skipped; `--report` measures without writing, `--only <name>` does one cue. It then writes `src/audio/files.ts` (`AUDIO_FILES`, every name in `public/audio` with both formats; `--list` writes only that). The encoded files and the list are committed, and a unit test fails if the list and `public/audio` disagree.
- **Manifest** (`src/audio/cues.ts`). `CUES` gives every cue a bus (`sfx`, `ui`, `music`), a starting gain in dB, a voice limit, a cooldown, and optionally `variants` (`land-1..3`), `chainSet` (`match-chain-1..5`), `loop` or `stereo`. Cue-to-cue balance lives here, since the files are all at the same loudness. `CueSink` is the one-method interface the renderer will call.
- **Engine** (`src/audio/engine.ts`). `AudioEngine` is a small Web Audio player with a master gain and one gain per bus. `load()` picks WebM or M4A by `canPlayType` and only fetches: just the manifest keys listed in its `files` (`AUDIO_FILES`), so a cue, variant or chain file with nothing encoded yet (`music-loop`, `match-chain-1..5` today) costs no request and no 404, and picks up its file once one is encoded. A listed file that fails to load is skipped (one dev-only warning each); no `AudioContext` exists yet, since browsers only let one start inside a user gesture (Chromium warns about one created earlier). `unlock()`, called from a gesture, creates the context, resumes it if it isn't running, and decodes the fetched files (an undecodable one is skipped with one warning); files that arrive after it decode as they land. `cue()` does nothing before `unlock()`, while muted, or for a cue whose file is missing. A cue fired after the unlock but before the context runs or its file has decoded (the first tap's own `select`) is held, one at most and the latest, and plays once that happens if it is under 300 ms old; nothing is held while suspended for a hidden tab or muted. It enforces the voice limit and cooldown per cue, varies pitch by ±3% and gain by ±1.5 dB, and for `match` with a chain level uses the `match-chain-N` file if loaded, else raises the pitch one semitone per level up to +7. Context, fetch, clock and RNG are injected for tests.

- **Engine extras.** `state` (the context's state, `none` before it exists), `dispose()` (closes the context; every call after it is a no-op, and a load it cuts short warns about nothing), and an optional `onPlay(key)` hook naming each file as it starts (`land-2`, `match-chain-3`), which only dev builds pass.
- **Wiring** (`src/app/bootstrap.ts`). One `AudioEngine` per game (`base: './audio'`, `files: AUDIO_FILES`, a real `AudioContext`, `fetch`). `load()` runs alongside the first deal and is not awaited; it only fetches, and cues before the first gesture are silent. The engine is the `CueSink` of both the `ScriptPlayer` and the `HintLayer`, and the controller's `SoundLike`. `destroy()` detaches its listeners and disposes it.
- **Timing.** Board cues are planned `cue` actions (`render/plan.ts`) that the player turns into `tl.call`s at their planned instants on the same timeline as the visuals: the match cue on the round's matched pops (with its chain level), each column's `land` (or `rock-drop`) on that column's last landing, blasts as they fire, create cues with the morph, tray cues as the fly lands, `board-in` as the board drops in. Pinned by `cues fire at their action timestamps` (plan) and `forwards cue actions to the sink at their timeline time` (player, stepped GSAP). Hint cues (`hint-scan` on reveal, `hint-lock` on isolating the best) come from `HintLayer`.
- **UI cues** come from the controller, never from React render: `select` when a tap selects a piece (not on deselect or on the tap that swaps), `tray-pick` when a tray slot is picked, `ui-click` for Hint, New game, Play again and a speed change, `ui-toggle` for the AI switch and mute (not when AI mode switches itself off after failures), and `new-best` once, as a game that ends on a new best finishes playing (when the game-over dialog shows “New best!”). Muting is silent by definition; unmuting plays the toggle.
- **Settings.** The controller applies the saved mute and volume to the engine when it is constructed and on every change (`setMuted`, `setVolume`).
- **Unlock and hidden tabs** (`src/audio/lifecycle.ts`). `attachAudioLifecycle(engine, window, document)` listens (capture phase, for the game's lifetime) for gestures anywhere on the page: a mouse `pointerdown`, a touch or pen `pointerup` (a touch only counts as a gesture when it ends, so a touch `pointerdown` never creates the context), or a `keydown` other than Escape. Whenever the context isn't running, a gesture calls `unlock()`: the first creates it, later ones recover one that stopped (an iOS interruption leaves it `interrupted`). Once it runs, a gesture costs one state check. `visibilitychange` suspends the context while the tab is hidden and resumes it on return. A hidden tab also stops the ticker, so the timeline pauses rather than queueing cues, and the capped clock means the return plays no backlog.
- **`scripts/audio-check.ts`** (Playwright, dev server): spies on `AudioBufferSourceNode.start` and reads `window.__voltline.audio()`; checks no context exists and nothing starts before the first input, that the first tap's own `select` plays once (mouse, and a touch tap on a phone-sized page), that moves, Hint, the AI switch and mute play their cues, that muted taps start nothing, that a hidden tab starts nothing even with a move playing and plays no backlog on return, and that there are no console errors. Playwright's Chromium would run an `AudioContext` without a gesture whatever the flags, so the browser's own gesture gate is not observable there; the engine's is.

## App shell

- **`src/app/bootstrap.ts`**: `createGame(host, { seed, onChange })` creates the Pixi application (or, if it can't, destroys the half-made one and throws `GraphicsUnavailableError`), drives GSAP from its ticker, builds the board and tray views, the `ScriptPlayer`, the `GameController` and tap input, and deals the first board. On resize it recomputes the layout, rebuilds textures for a new cell size, calls `setLayout` on both views, then `controller.relayout()`, which waits for the running timeline to finish. It draws the selection on the selected sprite from each `UiSnapshot`. Returns `{ controller, destroy() }`.
- **`src/app/controller.ts`**: `GameController` is plain TypeScript, no React. It owns the `GameState`, applies moves, plays their scripts, and publishes a `UiSnapshot` (displayed score, level and progress, tray, notices, selection, busy, AI settings, best scores) through `onChange`. A second move while one is playing is dropped; `newGame()` waits for the current move; a hint ranked for an older state is discarded. The best score for the game's kind is saved when a game ends (game over or New Game). `hint()` ranks the current state and shows it with `ANIM.hint` timing; any tap, swap or new game clears it; a rank failure other than `disposed` goes to `reportError`; it does nothing in AI mode.
  - **AI mode.** `setAI(true)` starts a loop: wait while `doc.hidden` (until `visibilitychange`), wait for any move or deal in progress, `rank` (snapshot `aiThinking`), show the ranking for `AI_PACE[speed].revealMs` with `holdMs: 0`, clear, play the best move, pause `pauseMs`, repeat; it stops at game over. Paces: slow 1000/600 ms, medium 500/300, fast 150/100 (reveal/pause). Every loop runs under a generation number that `setAI`, `newGame` and `dispose` bump, and every ranking is checked against both the generation and the state `version`, so a ranking that arrives after AI mode was switched off, after New Game, or for a board that has moved on is dropped; a waiting loop is woken so it exits. After a deal the loop restarts if AI mode is still on. One step at a time, so a tab coming back never fires a burst. A rank failure is reported and retried once; a second in a row switches AI mode off. Any other failure inside the loop (a move or the hint view rejecting) is reported and switches AI mode off, so input never stays locked with nothing playing. `aiMoves` counts when an AI move is accepted, before its script plays, so a game the AI's first move ends is still an AI game for the best score.
- **`src/app/ports.ts`**: the interfaces later pieces implement: `Effects` (with `noopEffects`, used by tests; the game uses `PixiEffects`), `HintViewLike`, `AISpeed`, `Prefs`, `PrefsStore` and `SoundLike` (a `CueSink` plus `setMuted`/`setVolume`, with `silentSound` as the default). Bootstrap builds the real prefs store (`app/storage.ts`); the hint view is still a no-op.
- **`src/app/debug.ts`** (dev builds only, loaded behind `import.meta.env.DEV`): `window.__voltline` exposes the controller, board geometry, a cascading move finder, per-frame sprite sampling, the GSAP time scale and `audio()` (the context state and every file started so far), for `scripts/feel-check.ts` and the other Playwright checks.
- **`src/app/storage.ts`**: `createPrefsStore(store?)` keeps all prefs (player best, AI best, AI speed, mute, volume) as one JSON object under `voltline.prefs.v1`. Loading never throws: unavailable, corrupt or wrongly shaped storage gives defaults (valid fields are kept one by one). Saving throws, so the controller’s existing catch reports it and the session carries on with the in-memory prefs.
- **`src/app/useGame.ts`**: `useGame(host, seed)` creates the game in the host element, mirrors each `UiSnapshot` into React state, and returns `{ ui, actions, failed }` (new game, hint, AI on/off and speed, mute, volume). Mute and volume persist and reach the audio engine through the controller.
- **`src/components/`**: `BoardCanvas` is the host element for the canvas (and, if `createGame` fails, shows “Voltline couldn’t start the graphics. Try another browser.”). The MUI chrome around it: `Header` (title, `ScoreDisplay` counting up over 400 ms with tabular digits in a reserved width, best score, `LevelBar`, level-up line, mute and volume), `TrayNotice` (a polite live region, shown while the tray is full), `GameControls` (Hint, New game, and the `aiSlot` that holds `AIControls`: an `AI` switch, `Slow / Medium / Fast`, `AI moves {n}`, and `Thinking…`, which fades in only when a ranking takes longer than 120 ms, in reserved space) and `GameOverDialog`. Hint is disabled (`hintDisabled`) while a move plays or AI mode is on. `src/theme.ts` is the MUI dark theme (Orbitron for display text, Rajdhani for the UI, both self-hosted).
- **Layout.** `App` is one centered column (max 640 px): header, the canvas host (takes the remaining height; the canvas sizes the board from it via `render/layout.ts`), tray notice, controls, footer links to Credits and the MIT License. The chrome never overlaps the canvas.


## Desktop app

A Tauri 2 shell in `src-tauri/` wraps the web build unchanged: `tauri.conf.json` points `frontendDist` at `../dist`, and the Rust side (`src/main.rs`) only opens one window. There are no Tauri plugins and no IPC commands, and `capabilities/default.json` grants only `core:default`, so the page has no more reach than it has in a browser.

- **Origin and storage.** The bundled app serves `dist/` from `tauri://localhost`; WKWebView keeps that origin’s `localStorage` across launches (checked by relaunching the bundled app), so whatever the game saves there persists as it does on the web. (`npm run desktop:dev` loads the Vite server instead, a different origin with its own storage.)
- **CSP.** `app.security.csp` is the server’s policy from `deploy/apache-voltline-le-ssl.conf`, verbatim. At runtime Tauri adds a `script-src 'self'` plus hashes of its own injected scripts; nothing else changes. No `connect-src` for Tauri’s IPC (`ipc:` / `http://ipc.localhost`) is needed because the game never calls into Tauri; add it if a future change uses `@tauri-apps/api`. The policy only applies to the bundled build: in dev the window loads the Vite server directly.
- **Version.** `tauri.conf.json` reads `version` from `package.json`, so the app, the zip and the disk image carry the release version.
- **Icon.** `src-tauri/icons/source.svg` (the Prism ring around a magenta diamond on the circuit-grid page) is rendered at 1024 px by `scripts/render-icon.ts` (Chromium via Playwright, for the SVG blur filters), which then runs `npx tauri icon` to regenerate every size in `src-tauri/icons/`.
- **macOS build.** `scripts/make-macos-app.sh` builds (`--universal` for `universal-apple-darwin`), signs with a Developer ID under the hardened runtime, optionally notarizes, and packages a zip and a drag-to-Applications disk image (`scripts/dmg-background.swift` draws its background). `.github/workflows/macos-universal.yml` builds the unsigned universal app on pushes to `main`. The release steps are in [BUILDING.md](./BUILDING.md).

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript 6.0, strict (held below 7 until typescript-eslint supports it) |
| Runtime | Node `>=26` for tooling (`.nvmrc`, CI and the deploy build all use 26) |
| Build | Vite 8, `base: './'`, ES-module workers |
| UI | React 19.3, MUI 9 (shell), fonts via `@fontsource` (Orbitron, Rajdhani) |
| Board | PixiJS 8 and GSAP 3.15, on one clock (Pixi's ticker drives GSAP) |
| Tests | Vitest 5, Testing Library, jsdom; Playwright for the browser smoke test (`npm run smoke`, in CI) |
| Lint | ESLint 10, typescript-eslint, react-hooks |

## Project layout

```
src/
  engine/        types, rules, rng, matches, board, gravity, specials, scoring,
                 tray, moves, resolve, testing (fixture helpers), index (public API)
  ai/            weights, hash, search (rankMoves), worker, client
  render/        constants, plan, player, effects, clock, input, layout, textures,
                 PieceSprite, BoardView, TrayView, HintLayer
  audio/         cues (cue names, CueSink), engine, lifecycle (unlock, hidden tab)
  app/           bootstrap, controller, ports, storage, useGame, debug and devFixtures (dev only)
  components/    BoardCanvas, Header, ScoreDisplay, LevelBar, TrayNotice, GameControls,
                 AIControls, GameOverDialog
  App.tsx, main.tsx   page shell
scripts/         bench.ts, feel-check.ts, effects-check.ts, input-check.ts, ai-check.ts, audio-check.ts, screenshot-board.ts, board-showcase.*,
                 make-sound-sheet.py, sound-credits.py
audio-src/       supplied sounds and voltline-sounds.xlsx
docs/superpowers/  design spec and implementation plan
CREDITS.md       generated sound credits
```

`public/audio/` holds the encoded sounds. Tests sit beside code as `*.test.ts`.

## Local development

```bash
npm install
npm run dev        # Vite dev server
npm run build      # tsc --noEmit && vite build
npm run lint
npm run bench      # headless AI benchmark (scripts/bench.ts)
npm run type-check # tsc --noEmit
npm run desktop:dev   # the game in a native window (Tauri; needs Rust)
npm run desktop:build # Tauri release build of the app and a plain disk image
```

Use Node 26 (`nvm use` reads `.nvmrc`).

## Testing

```bash
npm run test:run   # Vitest, one pass (npm test watches)
npm run test:coverage  # same, plus v8 coverage with thresholds
```

Coverage thresholds (lines 90, branches 85, functions 90) apply to `src/engine/**` and `src/ai/**` only, configured in `vite.config.ts`.

Engine tests cover matches (3/4/5, L/T), specials and priority, blasts and chaining, Prism rules, gravity and refills, rock spawning, tray rules, scoring, levels, game over and replay determinism. AI tests check that it never returns an illegal move, picks the known best move on fixtures, and does not depend on hidden randomness. Board fixtures come from `parseBoard` and `boardToString` in `src/engine/testing.ts`.

Planner tests pin every timing guarantee listed under [The renderer](#the-renderer). Player tests (`src/render/player.test.ts`) step GSAP by hand at 60 fps over real Pixi containers and real engine cascades, and check that every fall and refill in a round starts on the same frame, falls monotonically and accelerating, never shows at its destination early, enters one cell apart above the top edge, lands with a squash and rebound, and never overlaps another piece. Player tests also check that pops, blasts, morphs and shakes go through the `Effects` port without the play waiting on them (a blast promise that never settles), the invalid-swap shake, and that reduced motion asks for no shake. Effects tests (`src/render/effects.test.ts`) step GSAP the same way over real Pixi containers with stub textures: spark counts and colors, the fixed pools, reduced motion, shake bounds and reset, each blast kind's shape (Charge ring and flash, Arc beams reaching the edges by `arcBeamMs`, staggered Prism bolts, the supernova's board flash), and clean teardown. Controller tests use a fake player that holds each play until released (input while busy, invalid swaps, displayed score, tray placement, New Game mid-move, deferred relayout, best scores), and a fake AI whose rankings the test hands out one by one for AI mode (plays to game over, stale rankings after New Game or a toggle are dropped, pauses while a fake document is hidden with no burst on return, AI best, rank failures). `src/render/HintLayer.test.ts` steps GSAP by hand to check the arrow pick, lowest-first fades, the lock cue, the pulse and its absence under reduced motion, and clearing.

In the browser, with `npm run dev` running:

```bash
npx tsx scripts/feel-check.ts [baseUrl] [outDir]      # fall physics from per-frame sprite samples, 12 clicked moves, slow-motion frames
npx tsx scripts/ai-check.ts [baseUrl] [outDir] [secs]  # hint screenshots, drag held while AI turns on, AI mode on Fast (default 120 s) with no stall or console error
npx tsx scripts/audio-check.ts [baseUrl]               # sound by proxy: source starts and the engine's cue log for taps, moves, Hint, AI, mute and a hidden tab
npx tsx scripts/screenshot-board.ts [baseUrl] [outDir] # static board, breathing and resize screenshots (--csp against npm run preview)
npx tsx scripts/effects-check.ts [baseUrl] [outDir]   # slow-motion frames and contact sheets of each effect fixture, then the supernova frame check
```

The effects check fails if, over 2 s of the supernova at full speed, any frame is dropped or the 95th-percentile frame work is 16.7 ms or more. It gates on frame work rather than the rAF delta because with vsync on every delta reads ~16.7 ms however cheap the frame. On an Apple Silicon Mac (headless Chromium, Metal, 2× DPR): 120 frames, rAF delta p95 16.8 ms, 0 dropped, frame work p50 0.7–1.3 ms and p95 1.2–2.7 ms.

```bash
```

## CI, deploy and release

- **CI** (`.github/workflows/ci.yml`, on PRs to `main`, pushes to `main` and as a reusable workflow): `npm ci`, lint, type-check, tests with coverage thresholds, build, a short AI bench run (`npm run bench -- --games 5 --max-moves 200`), and a bundle hygiene check that fails if `dist/` contains an API key shape, an LLM endpoint or a Google Fonts URL. Then the Playwright smoke test (`scripts/smoke.spec.ts`): it runs `vite preview` of the production build under the production CSP (`preview.headers` in `vite.config.ts`) and, with `appType: 'mpa'`, without an SPA fallback, so a missing file 404s as in production. It opens a fixed seed (`?seed=3`, checked against the engine to have a productive swap), clicks real board cells with `computeLayout` math, trying adjacent pairs until one scores, presses Hint, runs AI mode for 10 s, checks an unknown path returns 404, and fails on console errors, CSP violations or any page request answered with 400 or more. Actions are pinned to commit SHAs.
- **Deploy** (`.github/workflows/deploy.yml`, on `v*` tags): verifies the tag is on `main`, matches `package.json` and has a CHANGELOG section, runs CI, builds, rsyncs `dist/` to the Apache server at `https://voltline.mrballistic.com`, smoke-tests the live site, then creates the GitHub Release from the CHANGELOG section (`scripts/release-notes.mjs`).
- **Release steps:** bump `version` in `package.json`, rename `## Unreleased` in `CHANGELOG.md` to `## <version> (date)`, merge to main, then `git tag -a vX.Y.Z -m "…" && git push origin vX.Y.Z`.
- **Dependabot** updates npm and actions monthly, holding TypeScript and `@types/node` majors.

The site has no client-side routes, so Apache has no SPA fallback: any unknown path returns a real 404 status with `public/404.html` (a self-contained page with inline CSS and no script, shipped to `dist/404.html`; `ErrorDocument 404`). Missing `/assets` and `/audio` files therefore 404 too, which the audio loader relies on. The deploy smoke test checks both.

Server layout, the deploy user, secrets, one-time setup and rollback are in [DEPLOY.md](./DEPLOY.md).

## Conventions

- `src/engine/**` and `src/ai/**` import nothing from DOM, React, Pixi, GSAP or audio.
- Every rule number lives in `src/engine/rules.ts`, every AI weight in `src/ai/weights.ts`, and every animation timing in `src/render/constants.ts`.
- User-facing copy uses curly quotes and apostrophes, with sparing closed-up em-dashes. Code comments are exempt.
- No `console.log` in committed code.
- Commits are concise, lowercase and imperative.
- Coordinates: `row` 0 is top, `col` 0 is left; `BOARD_SIZE` is 8.

## History

Voltline replaces an earlier React and SVG game called Bejeweled.ai, whose AI was an LLM (Gemini). Both the old code and that approach were dropped in a ground-up rebuild; the repo was renamed. See [CHANGELOG.md](./CHANGELOG.md).
