# Changelog

All notable changes to Voltline are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 1.2.1 (2026-11-14)

### Added

- Link previews: sharing voltline.mrballistic.com now shows a proper card (title, description and a 1200×630 image of a Prism firing lightning across the board) on social sites and in chat apps, and search engines get structured data describing Voltline as a free game for the web and the Mac.
- Raster icons beside the SVG favicon: a `favicon.ico` (16, 32 and 48 px), an iOS home-screen icon, and 192 and 512 px icons in a web app manifest, so browsers and tools that can’t read SVG still show the V mark.

## 1.2.0 (2026-11-14)

### Added

- A cookie banner on the web version asks before anything is counted. Accept and Google Analytics counts page visits; decline, or don’t answer, and nothing is sent to Google and no cookie is set. Change your mind any time with Cookie settings in the footer. The desktop app never shows the banner and sends nothing.
- The footer links to the Mac app’s latest release, beside Credits and MIT License, and has a Cookie settings button. Neither appears in the desktop app.

### Changed

- The web version’s Content-Security-Policy allows Google’s tag (`script-src`), its collection endpoints and Google Signals (`connect-src`, `img-src`) and the tag’s service-worker iframe (`frame-src`), which the page only contacts after you accept. Still no `unsafe-eval` and no inline script. The desktop app keeps its offline policy.

## 1.1.0 (2026-11-13)

### Added

- How to play: a button beside Hint and New game opens a short guide to the pieces, the tray, rocks and levels, with its numbers taken from the game’s own rules.
- Line up four or more rocks and they explode like a Charge, clearing the 3×3 around them in rock gray. They still never become specials, and the blast sets off any special it reaches.
- A Prism swapped with a rock is now a legal move: it clears every rock on the board.
- A resting Prism slowly turns, so its colors drift around the ring. Reduced motion keeps it still.

### Changed

- Rocks appear from level 5 (was 10), at 3% rising to 6% by level 8, then 1.5% a level to 18% at level 16 (was capped at 10%).
- From level 9, refills are stingy: a new piece that would land in a ready-made match is re-rolled 10% of the time at level 9, rising 10% a level to 60%. Games stay replayable from their seed.
- The tray stops counting clears while it’s full, and filling it resets every color’s count, so no piece is earned and lost. The tray-lost sound is gone.
- You can pick up and drag a tray piece while a move is still playing. Let go before the board settles and the piece waits where you dropped it, then lands as soon as the board is still (or shakes and goes home if that cell can’t take it any more). A new game, a level-up, the game ending or turning AI on sends it home.
- Dependencies: eslint 10.15, Playwright 1.65.1, jest-dom 7. Two npm advisories (minimatch, yaml) are cleared.
- A refreshed look around the board (the chrome redesign). Every button, switch and speed toggle is at least 44 px tall, so they’re easier to hit; on a 1440×900 desktop the board shrinks a little to make room (cells of 53 px instead of 56).
- The AI controls have their own dock under the buttons, as wide as the board. With AI mode off it shows only the switch; switch it on and the speed toggle, the move counter and “Thinking…” appear. The dock never changes height, so the board doesn’t move, and it and the buttons fit phones as narrow as 320 px.
- Keyboard focus shows the same yellow ring on every control, the 404 page included.
- Disabled buttons, such as Hint while a move plays, are drawn in a readable gray-blue with a dashed border instead of fading out.
- Dialogs sit on a flat dark surface. “No moves left” is a centered column, and How to play fades out at its scrolling edges, with a hairline above Got it.
- The level label and its progress bar share one row.
- The header shows the Voltline V mark beside the title, and the V and o of “Voltline” sit closer together.
- The header has a single sound on/off button; the volume slider is gone. Sound plays at the default level, and a volume saved by an earlier version is ignored.
- The score flares briefly as it rises.
- Corner brackets frame the board and tray, and the tray’s border turns yellow while it’s full. The tray-full notice fades in and out.
- If the graphics can’t start, the message sits in a board-sized panel with an icon.
- The footer links are bigger targets.
- The favicon and the desktop app icon are the V mark; the app icon sits on the macOS icon grid, the same size as other apps in the Dock.

### Fixed

- Tray drops that seemed not to take: they were drops on a cell the tray can’t use (a piece of its own color, a special or a rock), which slid home exactly like a cancelled drag. Now the piece shakes there and plays the “no” sound (the sound plays with reduced motion too), then flies home.
- The mute button is always named “Mute”, with its pressed state saying whether sound is off. It used to switch its name to “Unmute” while also reporting pressed, which a screen reader read as “Unmute, pressed”.
- The disabled Hint button is readable: about 2:1 contrast before, 5.6:1 now.
- With reduced motion, the score shows its new value at once instead of counting up.

## 1.0.1 (2026-11-13)

The first public release. Version 1.0.0 was tagged but never deployed: its release checks timed out on a slow test.

### Fixed

- The release checks no longer time out on GitHub’s runners: the move-generation reference test has an explicit 30 s limit, and every test gets 15 s (deterministic engine and AI tests are slower with coverage on).

## 1.0.0 (2026-11-13)

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
