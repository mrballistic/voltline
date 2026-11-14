// Dev-only boards for checking effects and input by eye and in Playwright: `?fixture=<name>`
// starts the game on one of these. Each effect fixture is a single swap away from its effect;
// `tray` starts with a full tray for drag checks (scripts/input-check.ts). Loaded only under
// `import.meta.env.DEV` (see bootstrap.ts), so none of it reaches a production bundle.
import type { Color, GameState, Move } from '../engine';
import { boardWith, makeState } from '../engine/testing';

export const EFFECT_FIXTURES = ['charge', 'arc', 'prism', 'supernova'] as const;
export const FIXTURE_NAMES = [...EFFECT_FIXTURES, 'tray'] as const;
export type FixtureName = typeof FIXTURE_NAMES[number];

export interface Fixture { state: GameState; move: Move }

const swap = (a: [number, number], b: [number, number]): Move =>
  ({ type: 'swap', a: { row: a[0], col: a[1] }, b: { row: b[0], col: b[1] } });

// Overlays on the no-match DEAD_ROWS board (engine/testing.ts).
const FIXTURES: Record<FixtureName, { cells: Record<string, string>; move: Move; tray?: Color[] }> = {
  // Swapping the red down completes R-R-R through a Charge, whose 3×3 sets off two more Charges.
  charge: { cells: { '4,2': 'Rc', '4,3': 'R', '3,4': 'R', '5,1': 'Yc', '6,0': 'Mc' }, move: swap([3, 4], [4, 4]) },
  // The same line through an Arc: it fires row 4 and column 2.
  arc: { cells: { '4,2': 'Ra', '4,3': 'R', '3,4': 'R' }, move: swap([3, 4], [4, 4]) },
  // A Prism swapped with a cyan gem clears every cyan.
  prism: { cells: { '3,3': 'P' }, move: swap([3, 3], [3, 4]) },
  // Two Prisms swapped together clear the whole board.
  supernova: { cells: { '3,3': 'P', '3,4': 'P' }, move: swap([3, 3], [3, 4]) },
  // A full tray of five colors over every kind of drop target: plain cells of each color,
  // specials that keep their cell's color (Charge, Arc), a Prism, and rocks in a corner and
  // mid-board. Overlays only keep or remove colors, so no placement makes a match and the
  // board stays still between drags. The move drops red on a plain yellow.
  tray: {
    cells: { '2,4': 'Gc', '5,1': 'Ya', '6,6': 'P', '0,0': 'X', '3,3': 'X' },
    move: { type: 'place', slot: 0, at: { row: 4, col: 4 } },
    tray: ['red', 'blue', 'yellow', 'green', 'magenta'],
  },
};

export function fixture(name: FixtureName): Fixture {
  const f = FIXTURES[name];
  return { state: makeState(boardWith(f.cells), f.tray ? { tray: [...f.tray] } : {}), move: f.move };
}

/** The starting state named by `?fixture=<name>` in a location search string, if any. */
export function fixtureFromSearch(search: string): GameState | undefined {
  const name = new URLSearchParams(search).get('fixture');
  return (FIXTURE_NAMES as readonly string[]).includes(name ?? '') ? fixture(name as FixtureName).state : undefined;
}
