import { describe, expect, it } from 'vitest';
import { boardToString, boardWith, DEAD_ROWS, makeState, parseBoard } from './testing';
import { findMatches } from './matches';

describe('testing helpers', () => {
  it('parseBoard reads specials', () => {
    const b = parseBoard('Rc Ba X P\n. . . .');
    expect(b[0][0]).toEqual({ id: 1, kind: 'gem', color: 'red', special: 'charge' });
    expect(b[0][1]).toEqual({ id: 2, kind: 'gem', color: 'blue', special: 'arc' });
    expect(b[0][2]).toEqual({ id: 3, kind: 'rock' });
    expect(b[0][3]).toEqual({ id: 4, kind: 'prism' });
    expect(b[1]).toEqual([null, null, null, null]);
  });

  it('boardToString round-trips', () => {
    const src = 'Rc Ba X P\n. G M O\nC Y . B';
    expect(boardToString(parseBoard(src))).toBe(src);
  });

  it('makeState applies defaults and overrides', () => {
    const s = makeState(parseBoard('R B\nY G'), { score: 50 });
    expect(s.nextId).toBe(5);
    expect(s.score).toBe(50);
    expect(s.levelTarget).toBe(1000);
    expect(s.counters.cyan).toBe(0);
  });

  it('DEAD_ROWS has no matches and boardWith overlays tokens', () => {
    expect(DEAD_ROWS[0]).toBe('R B Y G M O C R');
    expect(findMatches(boardWith())).toEqual([]);
    const b = boardWith({ '7,0': 'Rc', '3,4': 'P' });
    expect(b[7][0]).toMatchObject({ kind: 'gem', color: 'red', special: 'charge' });
    expect(b[3][4]).toMatchObject({ kind: 'prism' });
  });
});
