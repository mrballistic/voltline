# Voltline chrome redesign: handoff spec

Date: 2026-11-13 · Status: ready to implement · Builds on `2026-11-13-voltline-1-1-design.md` §5 (the Claude Design brief in `docs/design/claude-design-brief.md`)

Design canvas (mockups of every state at 390×844 and 1440×900, tokens, component specs, logo): https://claude.ai/artifact/Lix1oz9XNFch4WU49yZada. Its source files are copied to `docs/design/voltline-chrome/` for reference (see the README there). Where this spec and a mockup disagree, this spec wins.

## Intent

Keep today’s dark neon look and tokens, and fix what the brief called out: tap targets under 44 px, an unreadable disabled Hint, no shared focus ring, and AI controls that crowd the button row. Add a logo mark. Engine, AI, planner and pieces are untouched. The only canvas changes are the board frame (§9).

## Checklist (implement in this order)

Each item lists its files and the tests to add or change. Run `npm run type-check && npm run lint && npm run test:run` after each one.

### 1. Theme overrides (`src/theme.ts`)

Add to the theme (MUI 9):

- `palette.action.disabled: '#7d86b8'` (5.6:1 on `#0a0a11`; MUI’s 30% white is about 2:1).
- `MuiButtonBase`: `defaultProps.disableRipple: true`; `styleOverrides.root['&.Mui-focusVisible']`: `outline: '2px solid #ffe14d', outlineOffset: 3`. The yellow ring is 15.2:1 on the page and 13.0:1 on dialogs, and differs from every control color.
- `MuiButton.styleOverrides.root`: `minHeight: 44`, `minWidth: 110`, `transition` on color, background, border and box-shadow at 120 ms `cubic-bezier(0.2, 0, 0, 1)`; press is `transform: translateY(1px)` (never scale); `'&.Mui-disabled'`: `color: '#7d86b8'`, `border: '1px dashed rgba(154,163,214,0.45)'`, `background: 'transparent'`, `boxShadow: 'none'`. The dashed border is the non-color cue.
- `MuiIconButton.styleOverrides.root`: `width: 44, height: 44, borderRadius: 10`; hover background `rgba(77,216,255,0.10)`, pressed `0.18`.
- `MuiToggleButton.styleOverrides.root`: `minHeight: 44, minWidth: 52, fontSize: 14` (was 13), `borderRadius: 8`, color `text.secondary`, hover color `#e6e9ff` with `rgba(154,163,214,0.08)`; `'&.Mui-selected'`: `color: '#ff4fd8'`, `background: 'rgba(255,79,216,0.16)'`, `boxShadow: 'inset 0 0 0 1px #ff4fd8'`.
- `MuiDialog.styleOverrides.paper`: `backgroundColor: '#1a1a34'`, `backgroundImage: 'none'`, `border: '1px solid #4dd8ff55'`, `margin: 16`. Today the elevation-24 white overlay renders `#3b3b4d` (not the `#2c2c3e` the brief assumed) and drops magenta text to 3.8:1. On `#1a1a34`, secondary text is 6.9:1 and magenta is 5.9:1.
- Add colors to `NEON` or a sibling export (not hex literals in components): `magentaHover '#ff7be3'`, `magentaPressed '#e63fc2'`, `cyanHover '#85e5ff'`, `cyanPressed '#2fbde6'`, `focus '#ffe14d'`, `textDisabled '#7d86b8'`, `dialog '#1a1a34'`.
- `@media (prefers-reduced-motion: reduce)`: button transitions keep color only; no transform.

Tests: add `src/theme.test.ts` asserting the focus outline, disabled color and dialog paper values.

### 2. Header (`src/components/Header.tsx`, new `src/components/LogoMark.tsx`)

- Row 1 is 44 tall. Left: `LogoMark` (26 px, `aria-hidden`) + 10 px gap + the existing h1 “Voltline” (unchanged style). Right: volume + 4 px gap + mute.
- `LogoMark`: inline SVG (CSP allows inline SVG), viewBox `0 0 100 100`, a `<g transform="translate(6 3)">` holding path `M16 20 L44 80 L60 48 L48 48 L72 14` (stroke 9, round caps and joins, linear gradient `#4dd8ff` → `#ff4fd8` in user space x 10→80) and two pads: circles at (16,20) and (72,14), r 7, fill `#0a0a11`, stroke 5 in cyan and magenta. Glow: `filter: drop-shadow(0 0 3px #4dd8ff88)`. Give the gradient a `useId()` id so two instances never collide. Reference SVG: `public/logo-mark.svg`.
- Volume slider: width 70 inside an 88 × 44 hit area (padding `20px 9px`), thumb 18. Muted: `disabled` as today; style the disabled track `rgba(154,163,214,0.22)`, no fill, thumb hollow (`#0a0a11` with a 2 px `#7d86b8` ring).
- Mute: `IconButton` 44 × 44 (theme), icon 24. **Accessible name stays “Mute”** with `aria-pressed={muted}`. Today the name flips to “Unmute” while also using a pressed state, which reads as “Unmute, pressed”. Keep the existing waves/cross shape change and colors.

Tests: update `Header.test.tsx` (name is always “Mute”; `aria-pressed` toggles; the logo is `aria-hidden` and the heading is still “Voltline”).

### 3. Level row (`src/components/LevelBar.tsx`)

One 20 px row instead of two: “Level {n}” on the left (Orbitron 14, 0.12em, `minWidth: 84`, no wrap), 12 px gap, the bar filling the rest; the whole row `maxWidth: 360`. Keep the existing `aria-label`. Bar width animates 300 ms ease-out; instant with reduced motion. This pays back most of the height the 44 px controls add.

### 4. Score (`src/components/ScoreDisplay.tsx`)

- Respect reduced motion: with `prefers-reduced-motion: reduce`, set the value instantly (today it always counts up).
- New, optional: a flare on each increase. The text-shadow goes to `0 0 22px #4dd8ffcc` over 120 ms, then back to `0 0 14px #4dd8ff88` over 400 ms, eased `cubic-bezier(0.16, 1, 0.3, 1)`. Off with reduced motion.

Tests: with `matchMedia('(prefers-reduced-motion: reduce)')` mocked true, the shown value equals the new score with no frames.

### 5. AI dock (`src/components/AIControls.tsx`, `GameControls.tsx`, `App.tsx`)

The AI controls leave the button row and get their own area:

- `GameControls` loses `aiSlot`. `App` renders `<AIControls>` as its own block between `GameControls` and the footer, 8 px above.
- The dock: `role="group"`, `aria-label="AI mode"`, height **52 fixed**, radius 10, `padding: 0 3px`, 8 px gap, `display: flex; align-items: center`. Width equals the board width (see “Board width” below), so it lines up with the board and tray.
- **AI off:** only the switch, with `border: 1px solid rgba(154,163,214,0.2)` and no background. The speed toggle and the counter are **not rendered**.
- **AI on:** `border-color: rgba(255,79,216,0.45)`, `background: rgba(255,79,216,0.06)`, the switch label turns magenta, and the speed toggle and a right-aligned status stack appear (fade 150 ms; instant with reduced motion). Status stack, Rajdhani 15, line-height 18: “AI moves {n}” (secondary, tabular) above “Thinking…” (magenta, with a 6 px dot glowing `0 0 8px #ff4fd8`). Keep today’s Thinking… behaviour (always laid out, opacity fade after 120 ms, `aria-hidden` when idle).
- The dock height never changes, so toggling AI never resizes the board.
- Switch: keep `FormControlLabel` + `Switch color="secondary"`; make the label row 44 tall (the whole row is the hit area); label Rajdhani 700 15, 0.04em.
- Speed: keep the `ToggleButtonGroup` (it already has `aria-label="AI speed"`); segments get their size from the theme (44 × ≥ 52; padding 8 on phone, 14 from `sm`).
- Disable the switch (and so the dock) when the renderer `failed`.

**Board width:** `computeLayout` in `src/render/layout.ts` is pure, so `BoardCanvas` can watch its host with a `ResizeObserver`, call `computeLayout(width, height).board.size`, and publish it as a CSS variable `--vl-board-px` on the app column. The dock uses `width: var(--vl-board-px, 100%)`, with `maxWidth: '100%'`. The renderer sizes from the same host, so the two always agree. Document the variable in `ARCHITECTURE.md` (layout section).

Tests: update `AIControls.test.tsx` (off: no speed group and no counter in the DOM; on: both present; the group is named “AI mode”; the switch is disabled when `disabled`).

### 6. Buttons (`src/components/GameControls.tsx`)

- Order, gap (12) and copy unchanged; height and min width come from the theme.
- New game: `bgcolor: NEON.magenta`, hover `magentaHover` with glow `0 0 18px #ff4fd888`, rest glow `0 0 14px #ff4fd855`, pressed `magentaPressed`.
- How to play: outlined magenta, background `rgba(255,79,216,0.08)`, hover 0.14, pressed 0.22.
- Hint: outlined cyan at 50%, hover full border + `rgba(77,216,255,0.08)`, pressed 0.16. Also disable Hint when `failed` (App passes it in).

### 7. Tray notice (`src/components/TrayNotice.tsx`)

Keep the copy and the always-mounted live region. Fade the text in and out over 150 ms (instant with reduced motion). Glow `0 0 10px #ffe14d88` (today `8px #ffe14d66`).

### 8. Dialogs

**Game over (`GameOverDialog.tsx`):** paper width 300 (`minWidth: 280` stays), padding 28/24/24, centered column, 6 px gaps. Title Orbitron 20, explicit. “Score {n}” 22 white, “Level {n}” 18, best line 18 secondary, “New best!” Orbitron 16 yellow, glow `0 0 12px #ffe14d88`. Play again: contained cyan, 44 × ≥ 140, Rajdhani 700 15, 18 px above, glow `0 0 14px #4dd8ff55`, hover `cyanHover`, pressed `cyanPressed`, `autoFocus` as today. No `onClose` (as today), so Escape and the backdrop do nothing.

**How to play (`HowToPlayDialog.tsx`):** keep `scroll="paper"`, `maxWidth="sm"`, `fullWidth` and the copy. The 16 px margin comes from the theme, so the dialog is 358 wide on a phone and up to `100% − 32px` tall. Replace `dividers` with a single top hairline on the actions (`1px solid rgba(120,140,255,0.14)`). Add a 32 px bottom fade (and a 28 px top fade once scrolled) as pointer-events-none overlays in the dialog surface color. Thin scrollbar: `scrollbarWidth: 'thin', scrollbarColor: 'rgba(77,216,255,0.5) transparent'`. Sections 20 apart, headings 6 px above their text, swatch rows nudge text 6 px down to center on line one. Got it: same as Play again. Return focus to the How to play button on close (MUI does this by default; keep it).

### 9. Board frame (render; `src/render/BoardView.ts`, `TrayView.ts`)

- Keep the shipped panel look (`PANEL` in `BoardView.ts`); the mockups approximate it.
- New: four corner brackets around the board-plus-tray stack, 16 × 16, 2 px stroke, `0x4dd8ff` at alpha 0.5, 8 px outside the stack, 4 px corner radius. Draw them in Pixi (from `layout.board` and `layout.tray`), next to `PANEL`, as a `FRAME` constant. Put the geometry in a pure helper (`frameCorners(layout)` in `layout.ts`) so it’s unit-tested. Reduce `MARGIN_PX` only if the brackets clip; they fit inside today’s 12 px margin.
- New: while the tray is full, `TrayView` strokes its panel `0xffe14d` at alpha 0.45 instead of the normal border, so “full” is visible without reading the notice.

Tests: `layout.test.ts` for `frameCorners`; a `TrayView`-level or player test that the full-tray border style is chosen when the tray holds `TRAY_CAPACITY` pieces.

### 10. Graphics failure (`src/components/BoardCanvas.tsx`)

Keep `GRAPHICS_FAILED` and `role="alert"`. Instead of bare text, draw a panel with the same footprint as the board plus tray (from `computeLayout` on the host size, as in §5), centered: background `rgba(0,0,0,0.4)`, inset border `rgba(200,208,255,0.22)`, radius 10, column with 20 px gap and 32 px padding. Above the sentence, a 72 px inline SVG icon (`aria-hidden`): a dashed chip outline (`#c8d0ff`, stroke 2.5, dash 5 4), pins on three sides with one pin missing on the left, and a yellow bolt `M38.5 26 l-7 11 h6.5 l-4 9` with a soft glow. Sentence: Rajdhani 500 18/26 `#c8d0ff`, `maxWidth: 280`. The DOM corner brackets aren’t drawn here (Pixi isn’t running), so draw the same four brackets in CSS around this panel. The source of the icon is in `docs/design/voltline-chrome/Main.dc.html` (search for `role="alert"`).

Tests: `BoardCanvas.test.tsx` keeps asserting the alert text; add that the icon is `aria-hidden`.

### 11. Footer (`src/App.tsx`)

Links get `display: inline-block; padding: 6px 2px` (28 px tall target), `textUnderlineOffset: 2`, hover and focus color `#e6e9ff`. The footer gets `mt: 'auto'`.

### 12. 404 page (`public/404.html`)

Already close to the mockup. Changes: the button gets `min-height: 48px`; switch its focus ring to `outline: 2px solid #ffe14d; outline-offset: 3px` to match the app. Optionally add the logo lockup above the numerals (the mark from `public/logo-mark.svg`, inlined, since the page is standalone).

### 13. Logo files

- `public/logo-mark.svg`: the mark, transparent background, for docs and the README.
- `public/logo-mark-small.svg`: a 16–32 px variant (no pads, stroke 11) on a rounded `#0a0a11` square, ready to be the favicon.
- `docs/design/voltline-chrome/logo-app-icon.svg`: a 1024 app-icon master in the same style as `src-tauri/icons/source.svg`.

Whether the V mark replaces today’s Prism-ring favicon (`public/icon.svg`) and the desktop app icon is Todd’s call. Don’t swap them as part of this work unless he says so.

## Layout budget

The page never scrolls; the renderer takes whatever height is left (`computeLayout`).

| | Phone 390×844 | Desktop 1440×900 |
|---|---|---|
| Header (12 + 44 + score + 20 + 20 + 26 + gaps + 4) | 182 | 193 |
| Board area (12 + board + gap + tray + 12) | 452 (cell 45) | 528 (cell 53) |
| Tray notice | 24 | 24 |
| Button row (4 + 44) | 48 | 48 |
| AI dock (8 + 52) | 60 | 60 |
| Footer (8 + 28 + 8) | 44 | 44 |

On a phone the cell stays 45 because width limits it. At 1440×900 the cell drops from 56 to about 53, which is the cost of 44 px targets. If Todd wants 56 back, use 40 px controls under `@media (pointer: fine)` only.

## Motion and reduced motion

| What | Timing | Reduced motion |
|---|---|---|
| Score count-up | 400 ms, ease-out cubic (as today) | instant |
| Score flare | 120 ms up, 400 ms back | off |
| Level bar width | 300 ms ease-out | instant |
| Level-up line | fade in 150, hold ≈ 2000, fade out 300 | appears and clears |
| Tray notice | 150 in / 150 out | instant |
| Thinking… | 120 ms delay, 150 ms fade (as today) | fades instant |
| AI dock on/off | 150 ms border, wash and contents | instant |
| Button hover | 120 ms color only | color only |
| Button press | 1 px down, 60 ms | no movement |
| Dialogs | MUI default fade | 0 ms |

Chrome timings live with their components today (`COUNT_MS` in `ScoreDisplay.tsx`). Either keep that pattern or gather them in one `src/components/motion.ts`; don’t put them in `src/render/constants.ts`, which is the renderer’s.

## Copy

No visible strings change. Accessible names:

| Where | String | Note |
|---|---|---|
| Mute button | “Mute”, always, plus `aria-pressed` | Changed (was “Mute”/“Unmute”) |
| AI dock | `role="group"`, “AI mode” | New |
| Speed toggle | “AI speed” | Already shipped, keep |
| Level bar | “Level {n} progress” | Already shipped, keep |
| Logo mark | none (`aria-hidden`) | New; the h1 stays the name |

## Docs and screenshots (part of the same change)

- `CHANGELOG.md` → `## Unreleased`: under Changed, the 44 px controls, AI dock, focus ring, disabled style, dialog surface, level row and header mark; under Fixed, the mute button’s accessible name and the disabled Hint contrast.
- `ARCHITECTURE.md`: the `--vl-board-px` variable and `frameCorners`.
- `README.md`: only if the AI section describes the old control layout.
- Retake screenshots in `docs/screenshots/` once it’s built (same names, so the README keeps working): `app-phone.webp`, `app-desktop.webp`, `ai-mode-running.webp`, `ui-tray-full.webp`, `ui-level-up.webp`, `ui-game-over.webp`, `how-to-play-phone.webp`, `how-to-play-desktop.webp`, `404.png`. Use `?seed=N` and the dev fixtures for repeatable states, at 390×844 and 1440×900.

## Open questions for Todd

1. Replace the Prism-ring favicon and app icon with the V mark?
2. Accept 53 px desktop cells, or use 40 px controls for fine pointers to keep 56?
3. Keep the optional score flare (§4)?
