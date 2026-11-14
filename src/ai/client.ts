import type { GameState } from '../engine';
import { rankMoves } from './search';
import type { RankedMove } from './search';
import type { RankResponse } from './worker';

export interface AIClient {
  rank(state: GameState): Promise<RankedMove[]>;
  dispose(): void;
}

/** The subset of `Worker` the client uses; lets tests inject a fake. */
export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  addEventListener(type: 'message', listener: (e: MessageEvent<RankResponse>) => void): void;
  addEventListener(type: 'error' | 'messageerror', listener: (e: Event) => void): void;
}

export interface AIClientOptions {
  inline?: boolean;
  workerFactory?: () => WorkerLike;
}

interface Pending {
  resolve: (ranked: RankedMove[]) => void;
  reject: (err: Error) => void;
}

const defaultWorkerFactory = (): WorkerLike =>
  new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

export function createAIClient(opts: AIClientOptions = {}): AIClient {
  const pending = new Map<number, Pending>();
  let nextId = 0;
  let disposed = false;
  let worker: WorkerLike | null = null;

  // Any worker failure rejects what is in flight, then this client runs inline for good.
  const failWorker = (err: Error) => {
    worker?.terminate();
    worker = null;
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };

  const factory = opts.workerFactory ?? (typeof Worker !== 'undefined' ? defaultWorkerFactory : null);
  if (factory && !opts.inline) {
    try {
      const w = factory();
      w.addEventListener('message', (e) => {
        const p = pending.get(e.data.id);
        if (!p) return;
        pending.delete(e.data.id);
        p.resolve(e.data.ranked);
      });
      w.addEventListener('error', (e) => {
        failWorker(new Error((e as ErrorEvent).message || 'worker error'));
      });
      w.addEventListener('messageerror', () => failWorker(new Error('worker messageerror')));
      worker = w;
    } catch {
      worker = null;
    }
  }

  const rankInline = (id: number, state: GameState) => {
    // Computed in a microtask so dispose() right after rank() still rejects.
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
  };

  return {
    rank(state) {
      if (disposed) return Promise.reject(new Error('disposed'));
      const id = nextId++;
      return new Promise<RankedMove[]>((resolve, reject) => {
        const mine = { resolve, reject };
        pending.set(id, mine);
        if (worker) {
          try {
            worker.postMessage({ id, state });
          } catch (err) {
            // Unclonable state or dead worker: fail the others, serve this call inline.
            pending.delete(id);
            failWorker(err instanceof Error ? err : new Error(String(err)));
            pending.set(id, mine);
            rankInline(id, state);
          }
        } else {
          rankInline(id, state);
        }
      });
    },
    dispose() {
      disposed = true;
      worker?.terminate();
      worker = null;
      const err = new Error('disposed');
      for (const p of pending.values()) p.reject(err);
      pending.clear();
    },
  };
}
