import type { GameState } from '../engine';
import { rankMoves } from './search';
import type { RankedMove } from './search';
import type { RankResponse } from './worker';

export interface AIClient {
  rank(state: GameState): Promise<RankedMove[]>;
  dispose(): void;
}

interface Pending {
  resolve: (ranked: RankedMove[]) => void;
  reject: (err: Error) => void;
}

export function createAIClient(opts: { inline?: boolean } = {}): AIClient {
  const useWorker = typeof Worker !== 'undefined' && !opts.inline;
  const worker = useWorker
    ? new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    : null;
  const pending = new Map<number, Pending>();
  let nextId = 0;
  let disposed = false;

  worker?.addEventListener('message', (e: MessageEvent<RankResponse>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    p.resolve(e.data.ranked);
  });
  worker?.addEventListener('error', (e) => {
    const err = new Error(e.message || 'worker error');
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  });

  return {
    rank(state) {
      if (disposed) return Promise.reject(new Error('disposed'));
      const id = nextId++;
      return new Promise<RankedMove[]>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        if (worker) {
          worker.postMessage({ id, state });
        } else {
          // Inline: compute in a microtask so dispose() right after rank() still rejects.
          void Promise.resolve().then(() => {
            const p = pending.get(id);
            if (!p) return;
            pending.delete(id);
            try {
              p.resolve(rankMoves(state));
            } catch (err) {
              p.reject(err instanceof Error ? err : new Error(String(err)));
            }
          });
        }
      });
    },
    dispose() {
      disposed = true;
      worker?.terminate();
      const err = new Error('disposed');
      for (const p of pending.values()) p.reject(err);
      pending.clear();
    },
  };
}
