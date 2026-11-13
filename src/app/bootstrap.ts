// Creates the Pixi app inside `host` and wires a playable game: board and tray views, the script
// player, the controller and tap input, on one clock (Pixi's ticker drives GSAP).
// Pixi's eval-free shader/uniform path, needed under the strict CSP (no 'unsafe-eval') that
// production and the desktop app serve. Must load before the Application is created.
import 'pixi.js/unsafe-eval';
import { Application } from 'pixi.js';
import { createAIClient } from '../ai/client';
import { silentCues } from '../audio/cues';
import { BoardView } from '../render/BoardView';
import { driveGsapFrom } from '../render/clock';
import { attachInput } from '../render/input';
import { computeLayout } from '../render/layout';
import { ScriptPlayer } from '../render/player';
import { buildTextures, type PieceTextures } from '../render/textures';
import { TrayView } from '../render/TrayView';
import { GameController, type UiSnapshot } from './controller';
import { noopEffects, type HintViewLike } from './ports';
import { createPrefsStore } from './storage';

export interface GameHandle {
  controller: GameController;
  destroy(): void;
}

/** createGame could not get a WebGL/WebGPU renderer; BoardCanvas shows a short message instead. */
export class GraphicsUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Voltline could not start the graphics', { cause });
    this.name = 'GraphicsUnavailableError';
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Stand-in until the hint layer lands (Task 17).
const noHint: HintViewLike = { show: () => Promise.resolve(), clear() {} };

export async function createGame(
  host: HTMLElement,
  opts: { seed?: number; onChange?: (s: UiSnapshot) => void } = {},
): Promise<GameHandle> {
  const resolution = window.devicePixelRatio || 1;
  const app = new Application();
  try {
    await app.init({ resizeTo: host, antialias: true, autoDensity: true, resolution, backgroundAlpha: 0 });
  } catch (err) {
    // A half-made Application may hold a canvas or a context; it may also fail to destroy.
    try {
      app.destroy(true);
    } catch {
      // nothing more to release
    }
    throw new GraphicsUnavailableError(err);
  }
  app.canvas.style.display = 'block';
  host.appendChild(app.canvas);
  const stopClock = driveGsapFrom(app.ticker);

  const reducedMotion = prefersReducedMotion();
  let layout = computeLayout(app.screen.width, app.screen.height);
  let tex: PieceTextures = buildTextures(app.renderer, layout.cellPx, resolution);
  const board = new BoardView(tex, reducedMotion);
  const tray = new TrayView(tex, reducedMotion);
  app.stage.addChild(board.root, tray.root);
  board.setLayout(layout, tex);
  tray.setLayout(layout, tex);

  // The selection is drawn on the sprite (ring and halo pulse), never by a timeline.
  let selectedId: number | null = null;
  let selectedSlot: number | null = null;
  const showSelection = (s: UiSnapshot) => {
    const id = s.selected ? (controller.state.board[s.selected.row][s.selected.col]?.id ?? null) : null;
    if (id !== selectedId) {
      if (selectedId !== null) board.sprite(selectedId)?.setSelected(false);
      if (id !== null) board.sprite(id)?.setSelected(true);
      selectedId = id;
    }
    if (s.selectedSlot !== selectedSlot) {
      selectedSlot = s.selectedSlot;
      tray.setSelected(selectedSlot);
    }
  };

  const player = new ScriptPlayer({
    board, tray, effects: noopEffects, audio: silentCues, reducedMotion,
    onAction: (a) => controller.onAction(a),
  });
  const controller: GameController = new GameController({
    player,
    ai: createAIClient(),
    hint: noHint,
    prefs: createPrefsStore(),
    seed: opts.seed,
    doc: document,
    onChange: (s) => {
      showSelection(s);
      opts.onChange?.(s);
    },
  });
  const stopInput = attachInput(app, board, tray, {
    tapCell: (p) => controller.tapCell(p),
    tapSlot: (slot) => controller.tapSlot(slot),
    swap: (a, b) => controller.swap(a, b),
  });

  // Textures are drawn for one cell size, so a new size means new textures. The views keep every
  // sprite in place relative to the board; the controller re-snaps to the model once idle.
  const relayout = () => {
    layout = computeLayout(app.screen.width, app.screen.height);
    const old = tex;
    if (layout.cellPx !== old.cellPx) tex = buildTextures(app.renderer, layout.cellPx, resolution);
    board.setLayout(layout, tex);
    tray.setLayout(layout, tex);
    if (tex !== old) old.destroy();
    controller.relayout();
  };
  app.renderer.on('resize', relayout);
  // `resizeTo` only listens for window resizes; the host can also change size on its own.
  const observer = new ResizeObserver(() => app.queueResize());
  observer.observe(host);

  let destroyed = false;
  let removeDebug: (() => void) | null = null;
  if (import.meta.env.DEV) {
    void import('./debug').then((m) => {
      if (!destroyed) removeDebug = m.installDebugHandle({ app, board, tray, controller });
    });
  }

  void controller.start();

  return {
    controller,
    destroy() {
      destroyed = true;
      removeDebug?.();
      stopInput();
      controller.dispose();
      player.dispose();
      observer.disconnect();
      app.renderer.off('resize', relayout);
      stopClock();
      board.destroy();
      tray.destroy();
      tex.destroy();
      app.destroy(true, { children: true });
    },
  };
}
