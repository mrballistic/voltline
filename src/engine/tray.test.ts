import { describe, expect, it } from 'vitest';
import { canPlace, countClears } from './tray';
import { parseBoard, makeState } from './testing';
import type { Cleared, Color } from './types';

const clears = (color: Cleared['key'], n: number): Cleared[] =>
  Array.from({ length: n }, (_, i) => ({ id: i, at: { row: 0, col: i % 8 }, cause: 'match' as const, key: color }));

const zero = () => makeState([]).counters;

describe('countClears', () => {
  it('tenth red clear earns a red tray piece', () => {
    const r = countClears(zero(), [], clears('red', 10));
    expect(r.tray).toEqual(['red']);
    expect(r.counters.red).toBe(0);
    expect(r.events).toEqual([{ t: 'tray-earn', color: 'red', from: { row: 0, col: 1 }, slot: 0 }]);
  });
  it('counter carries remainder', () => {
    const r = countClears(zero(), [], clears('red', 12));
    expect(r.counters.red).toBe(2);
    expect(r.events.filter((e) => e.t === 'tray-earn')).toHaveLength(1);
  });
  it('does not mutate inputs', () => {
    const counters = zero();
    const tray: Color[] = [];
    countClears(counters, tray, clears('red', 10));
    expect(counters.red).toBe(0);
    expect(tray).toEqual([]);
  });
  it('filling the tray emits tray-full once', () => {
    const r = countClears(zero(), ['red', 'red', 'red', 'red'], clears('blue', 10));
    expect(r.tray).toHaveLength(5);
    expect(r.events.map((e) => e.t)).toEqual(['tray-earn', 'tray-full']);
  });
  it('earn while full is lost and tray unchanged', () => {
    const full: Color[] = ['red', 'red', 'red', 'red', 'red'];
    const r = countClears(zero(), full, clears('blue', 10));
    expect(r.tray).toEqual(full);
    expect(r.events).toEqual([{ t: 'tray-lost', color: 'blue', from: { row: 0, col: 1 } }]);
  });
  it('rocks and prisms do not count', () => {
    const r = countClears(zero(), [], [...clears('rock', 12), ...clears('prism', 12)]);
    expect(r.counters).toEqual(zero());
    expect(r.events).toEqual([]);
  });
});

describe('canPlace', () => {
  const board = parseBoard(`
    R Bc X P
    B R . .
  `);
  const tray: Color[] = ['red'];
  it('accepts a plain gem of another color', () => {
    expect(canPlace(board, tray, 0, { row: 1, col: 0 })).toBe(true);
  });
  it('rejects rock, special, prism, same color, bad slot', () => {
    expect(canPlace(board, tray, 0, { row: 0, col: 2 })).toBe(false);
    expect(canPlace(board, tray, 0, { row: 0, col: 1 })).toBe(false);
    expect(canPlace(board, tray, 0, { row: 0, col: 3 })).toBe(false);
    expect(canPlace(board, tray, 0, { row: 0, col: 0 })).toBe(false);
    expect(canPlace(board, tray, 1, { row: 1, col: 0 })).toBe(false);
    expect(canPlace(board, tray, -1, { row: 1, col: 0 })).toBe(false);
  });
  it('rejects empty and out-of-range cells', () => {
    expect(canPlace(board, tray, 0, { row: 1, col: 2 })).toBe(false);
    expect(canPlace(board, tray, 0, { row: 9, col: 0 })).toBe(false);
  });
});
