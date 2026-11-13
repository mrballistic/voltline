import { describe, expect, it } from 'vitest';
import { dragOffset, gestureToMove } from './input';

const CELL = 60;
const start = { x: 100, y: 100 };
const at = (dx: number, dy: number) => ({ x: start.x + dx, y: start.y + dy });
const mid = { row: 3, col: 3 };

describe('gestureToMove', () => {
  it('right drag past threshold returns right neighbour', () => {
    expect(gestureToMove(start, at(0.31 * CELL, 0), CELL, mid)).toEqual({ row: 3, col: 4 });
  });
  it('short drag is tap (null)', () => {
    expect(gestureToMove(start, at(0.3 * CELL, 0), CELL, mid)).toBeNull();
    expect(gestureToMove(start, at(2, -3), CELL, mid)).toBeNull();
  });
  it('diagonal resolves to dominant axis', () => {
    expect(gestureToMove(start, at(0.4 * CELL, -0.7 * CELL), CELL, mid)).toEqual({ row: 2, col: 3 });
    expect(gestureToMove(start, at(-0.8 * CELL, 0.5 * CELL), CELL, mid)).toEqual({ row: 3, col: 2 });
  });
  it('drag off board edge returns null', () => {
    expect(gestureToMove(start, at(-CELL, 0), CELL, { row: 3, col: 0 })).toBeNull();
    expect(gestureToMove(start, at(0, CELL), CELL, { row: 7, col: 3 })).toBeNull();
  });
});

describe('dragOffset', () => {
  it('follows the dominant axis and caps at half a cell', () => {
    expect(dragOffset(start, at(10, 3), CELL, mid)).toEqual({ x: 10, y: 0 });
    expect(dragOffset(start, at(0, -200), CELL, mid)).toEqual({ x: 0, y: -0.5 * CELL });
  });
  it('does not move the piece toward a board edge', () => {
    expect(dragOffset(start, at(-20, 0), CELL, { row: 3, col: 0 })).toEqual({ x: 0, y: 0 });
  });
});
