// Where the board and the tray strip go inside the canvas. Pure, so every container size
// (portrait phone, landscape desktop, tiny window, mid-cascade resize) is unit-testable.
import { BOARD_SIZE, TRAY_CAPACITY } from '../engine';

/** Largest cell, in CSS px: past this the pieces stop reading as a board and start reading as icons. */
export const MAX_CELL_PX = 72;
/** Space kept clear around everything, in CSS px. */
const MARGIN_PX = 12;
/** Gap between the board and the tray strip, in cells. */
const TRAY_GAP_CELLS = 0.3;
/** Tray slot size and strip padding, in cells. */
const SLOT_CELLS = 0.9;
const TRAY_PAD_CELLS = 0.15;

function trayDims(cellPx: number) {
  const slotPx = Math.max(1, Math.round(cellPx * SLOT_CELLS));
  const pad = Math.round(cellPx * TRAY_PAD_CELLS);
  return { slotPx, h: slotPx + 2 * pad, gap: Math.round(cellPx * TRAY_GAP_CELLS) };
}

/**
 * Lays the board out centered in a `width`×`height` container with the tray strip directly
 * under it. `cellPx` is the largest integer (≤ `MAX_CELL_PX`) for which board, gap and tray fit
 * inside the margins; coordinates are integers in container CSS px.
 */
export function computeLayout(width: number, height: number) {
  const availW = Math.max(0, width - 2 * MARGIN_PX);
  const availH = Math.max(0, height - 2 * MARGIN_PX);
  const totalH = (c: number) => {
    const t = trayDims(c);
    return c * BOARD_SIZE + t.gap + t.h;
  };

  // Start from the continuous estimate and step down until the rounded tray fits too.
  const perCellH = BOARD_SIZE + TRAY_GAP_CELLS + SLOT_CELLS + 2 * TRAY_PAD_CELLS;
  let cellPx = Math.min(MAX_CELL_PX, Math.floor(availW / BOARD_SIZE), Math.floor(availH / perCellH) + 1);
  while (cellPx > 1 && totalH(cellPx) > availH) cellPx--;
  cellPx = Math.max(1, cellPx);

  const size = cellPx * BOARD_SIZE;
  const t = trayDims(cellPx);
  const x = Math.max(0, Math.floor((width - size) / 2));
  const y = Math.max(0, Math.floor((height - totalH(cellPx)) / 2));

  return {
    cellPx,
    board: { x, y, size },
    tray: { x, y: y + size + t.gap, w: size, h: t.h, slotPx: t.slotPx },
    portrait: height > width,
  };
}

export type Layout = ReturnType<typeof computeLayout>;

/** Center of tray slot `slot` in container px: the `TRAY_CAPACITY` slots are spread evenly, centered. */
export function traySlotCenter(l: Layout, slot: number): { x: number; y: number } {
  const step = l.tray.w / TRAY_CAPACITY;
  return { x: l.tray.x + step * (slot + 0.5), y: l.tray.y + l.tray.h / 2 };
}

/**
 * The four corner brackets around the board-plus-tray stack: `size`×`size` px, `offset` px
 * outside it, `width` px stroke, `radius` px corner. They fit inside `MARGIN_PX`.
 */
export const FRAME_GEOMETRY = { size: 16, offset: 8, radius: 4, width: 2 } as const;

/** A bracket: its outer corner (x, y) and the directions (±1) its two arms run from it. */
export interface FrameCorner { x: number; y: number; dx: 1 | -1; dy: 1 | -1 }

/** Corner brackets for `l`, top-left, top-right, bottom-left, bottom-right, in container px. */
export function frameCorners(l: Layout): FrameCorner[] {
  const o = FRAME_GEOMETRY.offset;
  const left = l.board.x - o;
  const right = l.board.x + l.board.size + o;
  const top = l.board.y - o;
  const bottom = l.tray.y + l.tray.h + o;
  return [
    { x: left, y: top, dx: 1, dy: 1 },
    { x: right, y: top, dx: -1, dy: 1 },
    { x: left, y: bottom, dx: 1, dy: -1 },
    { x: right, y: bottom, dx: -1, dy: -1 },
  ];
}
