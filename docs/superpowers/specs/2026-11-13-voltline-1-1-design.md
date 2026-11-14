# Voltline 1.1 — difficulty, tray counting, tray drag fix, UI brief

Date: 2026-11-13 · Status: draft for approval · Builds on `2026-11-13-voltline-rebuild-design.md` (1.0.1, live)

## Intent

Todd played 1.0.1 and wants it to get properly harder as you go, the tray to behave less wastefully, the tray drag to be reliable with a mouse, and a brief he can hand to Claude Design to work on the UI.

## Changes

### 1. Rocks from level 5 (Todd)
`ROCK_START_LEVEL` 10 → 5.

### 2. Harder past level 8: stingier refills + a rockier board (Todd picked A + B)
- **Stingy refills (A).** From level 9, each refill piece that would land in a ready-made 3-in-a-row (with the pieces already settled around its final cell, including other refills placed earlier in the same pass) is re-rolled with probability `stinginess(level) = min(0.1 × (level − 8), 0.6)` to a color that doesn't complete a run (rocks unaffected). One re-roll per piece *(my call)*. Draws come from the game's seeded RNG, so games stay replayable; the AI keeps its information rule because it simulates refills through the same engine code with its own RNG.
- **Rockier board (B).** `rockChance(level)`: 0 below 5; `0.03 + 0.01 × (level − 5)` for levels 5–8 (3% → 6%); past 8, `+0.015` per level, capped at **0.18** (reached at level 16) *(numbers are my call; tune with the benchmark)*.
- Fresh boards (start, level-up) keep their guarantees: no ready matches and at least one productive move. They use the same rock rate; stinginess applies only to refills.
- **Tuning bar** *(my call)*: re-run `npm run bench`; the AI must still beat the baseline by ≥ 1.5×, and its mean level in 400 moves should drop noticeably from today's ~14 while games still reach level 10+. Report before/after.

### 3. Tray counting pauses while the tray is full (Todd)
When the tray reaches 5 pieces, **every color's counter resets to 0**, and clears don't count while the tray is full. Counting resumes from 0 once a piece is spent. The "earned while full is lost" path disappears: the `tray-lost` step, planner action, player effect and `tray-lost` cue are removed *(my call: no dead code)*; the sound sheet marks `tray-lost` "Skipped: no longer used" and CREDITS is regenerated. README tray copy updated.

### 4. Tray drag-and-drop with a mouse is unreliable (Todd's bug report)
"Dragging on top of the desired square doesn't always take, and I have to drag it a few times."
- **Debug first, no guessed fix:** reproduce in Playwright with a filled tray (dev fixture), dragging a tray piece onto every kind of cell (plain other-color, same color, special, rock, edges, fast vs slow drags), record which drops are refused and why, and find the root cause before changing code.
- **Known suspect:** silent refusals (same color, special, rock). Whatever else is found, a refused drop should be visibly refused: the piece shakes at the drop cell before flying home (timing in `ANIM`; off with reduced motion) *(my call)*.
- Add a regression test for the root cause and extend `scripts/input-check.ts` with the tray drag path.

### 5. A Claude Design brief for the UI (Todd)
`docs/design/claude-design-brief.md`: a self-contained brief Todd can paste into Claude Design. Scope *(my call, Todd may widen it)*: the chrome and overall layout around the board (header, score, level bar, sound, Hint/New game, AI controls, tray-full notice, level-up, game-over dialog, footer, 404 page, graphics-failure message), on desktop and phone. The board and tray are a fixed PixiJS canvas the design frames, not redraws. Contents: product summary and audience; the Voltline look as tokens (colors, fonts, glow values, spacing) taken from the code; every screen and state with today's screenshots; component inventory with current copy; constraints (React 19 + MUI 9 `sx`/theme, strict CSP: no external fonts or scripts, curly punctuation, sparing closed-up em-dashes, accessibility: contrast, focus, live regions, reduced motion); originality rule; what to hand back (mockups per state and breakpoint, tokens, component specs).

### 6. Prism versus rocks (Todd: “the prism should be able to remove the stones”; picked “Swap Prism with a rock”)
A Prism swapped with a rock is now a legal, productive move: it clears **every rock on the board** (and the Prism). Color clears are unchanged (they still skip rocks), and a Prism caught in an explosion still clears the most common color. The AI considers the new move automatically. The How to play copy and README change from “A Prism can’t be swapped with a rock” to say what the swap does.

### 7. Rock lines of 4+ explode (Todd: “if you match 4 blocks, we can make that explode, too”; blocks = rocks; confirmed)
A rock match of 4 or more (line4, line5, or an L/T cross of rocks) clears as today **and** detonates on the spot like a Charge: a 3×3 blast centered on the run's special cell (the same cell a gem special would land on: the moved cell if it's in the run, else the center). No special is created (rocks still never become specials). The blast chains into any special it catches, blast-only pieces score as usual, and rocks never count toward the tray. It plays the Charge blast effect and cue (tinted rock gray). The AI picks it up automatically. How to play and README copy gain one line.

## Release
Ships as **1.1.0** (CHANGELOG section, version bump, PR, green CI, merge, tag; deploy watched and verified live, per Todd's standing release rule).

## Non-goals
Changing the piece art or board rendering; new modes; notarizing the Mac app (still waiting on Todd's go-ahead).

## Left to the builder
Exact stinginess check implementation inside `applyGravity`; fixture mechanics for the tray drag repro; brief structure and screenshot selection.
