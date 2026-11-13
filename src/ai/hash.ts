import { COLORS } from '../engine';
import type { Color, GameState, Piece } from '../engine';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const SPECIALS = ['none', 'charge', 'arc'] as const;

const colorIndex = (c: Color) => COLORS.indexOf(c);

// 0 empty, 1 rock, 2 prism, 3+ a gem by color and special. Ids are deliberately left out.
function pieceCode(p: Piece | null): number {
  if (!p) return 0;
  if (p.kind === 'rock') return 1;
  if (p.kind === 'prism') return 2;
  return 3 + colorIndex(p.color) * SPECIALS.length + SPECIALS.indexOf(p.special);
}

/**
 * FNV-1a over everything the player can see: board pieces, tray, counters, level and score.
 * `rngState` and `seed` are excluded, so the AI's own randomness can never depend on the game's.
 */
export function hashVisible(state: GameState): number {
  let h = FNV_OFFSET;
  const word = (v: number) => {
    for (let shift = 0; shift < 32; shift += 8) {
      h ^= (v >>> shift) & 0xff;
      h = Math.imul(h, FNV_PRIME);
    }
  };
  for (const row of state.board) for (const p of row) word(pieceCode(p));
  word(state.tray.length);
  for (const c of state.tray) word(colorIndex(c));
  for (const c of COLORS) word(state.counters[c]);
  word(state.level);
  word(state.score >>> 0);
  word(Math.floor(state.score / 0x100000000));
  return h >>> 0;
}
