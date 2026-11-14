import { BLAST_PIECE_BASE, CHAIN_MULT, MATCH_BASE, comboMult } from './rules';
import type { MatchGroup } from './types';

export function scoreRound(
  groups: MatchGroup[],
  blastOnlyPieces: number,
  chain: number,
): { points: number; combo: number } {
  const base = groups.reduce((sum, g) => sum + MATCH_BASE[g.shape], 0) + blastOnlyPieces * BLAST_PIECE_BASE;
  const combo = comboMult(groups.length);
  const points = Math.round(base * CHAIN_MULT[Math.min(chain, CHAIN_MULT.length - 1)] * combo);
  return { points, combo };
}
