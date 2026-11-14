import { describe, expect, it } from 'vitest';
import { PREFS_KEY, createPrefsStore } from './storage';

const DEFAULTS = { bestPlayer: 0, bestAI: 0, aiSpeed: 'medium', muted: false };

function memory(initial?: string): Storage {
  const m = new Map<string, string>(initial === undefined ? [] : [[PREFS_KEY, initial]]);
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
  } as Storage;
}

describe('createPrefsStore', () => {
  it('storage survives throwing and corrupt localStorage', () => {
    const throwing = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
    } as unknown as Storage;
    const s = createPrefsStore(throwing);
    expect(s.load()).toEqual(DEFAULTS);
    expect(() => s.save({ ...DEFAULTS, aiSpeed: 'medium' })).toThrow('quota');
    expect(createPrefsStore(memory('{bad')).load()).toEqual(DEFAULTS);
    expect(createPrefsStore(memory('42')).load()).toEqual(DEFAULTS);
    expect(createPrefsStore(null).load()).toEqual(DEFAULTS);
  });

  it('defaults invalid fields and keeps valid ones', () => {
    const raw = JSON.stringify({ bestPlayer: 900, bestAI: -3, aiSpeed: 'warp', muted: 'yes' });
    expect(createPrefsStore(memory(raw)).load()).toEqual({ ...DEFAULTS, bestPlayer: 900 });
  });

  it('prefs round-trip', () => {
    const store = memory();
    const prefs = { bestPlayer: 1200, bestAI: 800, aiSpeed: 'fast' as const, muted: true };
    createPrefsStore(store).save(prefs);
    expect(createPrefsStore(store).load()).toEqual(prefs);
  });

  it('prefs saved before the volume slider was dropped still load, and their volume is ignored', () => {
    const store = memory(JSON.stringify({ bestPlayer: 700, bestAI: 50, aiSpeed: 'slow', muted: false, volume: 0.1 }));
    const loaded = createPrefsStore(store).load();
    expect(loaded).toEqual({ bestPlayer: 700, bestAI: 50, aiSpeed: 'slow', muted: false });
    expect(loaded).not.toHaveProperty('volume');
    // The next save drops the old key.
    createPrefsStore(store).save(loaded);
    expect(JSON.parse(store.getItem(PREFS_KEY)!)).not.toHaveProperty('volume');
  });
});
