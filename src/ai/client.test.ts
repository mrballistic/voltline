import { describe, expect, it } from 'vitest';
import { applyMove, newGame, productiveMoves } from '../engine';
import type { GameState } from '../engine';
import { createAIClient } from './client';
import { rankMoves } from './search';

function midGame(seed: number, plies: number): GameState {
  let s = newGame(seed);
  for (let i = 0; i < plies && !s.over; i++) s = applyMove(s, productiveMoves(s)[0]).state;
  return s;
}

describe('createAIClient (inline)', () => {
  it('inline client ranks like rankMoves', async () => {
    const client = createAIClient({ inline: true });
    const s = newGame(7);
    expect(await client.rank(s)).toEqual(rankMoves(s));
    client.dispose();
  });

  it('concurrent ranks resolve to their own states', async () => {
    const client = createAIClient({ inline: true });
    const a = midGame(1, 3);
    const b = midGame(2, 5);
    const [ra, rb] = await Promise.all([client.rank(a), client.rank(b)]);
    expect(ra).toEqual(rankMoves(a));
    expect(rb).toEqual(rankMoves(b));
    client.dispose();
  });

  it('dispose rejects pending', async () => {
    const client = createAIClient({ inline: true });
    const pending = client.rank(newGame(3));
    client.dispose();
    await expect(pending).rejects.toThrow('disposed');
    await expect(client.rank(newGame(3))).rejects.toThrow('disposed');
  });
});
