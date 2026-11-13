// Pointer input on the Pixi stage. Click and tap only for now (Task 15 adds drag and swipe):
// a tap on a cell or a tray slot goes to the controller, which owns the selection rules.
import type { Application, FederatedPointerEvent } from 'pixi.js';
import type { Pos } from '../engine';
import type { BoardView } from './BoardView';
import type { TrayView } from './TrayView';

export interface InputHandlers {
  tapCell(p: Pos): void;
  tapSlot(slot: number): void;
  swap(a: Pos, b: Pos): void;
}

/** Listens for taps on the whole canvas; returns a function that stops listening. */
export function attachInput(app: Application, board: BoardView, tray: TrayView, h: InputHandlers): () => void {
  const stage = app.stage;
  stage.eventMode = 'static';
  // app.screen is resized in place, so the hit area always covers the canvas.
  stage.hitArea = app.screen;
  const onTap = (e: FederatedPointerEvent) => {
    const cell = board.cellAt(e.global.x, e.global.y);
    if (cell) {
      h.tapCell(cell);
      return;
    }
    const slot = tray.slotAt(e.global.x, e.global.y);
    if (slot !== null) h.tapSlot(slot);
  };
  stage.on('pointertap', onTap);
  return () => {
    stage.off('pointertap', onTap);
  };
}
