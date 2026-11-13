import { describe, expect, it } from 'vitest';
import { applyMove } from '../engine';
import type { Step } from '../engine';
import { FIXTURE_NAMES, fixture, fixtureFromSearch } from './devFixtures';

const firstClear = (script: Step[]) => script.find((s): s is Extract<Step, { t: 'clear' }> => s.t === 'clear')!;

describe('dev fixtures', () => {
  it('each fixture is one move away from its effect', () => {
    for (const name of FIXTURE_NAMES) {
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

  it('reads ?fixture=<name> and ignores anything else', () => {
    expect(fixtureFromSearch('?fixture=supernova')).toEqual(fixture('supernova').state);
    expect(fixtureFromSearch('?seed=3&fixture=arc')).toEqual(fixture('arc').state);
    expect(fixtureFromSearch('?fixture=nope')).toBeUndefined();
    expect(fixtureFromSearch('')).toBeUndefined();
  });
});
