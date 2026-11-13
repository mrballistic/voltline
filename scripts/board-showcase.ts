// Dev-only showcase for visual checks (served by `npm run dev` at /scripts/board-showcase.html,
// never built). Renders the reference art's exact layout with the real render modules, so the
// two can be compared side by side; `?mode=specials` shows Charge/Arc on every color, a Prism,
// rocks, a selected piece and a partly filled tray with a selected and a hinted slot.
import 'pixi.js/unsafe-eval';
import { Application } from 'pixi.js';
import { BOARD_SIZE, COLORS } from '../src/engine';
import type { Board, Color, GemSpecial, Piece } from '../src/engine';
import { BoardView } from '../src/render/BoardView';
import { computeLayout } from '../src/render/layout';
import { buildTextures } from '../src/render/textures';
import { TrayView } from '../src/render/TrayView';

// The reference art's board (1–7 colors in symbol order, 8 rock, 9 prism).
const REFERENCE = [
  [1, 2, 3, 4, 5, 6, 7, 1], [3, 8, 1, 2, 7, 4, 5, 2], [5, 6, 4, 9, 1, 2, 3, 6], [2, 3, 5, 6, 8, 7, 1, 4],
  [7, 1, 2, 3, 4, 5, 6, 3], [4, 5, 7, 1, 2, 3, 8, 7], [6, 7, 3, 5, 6, 1, 2, 5], [1, 4, 6, 2, 3, 7, 4, 1],
];

function board(special: (r: number, c: number) => GemSpecial): Board {
  let id = 1;
  return REFERENCE.map((row, r) => row.map((v, c): Piece => {
    if (v === 8) return { id: id++, kind: 'rock' };
    if (v === 9) return { id: id++, kind: 'prism' };
    return { id: id++, kind: 'gem', color: COLORS[v - 1], special: special(r, c) };
  }));
}

async function mount() {
  const mode = new URLSearchParams(location.search).get('mode');
  const host = document.getElementById('host')!;
  const resolution = window.devicePixelRatio || 1;
  const app = new Application();
  await app.init({ resizeTo: host, antialias: true, autoDensity: true, resolution, backgroundAlpha: 0 });
  host.appendChild(app.canvas);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layout = computeLayout(app.screen.width, app.screen.height);
  const tex = buildTextures(app.renderer, layout.cellPx, resolution);
  const bv = new BoardView(tex, reduced);
  const tv = new TrayView(tex, reduced);
  app.stage.addChild(bv.root, tv.root);
  bv.setLayout(layout, tex);
  tv.setLayout(layout, tex);
  if (mode === 'specials') {
    const b = board((r, c) => (r < 2 ? 'charge' : r < 4 ? 'arc' : (r + c) % 5 === 0 ? 'charge' : 'none'));
    bv.setBoard(b);
    bv.sprite(b[5][3]!.id)!.setSelected(true);
    const tray: Color[] = ['red', 'cyan', 'green'];
    tv.setTray(tray);
    tv.setSelected(1);
    tv.setHinted([0, 2]);
  } else {
    bv.setBoard(board(() => 'none'));
  }
  document.body.dataset.ready = String(BOARD_SIZE);
}

void mount();
