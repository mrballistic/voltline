# Voltline

A neon match-three puzzle game with explosive special pieces, chain reactions, a collectable tray, and an AI that plays like a strong human. Swap pieces, line up three or more, and watch the board light up.

**Play it:** https://voltline.mrballistic.com

![Voltline in a desktop browser: the title, score and level bar above a glowing neon board of circles, squares, triangles, hexagons, diamonds, plus signs and stars, the tray below, and Hint and New game buttons](docs/screenshots/app-desktop.webp)

Voltline is an original game. It has its own pieces, its own look and its own sounds; it borrows only the genre’s mechanics.

## How to play

The board is 8×8. Swap two neighboring pieces; if the swap lines up three or more of the same color in a row or column, they clear. Pieces above the gap fall, new ones drop in, and any new matches clear too. Each link in that chain scores more than the last.

![A cascade in four frames: three stars pop, the gap opens, every column falls together with new pieces entering from above, and the board settles](docs/screenshots/cascade-sequence.webp)

A swap that makes no match slides back, so you can’t waste a move on one.

### The pieces

Seven colors, each with its own shape so the game is playable without relying on color: red circle, blue rounded square, yellow triangle, green hexagon, magenta diamond, orange plus and cyan star.

### Special pieces

Bigger matches leave something behind.

| Make this | Get this | What it does |
|---|---|---|
| 4 in a line | **Charge** | Clears the 3×3 area around it |
| An L or T shape | **Arc** | Clears its whole row and column |
| 5 in a line | **Prism** | Swap it with any piece to clear every piece of that color |

![Special pieces on the board: Charges with a bright inner ring, Arcs with crackling edges, a rainbow Prism, gray rocks, and three pieces waiting in the tray](docs/screenshots/pieces-specials.webp)

<p><img src="docs/screenshots/effect-prism.webp" alt="A Prism firing: lightning bolts fork from the Prism to every cyan star on the board" width="48%"> <img src="docs/screenshots/effect-supernova.webp" alt="Two Prisms swapped together: bolts, shockwave rings and a white flash across the whole board" width="48%"></p>

Specials chain. An explosion that catches another special sets it off, so one good match can clear half the board. Two Prisms swapped together clear everything. A Prism swapped with a Charge or Arc turns every piece of that color into one and detonates the lot.

### The tray

Every 10 pieces of one color you clear, by any means, earns a spare piece of that color in your tray. The tray holds five. To spend one, tap it, then tap a plain piece on the board: the tray piece takes its place, and if that makes a match it resolves like any swap. Placing costs a move, and you may place without making a match, though that piece is gone for good. Earn a piece while the tray is full and it is lost, so spend one.

### Rocks

From level 10, burnt-out gray rocks start appearing among the new pieces. They fall and swap like anything else, but they only clear when you match three of them or an explosion reaches them. A Prism can’t be swapped with a rock. The deeper you go, the more often they show up.

### Levels and game over

A progress bar fills as you score. Fill it to level up: the board is replaced with a fresh one, the target rises, and your tray carries over.

The game ends when no move on the board can make a match, and that includes tray placements. That’s the tray’s promise: the tray can save you, as long as a spare piece can still make a match when nothing else can.

## Modes

- **Player.** You play. Your best score is saved on this device.
- **Hint.** Press Hint and Voltline shows every good move it found as an arrow, each labeled with roughly what it’s worth (“≈ 1,240”). Swaps point from one piece to its neighbor; tray placements run from the tray to the cell. Over about a second the weaker arrows fade out, lowest first, until only the best is left, pulsing. It stays for a few seconds, or until you move.
- **AI mode.** Flip the AI switch and Voltline plays for you, showing the same arrows before each move. Pick Slow, Medium or Fast; the counter shows how many moves the AI has made. It pauses when you switch tabs and picks up where it left off. Switch it off to take over. A game the AI moved in counts toward the AI best, not yours.

<p><img src="docs/screenshots/hint-reveal.webp" alt="Hint: arrows on every good swap, each labeled with an estimated value such as “≈ 2,216”" width="48%"> <img src="docs/screenshots/ai-mode-running.webp" alt="AI mode on Slow: the AI switch on, its arrows on the board, and an AI moves counter" width="48%"></p>

The AI is a search, not a chatbot. It looks at exactly what you can see (the board, the tray and the level), tries each move many times over with randomly dropped-in new pieces, and picks the one that does best on average. It never peeks at what the game will drop next, and it needs no network or API key.

## Controls

Click or tap a piece, then a neighbor, to swap. Or just drag (or swipe) a piece toward a neighbor: the swap happens as soon as you pull past a third of a cell. Tap a tray piece, then a board piece, to place it, or drag it straight onto the board. A drag that goes nowhere eases back.

Your best score is saved on this device, separately for you and for AI mode. Sound can be muted or turned down from the header.

<img src="docs/screenshots/app-phone.webp" alt="Voltline on a phone: the same board filling the width, with the score above and the buttons below" width="260">

## Credits and license

Sound effects come from other creators under their own licenses; see [CREDITS.md](./CREDITS.md). Voltline itself is MIT licensed; see [LICENSE](./LICENSE).

For developers, see [ARCHITECTURE.md](./ARCHITECTURE.md).
