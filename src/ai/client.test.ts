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

type Listener = (e: never) => void;

function fakeWorker() {
  const listeners: Record<string, Listener[]> = {};
  const posted: { id: number; state: GameState }[] = [];
  const w = {
    terminated: false,
    posted,
    postMessage: (m: unknown) => { posted.push(m as { id: number; state: GameState }); },
    terminate() { w.terminated = true; },
    addEventListener: (type: string, l: Listener) => { (listeners[type] ??= []).push(l); },
    emit: (type: string, ev: unknown) => { for (const l of listeners[type] ?? []) (l as (e: unknown) => void)(ev); },
  };
  return w;
}

describe('createAIClient (worker)', () => {
  it('matches worker replies by id', async () => {
    const w = fakeWorker();
    const client = createAIClient({ workerFactory: () => w });
    const a = client.rank(newGame(1));
    const b = client.rank(newGame(2));
    expect(w.posted.map((p) => p.id)).toEqual([0, 1]);
    const rb = rankMoves(w.posted[1].state);
    w.emit('message', { data: { id: 1, ranked: rb } });
    expect(await b).toEqual(rb);
    const ra = rankMoves(w.posted[0].state);
    w.emit('message', { data: { id: 0, ranked: ra } });
    expect(await a).toEqual(ra);
  });

  it.each(['error', 'messageerror'])('%s rejects pending then falls back inline', async (type) => {
    const w = fakeWorker();
    const client = createAIClient({ workerFactory: () => w });
    const pending = client.rank(newGame(1));
    w.emit(type, { message: 'boom' });
    await expect(pending).rejects.toThrow();
    expect(w.terminated).toBe(true);
    const s = newGame(4);
    expect(await client.rank(s)).toEqual(rankMoves(s));
    expect(w.posted).toHaveLength(1);
  });

  it('falls back inline when the worker constructor throws', async () => {
    const client = createAIClient({ workerFactory: () => { throw new Error('no worker'); } });
    const s = newGame(5);
    expect(await client.rank(s)).toEqual(rankMoves(s));
  });

  it('dispose terminates the worker and rejects pending', async () => {
    const w = fakeWorker();
    const client = createAIClient({ workerFactory: () => w });
    const pending = client.rank(newGame(1));
    client.dispose();
    expect(w.terminated).toBe(true);
    await expect(pending).rejects.toThrow('disposed');
  });
});
