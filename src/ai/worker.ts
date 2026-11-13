import type { GameState } from '../engine';
import { rankMoves } from './search';
import type { RankedMove } from './search';

export interface RankRequest { id: number; state: GameState }
export interface RankResponse { id: number; ranked: RankedMove[] }

// Minimal worker-scope typing; the project's tsconfig does not include the WebWorker lib.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<RankRequest>) => void) | null;
  postMessage(message: RankResponse): void;
};

scope.onmessage = (e) => {
  const { id, state } = e.data;
  scope.postMessage({ id, ranked: rankMoves(state) });
};
