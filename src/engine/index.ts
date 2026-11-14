// Public engine API. Everything here is pure and DOM-free: it runs on the main thread and in the AI worker.
export type * from './types';
export { BOARD_SIZE, COLORS } from './types';
export * from './rules';
export { applyMove, newGame } from './resolve';
export { allowedMoves, countProductiveMoves, isAdjacent, isGameOver, productiveMoves } from './moves';
export { findMatches, matchKeyOf } from './matches';
export { canPlace } from './tray';
export { cloneBoard } from './board';
