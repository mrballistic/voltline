# Voltline — ground-up rebuild design

Date: 2026-11-13
Status: draft for approval (builder check done)
Working title: **Voltline** (replaces "Bejeweled.ai")

## 1. Intent

Todd wants a fully functional match-three game with the depth and feel of the genre's classics: explosive special pieces, cascades that chain, levels, and a game that ends when you run dry. On top of that:

- an **AI mode** that plays as well as a strong human and never gets stuck, and
- a **hint** that uses the same engine to show off the best play on the board.

The previous builds failed on two fronts: an LLM (Gemini) was a weak, slow, flaky player, and the animation was janky — wrong fall heights, linear "falls" with a generic bounce, a visible blink between state commit and animation, CSS transitions fighting GSAP, and expensive animated filters. This rebuild fixes both at the root and treats **animation quality as a first-class goal**.

## 2. Goals, non-goals, anti-goals

**Goals**
- Mechanically rich match-three: specials from 4-in-a-row, L/T shapes and 5-in-a-row; a collectable **tray**; **rocks** from level 10; levels; game over when no move remains.
- Deterministic search AI, no LLM, no network, no API key. One engine powers both AI mode and hints.
- Hint/AI visualization: show the moves the engine found, then isolate the best one.
- Animation that reads as physical: gravity falls, simultaneous columns, clean pops, real particle explosions, no blinks or snaps, steady 60 fps.
- Original identity: own name, own pieces, own look (the Voltline neon direction chosen during brainstorming).
- A sound engine synced to the animation, playing Todd’s own WAVs compressed for the web (§6.4).

**Non-goals (this build)**
- Any LLM integration. Gemini is removed entirely.
- Timed/action mode, puzzle mode, online leaderboards, accounts.
- Saving a game in progress across reloads (high score and settings do persist).
- Background music *(the sound engine supports a music bus, but no track is planned unless Todd supplies one; see §6.4)*.

**Anti-goals (failure even if it "works")**
- Recreating Bejeweled's name, gem art, look, or sounds. Genre mechanics are fine; its identity is not.
- An AI that "cheats" by reading the future refill sequence. The AI may only know what a human could know: the visible board, the tray, the rules, and the refill *distribution*.
- Any visible blink, snap, teleport, or overlap during a move. If a piece appears somewhere without having moved there, that's a bug.
- The AI or hint ever proposing an illegal move, or the AI loop stalling while legal moves exist.

## 3. Constraints

- Static site on GitHub Pages (`base: './'`), client-only.
- Desktop and mobile browsers; portrait layout on phones, landscape on desktop.
- Dependencies at current releases (looked up 2026-11-13):

| Package | Version | Change from current repo |
|---|---|---|
| Node | 24 LTS | — |
| react / react-dom | 19.3.1 | 19.0 → 19.3 |
| pixi.js | 8.23.0 | new |
| gsap | 3.15.1 | 3.12 → 3.15 |
| @mui/material (+ emotion) | 9.5.0 | 6 → 9 |
| vite | 8.3.8 | 6 → 8 |
| @vitejs/plugin-react | 6.3.0 | 4 → 6 |
| vitest | 5.1.0 | 4 → 5 |
| typescript | **6.0.3** | 5.7 → 6.0 — held on 6.x because typescript-eslint 8.72.2 peers `typescript <6.1.0`; 7.0.2 is out but not yet supported |
| eslint / typescript-eslint | 10.14.0 / 8.72.2 | new (`npm run lint` is documented but absent today) |
| jsdom, @testing-library/react | 31.0.1, 16.3.3 | bumped |

  Removed: `react-dnd`, `react-dnd-*`, `rdndmb-html5-to-touch`, `uuid` (use an incrementing id from the engine), all Gemini/Anthropic code and the `VITE_*_API_KEY` env var.

## 4. Approaches considered

All three share the same core: a pure, seeded rules engine that turns a move into a step-by-step **event script**, which the renderer only plays back. The AI runs on that engine in a Web Worker. They differ in how the board is drawn.

1. **PixiJS canvas board + React/MUI for everything around it — CHOSEN.** GPU-drawn board with its own animation clock; particles, glow and many simultaneous movers stay smooth. Cost: a new library, piece art drawn in code, visuals harder to unit-test; pointer handling replaces react-dnd.
2. **DOM/SVG, absolutely positioned pieces + GSAP.** Closest to today and simplest. Falls can be made correct, but particle explosions and glow over 64 SVG nodes is exactly where DOM drops frames again.
3. **Phaser for the whole app.** Strong animation, but replaces the React/MUI shell with engine-drawn UI — more than this needs.

Todd picked **1** because animation quality and explosions are the focus.

## 5. Game rules (decided)

Items marked *(my call)* were proposed by me and accepted in conversation ("yes, i agree to both") or are defaults a builder may tune; everything else Todd stated directly.

### 5.1 Board and pieces
- 8×8 board. 7 colored piece types plus **rock** (blocker) and specials.
- Voltline pieces (shape is unique per color, for color-blind play): red circle, blue rounded square, yellow triangle, green hexagon, magenta diamond, orange plus, cyan star. Rock = burnt-out gray chip with an ✕, no glow. Reference art and the glow slider: `docs/superpowers/specs/assets/voltline-pieces-reference.html` (a brainstorming fragment; open it inside any page with a light frame, or read the SVG symbols `v1`–`v9` directly).
- New boards (game start and each level-up) contain **no existing matches** and **at least one legal move**.

### 5.2 Moves
- **Swap** two orthogonally adjacent pieces. Legal only if it produces a match, or involves a Prism (5.3). Illegal swaps animate out and back.
- **Tray placement** (5.4).
- Rocks can be swapped like any piece.

### 5.3 Matches and special pieces
- A match is 3+ same-type pieces in a row or column. Intersecting runs of the same type (L/T/+) are **one** match.
- Specials are created from the match, placed at the cell of the piece the player moved if it's part of the match, otherwise at the run's center cell (lower/left on ties) *(my call)*. Priority when one match qualifies for several: 5-in-a-line > L/T > 4-in-a-line *(my call)*.

| Created by | Special | Effect when matched or caught in an explosion |
|---|---|---|
| 4 in a line | **Charge** (same color, inner pulse) | clears its 3×3 neighborhood |
| L or T shape (5 pieces) | **Arc** (same color, crackling edge) | clears its full row and column |
| 5 in a line | **Prism** (colorless wildcard, the rainbow ring) | swapped with an adjacent piece: clears every piece of that color. Caught in an explosion: clears every piece of the **most common color on the board** at that moment (ties → fixed color order), so it stays deterministic and visible to the AI *(my call)* |

- Specials chain: an explosion that catches another special detonates it.
- Prism + Prism: clears the whole board *(my call — genre standard)*. Prism + Charge/Arc: every piece of that special's color becomes that special and detonates *(my call — genre standard)*.
- **The Prism cannot target rocks** — a Prism↔rock swap is illegal and reverts *(my call)*.
- Rocks never form specials *(my call)*.

### 5.4 The tray
- Each of the 7 colors has a counter. Every 10 pieces of that color **cleared by any means** (matches, explosions, Prism) earns one plain piece of that color into the tray. Counters carry over across levels; rocks don't count.
- Tray holds **5** pieces *(my call)*. Only plain pieces are banked.
- **Spending:** tap a tray piece, then tap a plain colored piece on the board. The tray piece replaces it; the replaced piece is gone (no points, doesn't count toward counters). If that creates a match, it resolves exactly like a swap, cascades included. It costs one move.
  - **The player may place without making a match** (Todd: “dems the breaks”). The piece is spent, nothing clears, and it counts as a move. Useful for setting up a swap, or just a mistake.
  - **The AI only makes placements that create a match** *(my call: keeps its search small; it still beats a dud placement by planning swaps)*.
  - Placing onto a rock or a special is not allowed — rocks are removed only by matching or explosions, per Todd *(my call, follows from his rule)*.
- **Tray full:** a visible notice tells the player to spend one to open a slot. Pieces earned while full are **lost** *(my call)*.
- Tray persists across levels.

### 5.5 Rocks
- From **level 10**, rocks appear randomly among refill pieces *(Todd: "after ~10 levels")*. Spawn chance per refill piece starts ~3% at level 10 and rises ~1% per level, capped ~10% *(my call — tunable)*.
- They fall and swap like normal pieces. Removed by matching 3+ rocks, or by any Charge, Arc, or Prism-color-clear explosion that reaches them (Prism can't *target* rocks, but a Prism+Prism board clear and any explosion area includes them).

### 5.6 Scoring
Carried over from the existing project spec:
- Base: 3-match 100, 4-match 200, 5-match 500. L/T counts as 5-piece match = 300 *(my call)*.
- Chain multiplier by cascade depth: 1×, 2×, 4×, 8×, 16×, 32× cap.
- Combo multiplier for simultaneous matches in one cascade step: 2 → 1.5×, 3 → 2×, 4+ → 2.5×.
- Each piece cleared by an explosion (not part of a match) scores 20 base, then the same multipliers *(my call)*.
- Rocks score like any piece.

### 5.7 Levels and game over
- A progress bar fills with points. Reaching the target levels up: brief celebration, the board is replaced with a fresh one (5.1), the target increases. Target for level *n* ≈ `1000 + 750·(n−1)` *(my call — tunable; the benchmark in §8 should be used to tune it)*.
- **Game over** when no legal swap exists **and** the tray is empty or no tray placement would create a match (Todd chose "the tray can save you"). The player is shown the reason ("No moves left"), final score, level, and best score.
- **Two definitions, kept separate in the engine:**
  - `allowedMoves`: anything the player can do = swaps that create a match + Prism swaps onto a colored piece + **any** tray placement onto a plain piece.
  - `productiveMoves`: the subset that creates a match (swaps, Prism swaps, matching tray placements). This is what the AI and the hint choose from.
  - `isGameOver` ⇔ `productiveMoves` is empty, exactly Todd’s “the tray can save you” rule. A dud placement can’t keep a dead board alive: once no move makes a match, the game ends.
- Persisted in `localStorage` *(my call)*: **best score for player games** and a **separate best for AI games** (shown as such, so the AI never takes the player’s record), plus the AI speed setting. The glow is fixed at Todd’s setting (17) rather than a player option; reduced-motion is read from the OS. No light mode.

## 6. Animation and look

### 6.1 Principles
- **One authority for motion.** The renderer owns every on-screen sprite's position. The engine's event script describes *what* happens; the renderer decides *how* it looks. React never re-lays-out the board, so there is no commit-then-animate blink.
- Sprites keep stable identities (engine piece ids). A piece that moves is the same sprite, tweened — never destroyed and recreated.
- All board motion runs on a single clock. GSAP timelines drive Pixi display-object properties (GSAP's ticker synced to Pixi's, or Pixi's ticker driving GSAP).
- All timing values live in one constants module so tuning is one file.
- `prefers-reduced-motion`: disable idle breathing and screen shake; keep functional motion (shortened).

### 6.2 Motion spec (starting values; tune by feel)
- **Swap:** ~180 ms, ease in-out. Invalid: out and back, ~160 ms each, with a small shake on return.
- **Match pop:** piece brightens and swells to ~1.15× (~110 ms), then collapses to 0 (~140 ms) while emitting a burst of ~8–14 additive sparks in its color.
- **Falls (the core fix):** after a clear, **every** piece above a gap in **every** column starts falling **at the same instant** under constant gravity — duration `√(2d/g)` with ease `power2.in` (that is exactly constant acceleration from rest). Starting value g ≈ 60 cells/s² (1 cell ≈ 0.18 s, 8 cells ≈ 0.52 s). Fall distance is measured in board cell units from the real cell size — never from a parent element's size.
- **Refills:** new pieces are created stacked directly above the top edge, spaced exactly one cell apart as if the column continued upward, and fall under the same gravity. The board is masked so nothing is visible above the top edge.
- **Landing:** on contact, squash (~scaleX 1.08, scaleY 0.88) and settle back with a tiny rebound (~0.1 cell) over ~120 ms. No generic `bounce.out`.
- **Cascade pacing:** the next round's pops begin once all pieces have landed (a ~40 ms overlap with settle is fine).
- **Charge:** expanding shockwave ring, 3×3 flash, ~3 px screen shake for ~150 ms; chained detonations stagger ~60 ms.
- **Arc:** two beams sweep the row and column (~200 ms).
- **Prism:** lightning bolts from the Prism to each target, ~30 ms stagger.
- **Idle glow ("breathing", Todd dialed in 17 on the slider):** each piece has a soft halo behind it, with a random phase per piece, pulsing opacity 0.22 → 0.79 and scale 0.983 → 1.031, period ≈ 3.46 s, ease in-out. Implement as a pre-rendered blurred halo sprite per piece type with alpha/scale animation — not a live blur filter per piece. Rocks have no halo.
- **Selection:** a brighter steady ring + faster pulse on the selected piece.

### 6.3 Look
- Dark circuit-grid background (`#0a0a11` with faint blue grid lines), board panel slightly darker with a thin inset border, neon pieces with soft fill and bright stroke. Fonts: Orbitron (display: score, level, titles) and Rajdhani (UI text), as in the current project.
- Piece textures are generated once at startup from vector drawing code at the device pixel ratio, and regenerated on resize.
- All user-facing copy uses smart punctuation (curly quotes/apostrophes) and en/em dashes per Todd's global standard.

### 6.4 Sound

Todd will supply WAV files; the build compresses them. The game must run silently and without errors before any audio exists, so the asset list can arrive in pieces.

**Engine (my calls):**
- Small in-house module on the Web Audio API (no library). Files are decoded once into buffers at load, with three buses (**sfx**, **ui**, **music**) feeding a master gain.
- **Sync with animation:** cues are scheduled from the same timeline that plays the engine script. A cue fires when its visual happens (a pop sound when the pop starts, a land when the column lands), not when the engine computes it.
- **Variation:** small random pitch (±3%) and gain (±1.5 dB) per play so repeats don’t sound mechanical. Where Todd supplies numbered variants (`land-1`, `land-2`, …) they rotate randomly.
- **Chain escalation:** the match cue is pitched up one semitone per chain level, capped at +7, unless Todd supplies per-level files (`match-chain-1`…`match-chain-5`), which are then used instead.
- **Voice limits:** each cue has a maximum number of simultaneous voices and a short cooldown, so a 40-piece cascade produces a clean texture, not a wall of noise (land: 3 voices, ~40 ms cooldown).
- **Mobile unlock:** the audio context starts on the first tap/click. It suspends when the tab is hidden.
- **Controls:** mute toggle and master volume in the header, persisted in `localStorage`. Mute persists across visits.

**Asset pipeline:**
- Todd’s WAVs go in `audio-src/` (committed; no build step reads them directly). Naming = the cue names below; numbered suffixes for variants.
- `npm run audio` runs `scripts/encode-audio.sh` (ffmpeg, installed via Homebrew): trims leading/trailing silence, peak-normalizes to −1 dBFS, then encodes each file to **Opus in WebM (~64 kbps mono for sfx/ui, ~128 kbps stereo for music)** plus an **AAC .m4a fallback** into `public/audio/`. The loader picks a format with `canPlayType`. Encoded files are committed so deploys don’t need ffmpeg.
- A manifest (`src/audio/cues.ts`) lists every cue with bus, base gain, voice limit and cooldown; missing files are skipped with a single console warning in dev.

**WAV guidance for Todd:** 44.1 or 48 kHz, 16- or 24-bit. Mono is fine for everything except music and the big moments (level-up, game-over, board clear). Leave a little tail on explosions; the encoder trims silence. Loops must be cut on a seamless loop point.

**Sound list** (length is a guide, not a rule; ★ = needed for the game to feel finished, the rest are polish):

| Cue | When it plays | Length | Notes |
|---|---|---|---|
| ★ `select` | tap/click selects a piece | < 0.1 s | soft electric tick |
| ★ `swap` | two pieces trade places | ~0.2 s | quick swoosh |
| ★ `swap-invalid` | swap makes no match and snaps back | ~0.3 s | short denied buzz |
| ★ `match` | a match pops | ~0.3 s | one neutral pitch; the engine raises it per chain level |
| `match-chain-1`…`5` | instead of pitch-shifting `match` | ~0.3 s each | optional ascending set if you want hand-tuned chain sounds |
| ★ `land` (+ variants) | a column of pieces lands | < 0.1 s | quiet click/thud; 2–3 variants recommended |
| ★ `charge-create` | a 4-match makes a Charge | ~0.5 s | power-up hum |
| ★ `charge-blast` | a Charge detonates | ~0.6 s | punchy electric explosion |
| ★ `arc-create` | an L/T match makes an Arc | ~0.5 s | crackle charging up |
| ★ `arc-blast` | an Arc fires its row and column | ~0.5 s | beam zap sweeping outward |
| ★ `prism-create` | a 5-match makes a Prism | ~0.8 s | shimmering rising chord |
| ★ `prism-blast` | a Prism clears a color | ~1.0 s | lightning storm crackle |
| `prism-supernova` | Prism + Prism clears the board | ~1.5–2 s | the biggest sound in the game |
| `rock-drop` | a rock falls into the board | ~0.2 s | heavier, duller thud than `land` |
| ★ `rock-break` | a rock is cleared | ~0.4 s | stone/metal shatter |
| ★ `tray-earn` | a piece is earned into the tray | ~0.4 s | collect chime as it flies to the tray |
| ★ `tray-full` | the tray fills up (with the notice) | ~0.5 s | warning chirp |
| `tray-lost` | a piece is earned while the tray is full | ~0.3 s | fizzle |
| ★ `tray-pick` | player picks up a tray piece | < 0.2 s | lift blip |
| ★ `tray-place` | tray piece lands on the board | ~0.2 s | snap-in |
| `hint-scan` | hint arrows appear | ~1.0 s | soft scanning sweep under the reveal |
| `hint-lock` | the best arrow is isolated | ~0.3 s | lock-on ping |
| ★ `level-up` | level complete | ~2 s | fanfare/power surge |
| `board-in` | a fresh board drops in | ~0.8 s | power-on whoosh |
| ★ `game-over` | no moves left | ~2 s | power-down |
| `new-best` | game over with a new best score | ~1.5 s | short triumphant sting |
| ★ `ui-click` | buttons (hint, new game, speed, etc.) | < 0.1 s | neutral UI tick |
| `ui-toggle` | AI mode on/off, mute | ~0.2 s | two-tone blip |
| `music-loop` | background, on its own bus | 1–3 min | optional; seamless loop |

## 7. Engine, AI and hint

### 7.1 Rules engine (pure TypeScript, no DOM)
- Deterministic given a seed: seeded PRNG for board generation and refills.
- API shape: `applyMove(state, move) → { state, script }` where `script` is an ordered list of steps (swap, invalid-swap, clear {cells, cause}, create-special, detonate, fall {moves}, spawn {pieces}, score, tray-earn, tray-full, tray-lost, tray-place, level-up, game-over). Also `allowedMoves(state)`, `productiveMoves(state)`, `isGameOver(state)`.
- Runs identically in the main thread (gameplay) and the worker (AI).

### 7.2 Search AI
- **Information rule:** the AI sees the board, tray, counters and level, and knows the refill distribution — **never** the game's actual RNG state. Refills in simulation come from the AI's own RNG.
- **Candidates:** `productiveMoves`: every matching swap, Prism swap, and matching tray placement.
- **Evaluation:** simulate the move; resolve the known part exactly; for refills, run Monte Carlo rollouts (starting value 32 per candidate, cut adaptively) and average. Score = expected points + level progress + weights for specials created, rocks cleared, and **board health** (number of legal moves remaining, chance of game over), minus the value of a spent tray piece (tray pieces are worth more when the board is tight). A shallow second ply over the top few candidates is the builder's call if the time budget allows.
- **Budget:** target ≤ 150 ms per decision on a mid-range phone, in a Web Worker so animation never stutters. Search is reproducible: the AI's RNG is seeded from a hash of the visible state, so the same board gives the same hint.
- **Never stuck:** the AI only chooses from `productiveMoves`; when there are none, the game is over by definition.

### 7.3 Hint and AI visualization (Todd: "show the moves it found, then isolate to the best one")
- On **Hint**: the candidate moves appear as faint arrows (swap direction; for tray placements, from the tray slot to the target cell), each labeled with its **move value**. Over ~1 s the weaker arrows fade out lowest-first, leaving the best one pulsing until the player acts or ~4 s pass.
  - **Which arrows:** all productive swaps, plus at most the top few matching tray placements (placements all start at the tray, so showing dozens would be noise). Cap the display at ~12 arrows by value *(my call)*.
  - **Which number:** the AI's evaluation is expressed in point units (expected points + bonuses and penalties converted to points), and that one number is both the label (e.g. “≈ 1,240”) and the ranking, so a fading arrow never shows a bigger number than the winner *(my call)*.
- **AI mode** plays with the same visualization before each move, shortened at faster speeds (slow ≈ the full 1 s reveal; fast ≈ a quick flash then the move). Speeds: slow / medium / fast, plus pause/play and a move counter.
- When the AI's move is about to play, the hint layer clears so it never overlaps animation.

## 8. Quality bar and testing

- **Engine unit tests** (Vitest): match detection (3/4/5, L/T/+, no double counting), special creation and priority, each special's effect and chaining, Prism rules incl. rocks, gravity and refill, rock spawning by level, tray earn/full/lost/placement rules, scoring math, level-up, game-over condition (including tray rescue), new-board guarantees.
- **Replay tests:** a seed + move list always produces the same script and final state.
- **Sound tests:** every script step type that should make a sound maps to a cue; the cue fires at the animation timestamp it belongs to (fake clock); voice limits and cooldowns hold under a big cascade; missing sound files degrade to silence with a logged warning, never a crash.
- **AI tests:** never returns an illegal move across many random states; picks the known best move on hand-built fixtures; respects the information rule (changing the hidden RNG doesn't change its choice).
- **Benchmark** (`npm run bench`, Node, headless): plays N seeded games with the AI and with a "first legal move" baseline; reports mean score/level and decision time. The AI must clearly beat the baseline and is the tool for tuning level targets and rock rates. Keep the script in `scripts/`.
- **Visual checks:** a Playwright smoke run that loads the game, makes moves, and screenshots; plus a manual feel pass on desktop and a real phone. Frame time stays under 16.7 ms during a large cascade with explosions.

## 9. Repo and delivery

- Replace `src/` entirely. Remove `memory-bank/`, `tech-brief.md`, and the Gemini `.env.example`; rewrite `README.md`, `AGENTS.md`, and the project `CLAUDE.md` to describe Voltline (the current CLAUDE.md describes an Anthropic/react-dnd/MUI 6 design that this supersedes).
- Keep `deploy.sh` (orphan `gh-pages` force-push) — it works; no CI change in this build.
- **Rename to `voltline`** (Todd's decision): Todd renames the GitHub repo `mrballistic/bejeweled-ai` → `mrballistic/voltline`; the build then updates the git remote, `package.json` name, README/CLAUDE.md links and the smoke-test URL. Live URL becomes `mrballistic.github.io/voltline/`; the old Pages URL stops working (GitHub redirects the repo, not Pages). The local folder name can stay as is.
- Add `npm run lint` (ESLint 10 + typescript-eslint), `npm run bench`, and `npm run audio` (§6.4).

## 10. Left to the builder

- Exact module layout, how the Pixi application is mounted in React (imperative in an effect vs `@pixi/react`), and how GSAP and Pixi tickers are synced.
- Particle system implementation details and counts, within the 60 fps budget.
- Input specifics: click/tap-select-then-tap, drag and swipe on the canvas (threshold ~0.3 cell), tap-tray-then-tap-board; keyboard play is a nice-to-have.
- Exact AI weights, rollout counts and second-ply use, tuned via the benchmark.
- Layout breakpoints and where the tray, progress bar and AI controls sit on phone vs desktop.
- Tunable numbers marked *(my call — tunable)* above.
