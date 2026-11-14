import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, applyMove, canPlace, productiveMoves } from '../engine';
import type { Step } from '../engine';
import { EFFECT_FIXTURES, fixture, fixtureFromSearch } from './devFixtures';

const firstClear = (script: Step[]) => script.find((s): s is Extract<Step, { t: 'clear' }> => s.t === 'clear')!;

describe('dev fixtures', () => {
  it('each effect fixture is one move away from its effect', () => {
    for (const name of EFFECT_FIXTURES) {
      const { state, move } = fixture(name);
      const clear = firstClear(applyMove(state, move).script);
      expect(clear.blasts[0].kind, name).toBe(name);
    }
  });

  it('the charge fixture chains three detonations', () => {
    const { state, move } = fixture('charge');
    const clear = firstClear(applyMove(state, move).script);
    expect(clear.blasts.map((b) => [b.kind, b.order])).toEqual([['charge', 0], ['charge', 1], ['charge', 2]]);
  });

  it('the tray fixture has a full tray of five colors over every kind of drop target', () => {
    const { state, move } = fixture('tray');
    expect(new Set(state.tray).size).toBe(5);
    const cells = state.board.flat();
    expect(cells.some((p) => p?.kind === 'rock')).toBe(true);
    expect(cells.some((p) => p?.kind === 'prism')).toBe(true);
    expect(cells.some((p) => p?.kind === 'gem' && p.special === 'charge')).toBe(true);
    expect(cells.some((p) => p?.kind === 'gem' && p.special === 'arc')).toBe(true);
    // Every slot has both a cell it may drop on and a plain cell of its own color it may not.
    for (let slot = 0; slot < 5; slot++) {
      const at = (row: number, col: number) => ({ row, col });
      const all = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => at(Math.floor(i / BOARD_SIZE), i % BOARD_SIZE));
      expect(all.some((p) => canPlace(state.board, state.tray, slot, p))).toBe(true);
      expect(all.some((p) => {
        const t = state.board[p.row][p.col];
        return t?.kind === 'gem' && t.special === 'none' && t.color === state.tray[slot];
      })).toBe(true);
    }
    // No drop makes a match, so the board stays still between drags; the move is a plain drop.
    expect(productiveMoves(state).filter((m) => m.type === 'place')).toEqual([]);
    expect(applyMove(state, move).script[0].t).toBe('place');
  });

  it('the held fixture stays live through plain drops and has a rock to refuse one', () => {
    const { state, move } = fixture('held');
    expect(new Set(state.tray).size).toBe(5);
    expect(state.board[0][0]?.kind).toBe('rock');
    const first = applyMove(state, move);
    expect(first.script.map((s) => s.t)).toEqual(['place']);
    expect(first.state.over).toBe(false);
    // A second plain drop (what a held drop places) still leaves the game going.
    const second = applyMove(first.state, { type: 'place', slot: 0, at: { row: 3, col: 5 } });
    expect(second.script.map((s) => s.t)).toEqual(['place']);
    expect(second.state.over).toBe(false);
  });

  it('reads ?fixture=<name> and ignores anything else', () => {
    expect(fixtureFromSearch('?fixture=supernova')).toEqual(fixture('supernova').state);
    expect(fixtureFromSearch('?seed=3&fixture=arc')).toEqual(fixture('arc').state);
    expect(fixtureFromSearch('?fixture=nope')).toBeUndefined();
    expect(fixtureFromSearch('')).toBeUndefined();
  });
});
