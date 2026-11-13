// Creates the Pixi app inside `host` and shows a fresh game. First version (Task 12): a static
// board and tray with breathing halos; Task 13 adds the player, controller and input.
// Pixi's eval-free shader/uniform path, needed under the strict CSP (no 'unsafe-eval') that
// production and the desktop app serve. Must load before the Application is created.
import 'pixi.js/unsafe-eval';
import { Application } from 'pixi.js';
import { newGame } from '../engine';
import { BoardView } from '../render/BoardView';
import { computeLayout } from '../render/layout';
import { buildTextures, type PieceTextures } from '../render/textures';
import { TrayView } from '../render/TrayView';

export interface GameHandle {
  destroy(): void;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export async function createGame(host: HTMLElement, opts: { seed?: number } = {}): Promise<GameHandle> {
  const resolution = window.devicePixelRatio || 1;
  const app = new Application();
  await app.init({ resizeTo: host, antialias: true, autoDensity: true, resolution, backgroundAlpha: 0 });
  app.canvas.style.display = 'block';
  host.appendChild(app.canvas);

  const reducedMotion = prefersReducedMotion();
  let layout = computeLayout(app.screen.width, app.screen.height);
  let tex: PieceTextures = buildTextures(app.renderer, layout.cellPx, resolution);
  const board = new BoardView(tex, reducedMotion);
  const tray = new TrayView(tex, reducedMotion);
  app.stage.addChild(board.root, tray.root);
  board.setLayout(layout, tex);
  tray.setLayout(layout, tex);

  const state = newGame(opts.seed ?? Math.floor(Math.random() * 2 ** 32));
  board.setBoard(state.board);
  tray.setTray(state.tray);

  // Textures are drawn for one cell size, so a new size means new textures.
  const relayout = () => {
    layout = computeLayout(app.screen.width, app.screen.height);
    const old = tex;
    if (layout.cellPx !== old.cellPx) tex = buildTextures(app.renderer, layout.cellPx, resolution);
    board.setLayout(layout, tex);
    tray.setLayout(layout, tex);
    if (tex !== old) old.destroy();
  };
  app.renderer.on('resize', relayout);
  // `resizeTo` only listens for window resizes; the host can also change size on its own.
  const observer = new ResizeObserver(() => app.queueResize());
  observer.observe(host);

  return {
    destroy() {
      observer.disconnect();
      app.renderer.off('resize', relayout);
      board.destroy();
      tray.destroy();
      tex.destroy();
      app.destroy(true, { children: true });
    },
  };
}
