// Dev-only handle on `window.__voltline` for the Playwright feel check (scripts/feel-check.ts).
// Loaded only under `import.meta.env.DEV`, so it is never in a production bundle.
import { UPDATE_PRIORITY, type Application } from 'pixi.js';
import { gsap } from 'gsap';
import { applyMove, productiveMoves } from '../engine';
import type { Move, Step } from '../engine';
import type { BoardView } from '../render/BoardView';
import type { TrayView } from '../render/TrayView';
import type { GameController } from './controller';

/** One sprite as drawn in one frame, in canvas CSS px (position less pivot, so a dragged piece shows its offset). */
export interface SpriteSample { id: number; x: number; y: number; sx: number; sy: number; alpha: number; visible: boolean }
export interface FrameSample { t: number; sprites: SpriteSample[] }

export interface DebugHandle {
  controller: GameController;
  /** Board origin and cell size in canvas CSS px. */
  geometry(): { boardX: number; boardY: number; cellPx: number };
  /** A productive move from the current state whose script cascades (2+ fall rounds with refills). */
  cascadeMove(minRounds?: number): { move: Move; script: Step[] } | null;
  /** Starts sampling every sprite after each rendered frame; `stop` returns the samples. */
  record(): void;
  stop(): FrameSample[];
  /** Global GSAP time scale, for slow-motion frame captures. */
  timeScale(k: number): void;
  /** Starts timing each frame's work (tweens, effects and render, on the main thread). */
  profile(): void;
  /** Stops profiling; returns each frame's work in ms. */
  stopProfile(): number[];
}

export function installDebugHandle(deps: { app: Application; board: BoardView; tray: TrayView; controller: GameController }): () => void {
  const { app, board, controller } = deps;
  let frames: FrameSample[] | null = null;
  const sample = () => {
    frames?.push({
      t: performance.now(),
      sprites: board.allSprites().map((s) => ({
        id: s.id, x: s.x - s.pivot.x, y: s.y - s.pivot.y, sx: s.scale.x, sy: s.scale.y, alpha: s.alpha, visible: s.visible,
      })),
    });
  };
  // After the render, so a sample is exactly what that frame drew.
  app.ticker.add(sample, undefined, UPDATE_PRIORITY.UTILITY);

  // Frame work: from before anything else on the ticker (GSAP runs at HIGH) to after the render.
  let work: number[] | null = null;
  let tickStart = 0;
  const workStart = () => { tickStart = performance.now(); };
  const workEnd = () => { work?.push(performance.now() - tickStart); };
  app.ticker.add(workStart, undefined, UPDATE_PRIORITY.INTERACTION + 1);
  app.ticker.add(workEnd, undefined, UPDATE_PRIORITY.UTILITY);

  const handle: DebugHandle = {
    controller,
    geometry() {
      const o = board.cellXY(0, 0);
      const cellPx = board.cellPx;
      return { boardX: o.x - cellPx / 2, boardY: o.y - cellPx / 2, cellPx };
    },
    cascadeMove(minRounds = 2) {
      const state = controller.state;
      let best: { move: Move; script: Step[]; rounds: number } | null = null;
      for (const move of productiveMoves(state)) {
        if (move.type !== 'swap') continue;
        const { script } = applyMove(state, move);
        const rounds = script.filter((s) => s.t === 'fall' && s.spawns.length > 0).length;
        if (rounds >= minRounds && (!best || rounds > best.rounds)) best = { move, script, rounds };
      }
      return best && { move: best.move, script: best.script };
    },
    record() {
      frames = [];
    },
    stop() {
      const out = frames ?? [];
      frames = null;
      return out;
    },
    timeScale(k) {
      gsap.globalTimeline.timeScale(k);
    },
    profile() {
      work = [];
    },
    stopProfile() {
      const out = work ?? [];
      work = null;
      return out;
    },
  };
  (window as unknown as { __voltline?: DebugHandle }).__voltline = handle;
  return () => {
    app.ticker.remove(sample);
    app.ticker.remove(workStart);
    app.ticker.remove(workEnd);
    delete (window as unknown as { __voltline?: DebugHandle }).__voltline;
  };
}
