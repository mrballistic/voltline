# CLAUDE.md

This file provides guidance to Claude Code when building or modifying this project. Read this entire file before writing any code.

## Project Overview

**Bejeweled.ai** — A web-based match-three puzzle game (Bejeweled 2 clone) with player and AI modes. The player swaps adjacent jewels to create matches of 3+ in a row. Matched jewels disappear, remaining jewels fall via gravity, new jewels spawn from above, and chain reactions score exponentially. An AI mode uses an LLM to analyze the board and make moves autonomously.

**Live URL:** `https://voltline.mrballistic.com`

This is a ground-up rebuild. A previous version exists but has architectural bugs. Do NOT reference or copy from any existing codebase. Build fresh using these specs.

---

## Commands

```bash
npm run dev        # Vite dev server (port 5173)
npm run build      # TypeScript check + production build → dist/
npm run preview    # Serve built dist/ locally
npm run lint       # ESLint
npm test           # Vitest + React Testing Library
# Releases: tag vX.Y.Z on main; GitHub Actions deploys to the server (see DEPLOY.md)
```

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | React 19 | Functional components + hooks only |
| Language | TypeScript (strict mode) | Every file is `.ts` or `.tsx` |
| Build | Vite | `base: './'` for GitHub Pages relative paths |
| UI Library | MUI 6 (Material UI) | Theme provider, `sx` prop styling, responsive breakpoints |
| Animation | GSAP 3 | Promise-wrapped tweens, timeline-based cascades |
| Drag & Drop | react-dnd + react-dnd-multi-backend | Unified mouse + touch input |
| AI Backend | Anthropic API (claude-sonnet-4-20250514) | Client-side calls, env-var API key |
| Testing | Vitest + React Testing Library | Utils = unit tests, hooks = integration tests |

---

## Visual Design Direction

**Do NOT use emojis for game pieces.** Render jewels as styled geometric shapes using SVG or CSS. This gives full control over color, animation, and visual polish.

### Jewel Design

7 jewel types, each a distinct shape + color combination:

| Type | Shape | Color | CSS/SVG Approach |
|------|-------|-------|-----------------|
| Diamond | Rotated square (◆) | `#60C8FF` ice blue | SVG `<rect>` rotated 45° with inner gradient |
| Ruby | Circle | `#FF4060` crimson | SVG `<circle>` with radial gradient highlight |
| Emerald | Hexagon | `#40E880` green | SVG `<polygon>` 6-point |
| Sapphire | Rounded square | `#4060FF` deep blue | SVG `<rect>` with large border-radius |
| Topaz | Triangle | `#FFD040` gold | SVG `<polygon>` 3-point |
| Amethyst | Star (4-point) | `#C060FF` purple | SVG `<polygon>` or path |
| Citrine | Oval | `#FF8040` orange | SVG `<ellipse>` |

Each jewel should have:
- A subtle inner glow / radial gradient (light source top-left)
- A very slight CSS `filter: drop-shadow()` for depth
- Hover state: gentle scale(1.05) + brightness increase
- Selected state: pulsing glow ring (CSS animation, not GSAP — keep GSAP for game logic animations)
- Match state: bright flash before removal

### Overall Aesthetic

**Direction: Polished dark arcade.** Think modern arcade cabinet meets glass morphism.

- **Background:** Deep charcoal (`#1A1A2E`) with subtle radial gradient center glow
- **Board:** Slightly lighter surface (`#16213E`) with thin 1px grid lines (`rgba(255,255,255,0.06)`)
- **Typography:** Use Google Fonts — display font: `"Orbitron"` (scores, headers), body: `"Rajdhani"` (UI elements). Both are free, distinctive, and game-appropriate.
- **Score display:** Large, prominent, with a counting-up animation on score change
- **Dark mode default**, optional light mode toggle (but dark is the primary experience)

---

## Architecture

### Component Tree

```
App
├── ThemeProvider (dark/light, MUI theme with custom palette + typography)
│   └── ScoreProvider (score, combo, chain state via context)
│       └── DndProvider (MultiBackend — mouse + touch)
│           ├── Header
│           │   ├── Logo / Title
│           │   ├── ScoreDisplay (animated score counter)
│           │   ├── ChainIndicator (shows current multiplier)
│           │   └── ModeToggle (Player / AI switch)
│           ├── GameBoard (main game container, owns board state)
│           │   ├── BoardGrid (CSS Grid, renders Jewel components)
│           │   │   └── Jewel × 64 (SVG shape + interaction handlers + data attrs)
│           │   └── CustomDragLayer (drag preview with tilt/scale)
│           ├── AIControls (visible in AI mode only)
│           │   ├── PlayPauseButton
│           │   ├── SpeedSlider
│           │   ├── MoveCounter
│           │   └── ThinkingIndicator
│           ├── GameControls
│           │   ├── HintButton
│           │   └── NewGameButton
│           └── Footer
```

### Data Model

```typescript
// src/types/game.ts — THE SINGLE SOURCE OF TRUTH for all game types

export const BOARD_SIZE = 8;

export const JEWEL_TYPES = [
  'diamond', 'ruby', 'emerald', 'sapphire', 'topaz', 'amethyst', 'citrine'
] as const;

export type JewelKind = typeof JEWEL_TYPES[number];

export interface JewelType {
  id: string;          // UUID — stable React key AND GSAP animation target
  type: JewelKind;     // which jewel
  isNew?: boolean;     // spawned from cascade — triggers drop-in animation
  isMoving?: boolean;  // currently mid-animation — don't re-animate
}

export interface Position {
  row: number;  // 0 = top row
  col: number;  // 0 = left column
}

export interface Match {
  positions: Position[];
  type: JewelKind;
}

export interface CascadeMove {
  jewelId: string;
  fromRow: number;
  toRow: number;
  col: number;
  isNew: boolean;      // true = entering from above the board
}

// Board is 2D array. null = empty cell (after match removal, before cascade)
export type Board = (JewelType | null)[][];
```

**CRITICAL: All modules import types from `src/types/game.ts`. No local type redefinitions anywhere.**

### State Management

- **Board state:** `useState<Board>` in `GameBoard`, exposed to `App` via `forwardRef` / `useImperativeHandle`
- **Authoritative board ref:** `useRef<Board>` updated synchronously alongside `useState` — this is what animation callbacks and the AI loop read (avoids stale closures)
- **Processing lock:** `useRef<boolean>` (`isProcessing`) — NOT useState, because state updates are batched and async
- **Score/combo/chain:** `ScoreContext` (separate from board to decouple scoring from game loop)
- **No global state library.** The game state is small. Context + refs + props is sufficient.

---

## Game Loop: Swap → Match → Cascade

This is the core mechanic. **Everything is sequential and async — each step awaits animation completion before proceeding.**

### Overview

```
handleSwap(pos1, pos2):
  if isProcessing.current → return (locked)
  isProcessing.current = true
  
  1. Clone board
  2. Swap jewels in clone
  3. matches = findMatches(clone)
  4. If no matches:
     a. await animateSwap(pos1, pos2)    // show the swap
     b. await animateSwap(pos2, pos1)    // revert it
     c. isProcessing.current = false
     d. return
  5. Commit swap to state + ref
  6. await processMatchesAndCascade(board, 0)
  7. isProcessing.current = false
```

### processMatchesAndCascade (recursive)

```
processMatchesAndCascade(board, chainLevel):
  matches = findMatches(board)
  if no matches → return board
  
  // Score this round
  updateScore(matches, chainLevel)
  
  // Animate removal
  await animateMatch(matches)
  
  // Remove matched cells (set to null)
  board = removeMatches(board, matches)
  
  // Gravity fill
  { board, moves } = handleCascade(board)
  
  // Animate drops
  await animateCascade(moves)
  
  // Update React state to match post-cascade board
  setBoard(board)
  boardRef.current = board
  
  // Check for new matches from cascade
  return processMatchesAndCascade(board, chainLevel + 1)
```

### Match Detection (`src/utils/matchDetection.ts`)

**Algorithm:** For each cell, scan right (horizontal) and down (vertical) to find runs of 3+ identical jewels.

Key requirements:
- Handle 3, 4, and 5-in-a-row
- Handle T-shapes and L-shapes (intersecting runs) — collect ALL matched positions into a single Set, deduplicate by `"row-col"` string key
- Return an array of `Match` objects, but ensure no position appears in multiple matches (union them)
- Skip null cells

```typescript
export function findMatches(board: Board): Match[] {
  const matchedPositions = new Map<string, JewelKind>(); // "row-col" → type
  
  // Horizontal scan
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col <= BOARD_SIZE - 3; col++) {
      const jewel = board[row][col];
      if (!jewel) continue;
      
      let runLength = 1;
      while (col + runLength < BOARD_SIZE && 
             board[row][col + runLength]?.type === jewel.type) {
        runLength++;
      }
      
      if (runLength >= 3) {
        for (let i = 0; i < runLength; i++) {
          matchedPositions.set(`${row}-${col + i}`, jewel.type);
        }
      }
    }
  }
  
  // Vertical scan (same pattern, swap row/col iteration)
  // ...
  
  // Group into Match objects by connected regions of same type
  // (Implementation detail — one Match per contiguous group)
}
```

### Cascade Handler (`src/utils/cascadeHandler.ts`)

```typescript
export function handleCascade(board: Board): { board: Board; moves: CascadeMove[] } {
  const newBoard = cloneBoard(board);
  const moves: CascadeMove[] = [];
  
  for (let col = 0; col < BOARD_SIZE; col++) {
    // Collect non-null jewels from bottom to top
    const jewels: JewelType[] = [];
    for (let row = BOARD_SIZE - 1; row >= 0; row--) {
      if (newBoard[row][col]) {
        jewels.push(newBoard[row][col]!);
      }
    }
    
    // Place existing jewels at the bottom
    let targetRow = BOARD_SIZE - 1;
    for (const jewel of jewels) {
      const fromRow = findJewelRow(board, col, jewel.id);
      if (fromRow !== targetRow) {
        moves.push({ jewelId: jewel.id, fromRow, toRow: targetRow, col, isNew: false });
      }
      newBoard[targetRow][col] = { ...jewel, isMoving: fromRow !== targetRow };
      targetRow--;
    }
    
    // Fill remaining top slots with new jewels
    while (targetRow >= 0) {
      const newJewel = createRandomJewel();
      newBoard[targetRow][col] = { ...newJewel, isNew: true, isMoving: true };
      moves.push({
        jewelId: newJewel.id,
        fromRow: targetRow - (targetRow + 1), // starts above the board
        toRow: targetRow,
        col,
        isNew: true
      });
      targetRow--;
    }
  }
  
  return { board: newBoard, moves };
}
```

### Board Initializer (`src/utils/boardInitializer.ts`)

Generate an 8×8 board with no pre-existing matches:

```
createBoard():
  loop:
    board = 8x8 grid of random jewels (each cell gets UUID + random type)
    if findMatches(board).length === 0 → return board
```

For better performance, use a "place-and-check" approach: fill left-to-right, top-to-bottom, ensuring each placement doesn't create a 3-in-a-row with its left or top neighbors.

---

## Animation Architecture (`src/utils/animations.ts`)

**All animation functions return Promises.** The game loop `await`s each one.

### DOM Targeting

Every `Jewel` component renders with:
- `data-jewel-id={jewel.id}` — for targeting specific jewels
- `data-position={`${row}-${col}`}` — for targeting grid positions

**Keep these data attributes in sync with board state at all times.**

### Animation Functions

```typescript
// Slide two jewels to each other's positions
export function animateSwap(pos1: Position, pos2: Position): Promise<void>
// Duration: 0.2s, ease: "power2.inOut"

// Flash and scale-to-zero matched jewels
export function animateMatch(matches: Match[]): Promise<void>
// Duration: 0.15s per jewel, slight stagger within each match

// Drop jewels into new positions after cascade
export function animateCascade(moves: CascadeMove[]): Promise<void>
// Duration: 0.08s per row traveled, stagger by column (left to right, 0.03s offset)
// Use GSAP timeline for coordinated column-by-column drops
// Ease: "bounce.out" for landing (subtle — damping: 0.3)

// Revert a failed swap
export function animateRevert(pos1: Position, pos2: Position): Promise<void>
// Same as animateSwap but back to original positions
```

### GSAP Rules

1. **Always `clearProps: "all"`** after each animation completes — prevents stale transforms
2. **Never animate React state directly** — animate DOM, then sync state after animation resolves
3. **Use GSAP timelines** for multi-step sequences (cascades)
4. **Kill tweens on unmount** — clean up in `useEffect` return via `gsap.killTweensOf(element)`
5. **Use `will-change: transform`** on jewel elements for GPU compositing
6. **New jewels animate FROM above the visible board** — start position is `y: -(cellHeight * rowsToTravel)`

---

## AI Mode

### Architecture

```
useAIPlayer hook:
  - isActive: boolean (play/pause state)
  - speed: 'slow' | 'medium' | 'fast' → 2000ms / 1000ms / 500ms
  - moveCount: number
  - isThinking: boolean (API call in flight)
  
  useEffect:
    if !isActive → return
    interval = setInterval(() => {
      if isProcessing.current || isThinking → skip
      makeAIMove()
    }, speed)
    return () => clearInterval(interval)
```

### Board Serialization

Convert board to a text grid the LLM can reason about. Use single-character codes:

```
D=Diamond R=Ruby E=Emerald S=Sapphire T=Topaz A=Amethyst C=Citrine

   0 1 2 3 4 5 6 7
0: D R E S T A C D
1: R E S T A C D R
2: ...
7: C D R E S T A C
```

### AI Prompt

```typescript
const systemPrompt = `You are a Bejeweled game AI. You will receive an 8x8 grid of jewels.
Each cell contains one letter: D(Diamond) R(Ruby) E(Emerald) S(Sapphire) T(Topaz) A(Amethyst) C(Citrine).

Find the best move. Rules:
- Swap two horizontally or vertically adjacent jewels
- The swap must create a line of 3+ identical jewels (horizontal or vertical)
- Prefer moves that: create 4+ matches, trigger chain reactions, or clear the bottom of the board

Respond with ONLY this JSON (no markdown, no explanation):
{"row1":N,"col1":N,"row2":N,"col2":N}

Coordinates are 0-indexed. Row 0 is the top.`;
```

### AI Safety Rails

1. **Validate every AI response:** parse JSON, confirm positions are adjacent, confirm swap creates a match by running `findMatches` on a test board
2. **Fallback:** If AI returns invalid move (bad JSON, illegal move, no match created), use `hintFinder` to get a deterministic valid move instead
3. **Rate limit:** Minimum 800ms between API calls regardless of speed setting
4. **AbortController:** Cancel in-flight API calls on mode switch or unmount
5. **Error handling:** API failures → pause AI mode, show toast/snackbar, don't crash
6. **API key:** `VITE_ANTHROPIC_API_KEY` in `.env`, never committed to git

### AI API Call

```typescript
// src/utils/aiPlayer.ts
export async function getAIMove(board: Board, signal: AbortSignal) {
  const boardText = serializeBoard(board);
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      system: systemPrompt,
      messages: [{ role: 'user', content: boardText }],
    }),
    signal,
  });
  
  const data = await response.json();
  const text = data.content[0].text;
  
  try {
    return JSON.parse(text);
  } catch {
    return null; // fallback to hintFinder
  }
}
```

---

## Scoring System (`src/context/ScoreContext.tsx`)

```
Base points:
  3-match  = 100 points
  4-match  = 200 points
  5-match  = 500 points

Chain multiplier (cascade depth):
  Level 0 (initial match) = 1x
  Level 1 = 2x
  Level 2 = 4x
  Level 3 = 8x
  Level 4 = 16x
  Level 5+ = 32x (cap)

Combo multiplier (multiple matches in same cascade step):
  2 simultaneous matches = 1.5x
  3 simultaneous matches = 2x
  4+ simultaneous matches = 2.5x

Score for a cascade step = sum(base points per match) × chain_multiplier × combo_multiplier
```

The `ScoreDisplay` component should animate score changes with a counting-up effect (GSAP or CSS counter).

---

## Hint System (`src/utils/hintFinder.ts`)

Brute-force: try every possible adjacent swap, run `findMatches` on the result. Return the first (or best) one that produces matches.

```typescript
export function findHint(board: Board): { pos1: Position; pos2: Position } | null
```

If `findHint` returns null → board is deadlocked → shuffle (regenerate preserving score).

---

## Module Map

| File | Responsibility | Imports from |
|------|---------------|-------------|
| `src/types/game.ts` | ALL types, constants, `BOARD_SIZE`, `JEWEL_TYPES` | nothing |
| `src/utils/matchDetection.ts` | `findMatches(board)` | `types/game` |
| `src/utils/cascadeHandler.ts` | `handleCascade(board)` — gravity + new jewels | `types/game` |
| `src/utils/animations.ts` | GSAP promise wrappers | `types/game` |
| `src/utils/boardInitializer.ts` | `createBoard()` — no initial matches | `types/game`, `matchDetection` |
| `src/utils/hintFinder.ts` | `findHint(board)` — brute force valid moves | `types/game`, `matchDetection` |
| `src/utils/aiPlayer.ts` | `serializeBoard()`, `getAIMove()` — LLM integration | `types/game` |
| `src/hooks/useGameLogic.ts` | swap → match → cascade → score loop | `types/game`, all utils |
| `src/hooks/useJewelSwap.ts` | Selection state, adjacency check | `types/game` |
| `src/hooks/useTouchGesture.ts` | Swipe detection with thresholds | — |
| `src/hooks/useAIPlayer.ts` | AI loop, speed control, play/pause | `types/game`, `aiPlayer`, `hintFinder` |
| `src/context/ScoreContext.tsx` | Score, combo, chain state + multiplier math | — |
| `src/context/ThemeProvider.tsx` | Dark/light MUI theme | — |
| `src/components/GameBoard.tsx` | Board state owner, refs, initialization | hooks, utils |
| `src/components/BoardGrid.tsx` | CSS Grid of Jewel components | `types/game` |
| `src/components/Jewel.tsx` | SVG shape + DnD + touch + click + data attrs | `types/game` |
| `src/components/JewelShape.tsx` | Pure SVG rendering per jewel type | `types/game` |
| `src/components/AIControls.tsx` | Play/pause, speed, move count | `useAIPlayer` |
| `src/components/CustomDragLayer.tsx` | Drag preview with tilt/scale | — |
| `src/components/ScoreDisplay.tsx` | Animated score counter | `ScoreContext` |

---

## Bug Prevention Checklist

These are bugs from the previous build. Every one MUST be explicitly guarded against.

### 1. Race Conditions — Processing Lock
`isProcessing` is a `useRef<boolean>`, never `useState`. Check it at the TOP of `handleSwap()` and at every AI loop tick. Set `true` before any animation, `false` only after the entire recursive `processMatchesAndCascade` resolves.

### 2. Stale Closures — Board Ref
Maintain `boardRef = useRef<Board>()` alongside `useState<Board>`. Update `boardRef.current` synchronously every time `setBoard()` is called. All animation callbacks and AI logic read from `boardRef.current`, never from state captured in a closure.

### 3. Vanishing Animation Targets
Jewel `key` prop = `jewel.id` (UUID), never array index. Never re-key during animation. On unmount, kill tweens via `gsap.killTweensOf(element)` in `useEffect` cleanup.

### 4. Duplicate Match Scoring
`findMatches` returns deduplicated positions. Use a `Set<string>` keyed by `"${row}-${col}"`. T-shapes and L-shapes are ONE scoring event, not two.

### 5. Animation-Before-State
Cascade sequence: animate removal → set cells to null → compute gravity → animate drops → set new board state. Never update state before its animation completes.

### 6. Initial Board Has Matches
`createBoard()` loops until `findMatches(board).length === 0`. Alternatively, use greedy placement checking left-2 and top-2 neighbors.

### 7. AI Interval Leak
AI interval ID lives in a `useRef`. Clear in `useEffect` cleanup AND on mode toggle. Use `AbortController` for in-flight fetch calls.

### 8. Type Duplication
`cascadeHandler.ts` and `matchDetection.ts` MUST import from `src/types/game.ts`. No local type definitions. Ever.

---

## Project Setup

```bash
npm create vite@latest bejeweled-ai -- --template react-ts
cd bejeweled-ai

npm install @mui/material @emotion/react @emotion/styled
npm install gsap
npm install react-dnd react-dnd-html5-backend react-dnd-touch-backend react-dnd-multi-backend
npm install uuid
npm install -D @types/uuid vitest @testing-library/react @testing-library/jest-dom jsdom
```

### Vite Config

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
});
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### Environment

```bash
# .env (git-ignored)
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

---

## Build Order

Implement in this sequence. Each phase should be testable/playable before moving to the next.

### Phase 1: Foundation
1. `src/types/game.ts` — all types and constants
2. `src/utils/boardInitializer.ts` — generate valid board
3. `src/components/JewelShape.tsx` — SVG shape renderer (pure, no state)
4. `src/components/Jewel.tsx` — wraps JewelShape with data attributes
5. `src/components/BoardGrid.tsx` — CSS Grid rendering
6. `src/components/GameBoard.tsx` — board state, renders BoardGrid
7. `src/context/ThemeProvider.tsx` — MUI dark theme + Google Fonts
8. `src/App.tsx` — wire it all together
9. **Checkpoint:** Board renders with 64 colored SVG jewels, no interaction

### Phase 2: Core Mechanics (No Animation)
10. `src/utils/matchDetection.ts` + unit tests
11. `src/utils/cascadeHandler.ts` + unit tests
12. `src/hooks/useJewelSwap.ts` — click-to-select, adjacency check
13. `src/hooks/useGameLogic.ts` — handleSwap → findMatches → removeMatches → cascade → recurse
14. Wire into GameBoard — instant state updates, no animation
15. **Checkpoint:** Clicking two adjacent jewels swaps them, matches disappear instantly, gravity fills gaps

### Phase 3: Animation
16. `src/utils/animations.ts` — animateSwap, animateMatch, animateCascade
17. Integrate into useGameLogic with `await`
18. Add `isProcessing` ref lock
19. Add `boardRef` for authoritative state
20. **Checkpoint:** Swaps animate, matches flash out, cascades drop smoothly with bounce

### Phase 4: Input Polish
21. Drag-and-drop via react-dnd (mouse)
22. `src/hooks/useTouchGesture.ts` — swipe detection
23. `src/components/CustomDragLayer.tsx` — drag preview
24. **Checkpoint:** Game playable via click, drag, or mobile swipe

### Phase 5: Scoring & UI
25. `src/context/ScoreContext.tsx` — score state + multiplier math
26. `src/components/ScoreDisplay.tsx` — animated counter
27. `src/utils/hintFinder.ts` — brute force valid move finder
28. Hint button + 3-second highlight
29. Chain/combo UI indicators
30. **Checkpoint:** Full scoring with visual feedback

### Phase 6: AI Mode
31. `src/utils/aiPlayer.ts` — serializeBoard + getAIMove
32. `src/hooks/useAIPlayer.ts` — interval loop, speed control
33. `src/components/AIControls.tsx` — play/pause, speed, move count
34. Fallback logic: invalid AI move → hintFinder
35. **Checkpoint:** AI plays autonomously, pauses on error

### Phase 7: Ship
36. Responsive layout (mobile portrait + desktop landscape)
37. CI and server deploy (see `DEPLOY.md`)
38. README with screenshots/GIF
39. Final animation timing polish
40. Mobile testing pass

---

## CI and deployment

CI (`.github/workflows/ci.yml`) runs lint, type-check, tests with coverage thresholds, build, a short AI bench and a bundle hygiene check on every PR and push to `main`. Releases deploy to `https://voltline.mrballistic.com` (static files on Apache) from `.github/workflows/deploy.yml` when a `v*` tag on `main` is pushed:

1. bump `version` in `package.json`;
2. rename `## Unreleased` in `CHANGELOG.md` to `## <version> (date)`;
3. merge to `main`;
4. `git tag -a vX.Y.Z -m "…" && git push origin vX.Y.Z`.

The old `deploy.sh` gh-pages force-push is retired. Server layout, secrets, setup and rollback are in `DEPLOY.md`.

---

## Conventions

- Functional React components with hooks — no class components
- 2-space indentation
- PascalCase for components, camelCase for utils/hooks, UPPER_SNAKE for constants
- `use` prefix for all custom hooks
- MUI `sx` prop for styling, responsive via `xs`/`sm`/`md` breakpoints
- Commit style: concise, lowercase, imperative ("add cascade animation", "fix match dedup")
- No `console.log` in committed code