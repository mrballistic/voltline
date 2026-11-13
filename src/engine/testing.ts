import { COLORS } from './types';
import type { Board, Color, GameState, Piece } from './types';
import { levelTarget } from './rules';

const LETTER_TO_COLOR: Record<string, Color> = {
  R: 'red', B: 'blue', Y: 'yellow', G: 'green', M: 'magenta', O: 'orange', C: 'cyan',
};
const COLOR_TO_LETTER = Object.fromEntries(
  Object.entries(LETTER_TO_COLOR).map(([l, c]) => [c, l]),
) as Record<Color, string>;

export function parseBoard(src: string): Board {
  let id = 1;
  return src
    .trim()
    .split('\n')
    .map((line) =>
      line.trim().split(/\s+/).map((tok): Piece | null => {
        if (tok === '.') return null;
        if (tok === 'X') return { id: id++, kind: 'rock' };
        if (tok === 'P') return { id: id++, kind: 'prism' };
        const color = LETTER_TO_COLOR[tok[0]];
        const suffix = tok.slice(1);
        if (!color || (suffix !== '' && suffix !== 'c' && suffix !== 'a')) {
          throw new Error(`bad board token: ${tok}`);
        }
        const special = suffix === 'c' ? 'charge' : suffix === 'a' ? 'arc' : 'none';
        return { id: id++, kind: 'gem', color, special };
      }),
    );
}

export function boardToString(b: Board): string {
  return b
    .map((row) =>
      row
        .map((p) => {
          if (!p) return '.';
          if (p.kind === 'rock') return 'X';
          if (p.kind === 'prism') return 'P';
          return COLOR_TO_LETTER[p.color] + (p.special === 'charge' ? 'c' : p.special === 'arc' ? 'a' : '');
        })
        .join(' '),
    )
    .join('\n');
}

export function makeState(board: Board, over: Partial<GameState> = {}): GameState {
  let maxId = 0;
  for (const row of board) for (const p of row) if (p && p.id > maxId) maxId = p.id;
  const counters = Object.fromEntries(COLORS.map((c) => [c, 0])) as Record<Color, number>;
  return {
    board, level: 1, score: 0, levelStartScore: 0, levelTarget: levelTarget(1),
    tray: [], counters, moves: 0, nextId: maxId + 1, rngState: 1, seed: 1, over: false,
    ...over,
  };
}
