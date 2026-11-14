# Voltline: UI chrome design brief

This brief is for Claude Design. It is self-contained: everything you need (colors, type, copy, layout rules, constraints) is written out below. Screenshots are referenced by relative path under `docs/screenshots/`; attach them alongside this file.

## 1. What Voltline is

Voltline is a neon match-three puzzle game that runs in the browser (and as a small desktop app). You swap two neighboring pieces on an 8×8 board to line up three or more of the same color. Matches clear, pieces fall, new ones drop in, and every chain reaction scores more than the last. Bigger matches leave special pieces (Charge, Arc, Prism) that clear whole areas. A tray of up to five spare pieces fills as you clear colors, and you can spend them. Gray rocks appear from level 5. An AI mode plays for you, and a Hint button shows the best moves as arrows.

**Who plays it:** casual puzzle players, mostly on a phone in portrait or in a desktop browser tab, in short sessions. They know the genre. Nothing needs explaining beyond a short How to play dialog.

**How it should feel:** a polished dark neon arcade. Calm when idle (the page is a dim circuit grid, the pieces breathe softly) and punchy when something happens (score ticks up, glow flares, a notice lights up). The chrome should recede so the glowing board is the star, and never compete with it. Quiet, precise, a little electric.

## 2. Scope

**In scope: the chrome only.** That means the header (title, sound controls, score, best, level bar, level-up line), the buttons (Hint, How to play, New game), the AI controls, the tray-full notice, the dialogs (How to play, game over), the footer, the standalone 404 page, the graphics-failure message, and how all of these are laid out around the board on desktop and phone.

**Out of scope: the board and the tray strip.** The 8×8 board and the five-slot tray strip beneath it are a single PixiJS canvas. Design the space they occupy, their frame and their position relative to the chrome, but do not redraw the pieces, the glow, the hint arrows or the effects. The canvas size comes from layout code: the board is 8 cells square, each cell is the largest whole number of pixels (up to 72 px) that lets the board plus the tray strip fit with a 12 px margin. The tray strip sits directly under the board (a gap of 0.3 cell), is as wide as the board, and is about 1.2 cells tall (five slots of 0.9 cell with 0.15 cell padding). On a 1440×900 desktop window the cell is 56 px (448 px board); on a 390×844 phone it is 45 px (360 px board).

Everything the canvas draws is shown in the screenshots for context only. Your job is the frame around it.

## 3. The look, as tokens

All values below are what ships today. Keep them unless you have a reason to change them, and flag every change.

### Color

| Role | Value | Notes |
|---|---|---|
| Page background | `#0a0a11` | near-black blue |
| Page grid | lines `rgba(120,140,255,0.06)`, 1 px, every 24 px, both axes | circuit-grid look, fixed to the body |
| Panel / dialog surface | `#14142a` | MUI paper; a dialog also gets MUI’s elevation overlay, a white wash at 16.5% opacity, so it reads about `#2c2c3e` |
| Dialog border | 1 px `#4dd8ff` at 33% opacity (`#4dd8ff55`) | |
| Backdrop | `rgba(0,0,0,0.5)` | behind dialogs |
| Text primary | `#e6e9ff` | |
| Text secondary | `#9aa3d6` | best score, “AI moves”, footer, muted icon |
| Score digits | `#ffffff` with a cyan glow | |
| Accent cyan (primary) | `#4dd8ff` | title, volume, Hint, Play again, section headings |
| Accent magenta (secondary) | `#ff4fd8` | New game, How to play, AI switch, Thinking…, level bar end |
| Accent yellow | `#ffe14d` | tray-full notice, “New best!” |
| Accent green | `#3bffb0` | “Level {n}!” notice |
| New game hover | `#ff7be3` | |
| Level bar track | `rgba(120,140,255,0.16)` | |
| Level bar fill | gradient 90deg `#4dd8ff` to `#ff4fd8`, glow `0 0 10px #ff4fd8aa` | 8 px tall, fully rounded |

### Piece colors (context: the board is not yours to redraw)

Seven gems, each with a distinct shape so color is never the only signal. Stroke 7 of 100 units, fill at 14% opacity, soft same-color glow.

| Gem | Color | Shape |
|---|---|---|
| Red | `#ff3b5c` | circle |
| Blue | `#4d7bff` | rounded square |
| Yellow | `#ffe14d` | triangle |
| Green | `#3bffb0` | hexagon |
| Magenta | `#ff4fd8` | diamond (rotated square) |
| Orange | `#ff9a2e` | plus sign |
| Cyan | `#4de8ff` | five-point star |

Specials and obstacles, for the How to play swatches: **Charge** is a red circle with a bright white-ringed inner dot. **Arc** is a blue rounded square with white crackle marks on its four edges. **Prism** is a ring stroked with a gradient from `#ff3b5c` through `#ffe14d` and `#3bffb0` to `#4d7bff` (corner to corner), with a white center dot. **Rock** is dark gray: fill `#24242c`, stroke `#45454f`, a gray cross `#52525c`, and four small tabs. Rocks have no glow.

Glow on pieces and swatches: a Gaussian blur of about 2.5 per 100 units merged under the shape, in the piece’s own color. In the chrome, glows are `text-shadow` or `drop-shadow` of the same accent at roughly 40% to 55% alpha, 8 to 14 px (see the table above; for example the title is `0 0 12px #4dd8ff88`, the score `0 0 14px #4dd8ff88`).

### Typography

Both fonts are self-hosted (npm packages `@fontsource/orbitron` and `@fontsource/rajdhani`). No external font loading.

| Role | Font | Weight | Size | Notes |
|---|---|---|---|---|
| Title “Voltline” | Orbitron | 700 | 18 px | letter-spacing 0.18em, cyan, glow |
| Score | Rajdhani | 700 | 36 px phone, 46 px desktop | line-height 1.1, tabular digits, min width 8ch, centered, white. Rajdhani, not Orbitron: Orbitron’s slashed zero reads as a null sign. |
| Best score | Rajdhani | 500 | 15 px | secondary color, tabular digits |
| “Level {n}” label | Orbitron | 700 | 14 px | letter-spacing 0.12em |
| Level-up line | Orbitron | 700 | 16 px | green, glow |
| Buttons | Rajdhani | 700 | 14 px | no uppercase, letter-spacing 0.04em |
| Dialog title | Orbitron | 700 | MUI default (about 20 px) | centered |
| Dialog section heading | Orbitron | 700 | 14 px | letter-spacing 0.12em, cyan |
| Dialog body | Rajdhani | 500 | 16 px, line-height 24 px | |
| Game-over score | Rajdhani | 500 | 22 px | tabular digits |
| Game-over level / best | Rajdhani | 500 | 18 px | |
| Notices (tray full) | Rajdhani | 500 | 16 px | yellow, glow |
| AI counter / Thinking… | Rajdhani | 500 | 15 px | |
| Footer | Rajdhani | 500 | 13 px | secondary color, links underlined |

### Spacing, radii, sizes

- MUI spacing unit 8 px. Base radius 10 px (buttons, dialogs, paper). Level bar and its track use 4 px.
- Header side padding 16 px, top 12 px, bottom 4 px. Gaps inside the header stack: 4 px.
- Buttons: height about 36.5 px, minimum width 110 px, 12 px gap. Outlined buttons use a 1 px border (Hint at 50% cyan, How to play at full magenta, with an 8% magenta wash). New game is a filled magenta button with `#0a0a11` text.
- Speed toggle buttons: about 28.75 px tall, 13 px text. Sound icon button is the small MUI size; volume slider is 64 px wide.
- Level bar: up to 360 px wide, centered.
- The whole app is one column, centered, at most 640 px wide, filling the viewport height. The page itself never scrolls.

### Motion that exists today

Score counts up over 400 ms with ease-out (a drop in score, as in a new game, just jumps). Thinking… fades in after a 120 ms delay over 150 ms and fades out over 150 ms. The 404 page has a slow flicker on its zero and a swapping pair of icons. The game board has its own animation (not yours).

## 4. Every screen and state

Layout, top to bottom, in one centered column (max 640 px):

1. **Header block** (fixed rows, nothing moves when values change)
   - Row: title “Voltline” at the left; volume slider and a speaker icon button at the right.
   - Score, centered.
   - Best line, centered, 20 px tall reserved.
   - Level label “Level {n}” and the progress bar.
   - Level-up line, 26 px tall reserved (empty most of the time).
2. **Board canvas** fills the remaining height (flex), board plus tray strip centered inside it.
3. **Tray notice line**, 24 px tall reserved, empty unless the tray is full.
4. **Button row:** Hint, How to play, New game.
5. **AI row:** switch, speed toggle, move counter, Thinking….
6. **Footer:** Credits and MIT License.

On desktop (1440×900) the column is 640 px wide in the middle of the page, with the circuit grid visible on both sides. On a phone (390×844) the column is the full width. Phone portrait is the primary design target.

### 4.1 Playing: idle, selected, cascade

- `docs/screenshots/app-desktop.webp` and `docs/screenshots/app-phone.webp`: the idle game at 1440×900 and 390×844. This is the reference layout. Hint is enabled (cyan outline), How to play is magenta outline, New game is filled magenta.
- Selecting a piece is canvas-only (a pulsing ring on the piece); the chrome does not change. While a move is animating (a cascade, a deal), Hint is disabled.
- `docs/screenshots/cascade-sequence.webp` shows a cascade on the canvas. During a cascade the score counts up and the level bar fills; no other chrome moves.
- Hint is also disabled while AI mode is on, and after the game ends.

### 4.2 Hint reveal and best arrow

- `docs/screenshots/hint-reveal.webp` and `docs/screenshots/hint-best.webp`.
- Pressing Hint draws arrows on the board, each labeled with a rough value such as “≈ 1,240”. Weaker arrows fade out lowest first over about a second until only the best remains, pulsing, for a few seconds. All of this is canvas. The only chrome involvement is the Hint button (pressed, then disabled while busy). Frame it; do not redraw the arrows.

### 4.3 AI mode

- `docs/screenshots/ai-mode-running.webp`.
- Copy: switch label “AI”; speed toggle “Slow”, “Medium”, “Fast” (one is always selected, Medium by default); counter “AI moves {n}” (for example “AI moves 12”); indicator “Thinking…” (magenta, shown only while the AI is ranking moves; its space is always reserved so the row does not jump).
- When AI mode is on, the best line reads “AI best {n}” instead of “Best {n}”, and shows the AI’s own best score.
- The AI row wraps on a narrow screen (centered, 4 px row gap).

### 4.4 Tray: empty, filling, full

- `docs/screenshots/ui-tray-full.webp`: the tray strip with all five slots filled (red circle, blue square, yellow triangle, green hexagon, cyan star) and the notice below it in yellow: **“Tray full—spend one to free a slot.”** (the dash is a closed-up em-dash).
- `docs/screenshots/ui-level-up.webp` also shows a partly filled tray (two spare pieces, three empty slots). `docs/screenshots/pieces-specials.webp` shows three.
- The notice is a polite live region and stays up for as long as the tray is full. When there is room, the line is empty but keeps its 24 px of height.

### 4.5 Level up

- `docs/screenshots/ui-level-up.webp`: a moment after crossing the target.
- The green line under the level bar reads **“Level {n}!”** (for example “Level 2!”) and stays about 2 seconds, then clears, keeping its 26 px of height. It is a polite live region. The label above the bar changes to “Level 2”, the bar empties and starts refilling, and the board is replaced with a fresh one (a canvas animation).

### 4.6 Game over dialog

- `docs/screenshots/ui-game-over.webp`.
- Modal dialog, centered, minimum width 280 px, 1 px cyan border at 33%. The page behind dims; the board stays visible through the backdrop.
- Copy, top to bottom: title **“No moves left”** (Orbitron); **“Score 12,480”** (22 px); **“Level 4”** (18 px); **“Best 12,480”** (18 px, secondary color; reads **“AI best {n}”** if the AI moved in that game); **“New best!”** (Orbitron, yellow, glow, shown only when the score beat the saved best); one filled cyan button **“Play again”**, autofocused.
- There is no close button; the only exit is Play again.

### 4.7 How to play button and dialog

- `docs/screenshots/how-to-play-desktop.webp` and `docs/screenshots/how-to-play-phone.webp`.
- The button reads **“How to play”** (magenta outline, between Hint and New game). The dialog is a scrollable modal, medium width (up to 600 px), 16 px margin, closable with Escape, the backdrop or the button **“Got it”** (filled cyan, autofocused). Title **“How to play”**. Body sections, each with a cyan Orbitron heading and, where listed, a 36 px swatch drawn from the piece art:
  - **The goal.** “Swap two neighboring pieces to line up three or more of the same color. They clear, new pieces drop in, and every match that follows chains for more points. A swap that makes no match slides back.”
  - **Special pieces.** Charge (red swatch): “Made by matching 4 in a line. Clears the 3×3 area around it.” Arc (blue swatch): “Made by an L or T shape. Clears its whole row and column.” Prism (gradient swatch): “Made by matching 5 in a line. Swap it with a colored piece to clear every piece of that color (rocks stay).” Then, in secondary color: “Specials chain: an explosion that reaches another special sets it off.” Each row is the bold name followed by a period, then the sentence.
  - **The tray.** “Every 10 pieces of one color you clear earns a spare piece of that color. The tray holds five, and counting pauses while it’s full, so spend one. Tap a tray piece, then a plain piece on the board (or drag it there) to swap it in. Placing costs a move.”
  - **Rocks.** (rock swatch) “From level 5, gray rocks start appearing. Clear them by matching three, or with an explosion. A Prism swapped with a rock clears every rock on the board.”
  - **Levels and game over.** “Fill the progress bar to level up. Past level 8, refills get harder. The game ends when no move can make a match, tray placements included, so a spare piece can save you.”
  - **Hint and AI mode.** “**Hint** shows the best moves as arrows.” “**AI mode** plays for you until you switch it off.”
  - **Controls.** “Tap or click a piece, then a neighbor. Or drag (or swipe) a piece toward a neighbor.”

### 4.8 Sound

- Header, top right: a 64 px volume slider (0 to 1, steps of 0.05, default 0.8) and a speaker icon button. Accessible names: slider “Volume”; button “Mute” when sound is on, “Unmute” when muted (a toggle button with a pressed state).
- On: cyan speaker with sound waves. Muted: secondary-colored speaker with a cross, and the slider is disabled. State must be readable at a glance without color.

### 4.9 Footer

- Two links, centered, 13 px, secondary color, separated by a middle dot with spaces: **“Credits · MIT License”**. Both open in a new tab. They sit at the very bottom of the column with 8 px of vertical padding.

### 4.10 404 page

- `docs/screenshots/404.png`. A standalone static page, not part of the React app, with its own inline CSS. Tokens: background `#0a0a11` with a soft radial glow `rgba(77,123,255,0.16)` centered at 50% 38% and a 24 px grid of `rgba(77,123,255,0.08)` lines; ink `#eef0ff`; dim text `#a9adc9`; cyan `#4de8ff`; footnote `#8084a3`. Fonts Orbitron (weight 900 for the numerals) and Rajdhani, 20 px body.
- Copy: tab title “404 · No moves left · Voltline”; big “4 [broken red ring with a yellow lightning mark] 4” (the zero is a red dashed ring with a yellow zigzag, flickering); heading **“No moves left.”** (cyan Orbitron, uppercase, letter-spaced); **“This page didn’t make a match, so it slid back.”**; **“Our AI tried every possible swap. None of them lead here.”**; a row of five small piece icons (blue square, orange plus, a gray rock, cyan star, green hexagon) where the plus swaps with the square on a loop; a cyan outlined button **“Back to the board”**; and the footnote **“Even the Prism couldn’t clear this one.”** Motion is off with `prefers-reduced-motion`.

### 4.11 Graphics failure

- If the renderer cannot start (no WebGL, a blocked GPU), the board area shows this centered message in 18 px Rajdhani, color `#c8d0ff`, as an alert: **“Voltline couldn’t start the graphics. Try another browser.”** The header, buttons and footer still render around it. Design this state so it looks intentional, not broken (an icon or a framed panel would help), and keep the sentence as is.

## 5. Constraints

- **Stack:** React 19 and MUI 9, styled through the theme and the `sx` prop. Deliver specs that map onto MUI components and theme overrides (palette, typography, shape, component variants); avoid anything that needs a different UI library.
- **Fonts and assets:** self-hosted fonts only (Orbitron, Rajdhani). The production site has a strict Content Security Policy: no external fonts, scripts, styles or images. Inline styles and inline SVG are allowed. Icons must be inline SVG, not an icon font or a CDN.
- **Copy:** curly quotes and apostrophes (’ “ ”) everywhere, never straight ones. Use an em-dash only when it earns its place, at most one per sentence, closed up with no spaces on either side, and never in consecutive sentences. En-dashes in numeric ranges are fine. Where a colon or comma reads better, use that.
- **Accessibility:** WCAG AA contrast for all text and controls (4.5:1 for text under 18 px, 3:1 for large text and UI boundaries). Visible keyboard focus on every control, in a color that works on both the page and dialog backgrounds. Notices (“Level {n}!”, the tray-full line, the graphics failure) are live regions. Dialogs trap focus and have an accessible title. Do not rely on color alone for state (the mute icon changes shape).
- **Motion:** respect `prefers-reduced-motion`: replace count-ups, fades and flickers with instant changes or very short fades.
- **No layout shift:** the score uses tabular digits in a reserved width (at least 8 characters wide) so growing from 9 to 1,000,000 never moves anything; every conditional line (best, level-up, tray notice, Thinking…) keeps its height when empty.
- **The chrome never covers the board.** Dialogs are the only thing allowed over it, and only while open.
- **Phone portrait first.** Design 390×844 first, then widen. Tap targets at least 44 px where the layout allows (the current speed toggle and speaker icon are smaller than that; propose better sizes). The page does not scroll: everything fits in the viewport and the board takes whatever height is left.
- **Known gap to fix:** the disabled Hint button (MUI’s default disabled color, about 30% white on near-black) is below AA contrast. Give disabled controls a treatment that is clearly disabled but still readable.

## 6. Originality

Voltline is an original game with its own pieces, look and sounds. It borrows only the genre’s mechanics. Do not echo the name, art, fonts, jewel shapes or visual identity of any existing match-three game, and do not propose faceted gem renders or sparkle-star motifs from that genre. Stay with the flat, outlined neon-glyph language above.

## 7. What to hand back

1. **Mockups of each state** at 1440×900 and 390×844: playing (idle), Hint active, AI mode on (with Thinking… visible), tray full, level up, game over (with and without “New best!”, and the AI-best variant), How to play (top and scrolled), muted, graphics failure, and the 404 page.
2. **Updated tokens:** a complete table of colors, type scale, spacing, radii, borders, glows and motion durations, with exact values, marking anything you changed from section 3.
3. **Component specs:** for the header (title, volume, mute, score, best, level bar, level-up line), the three buttons, the AI controls, the tray notice, both dialogs, the footer and the 404 page. For each give sizes, spacing, every state (default, hover, focus-visible, pressed, disabled, selected) and motion (duration, easing, what respects reduced motion).
4. **Copy changes:** list every string you would change and why. Do not change copy silently.
5. **A recommendation** on tap-target sizes, the focus ring and the disabled treatment, per section 5.
