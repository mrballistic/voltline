// localStorage-backed prefs: one JSON object under one key. Reading never throws (corrupt or
// unavailable storage yields defaults); saving throws so the controller can report it.
import type { AISpeed, Prefs, PrefsStore } from './ports';

export const PREFS_KEY = 'voltline.prefs.v1';

const DEFAULTS: Prefs = { bestPlayer: 0, bestAI: 0, aiSpeed: 'medium', muted: false };
const SPEEDS: readonly AISpeed[] = ['slow', 'medium', 'fast'];

const isScore = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Keeps each valid known field and defaults the rest; anything that isn't an object gives all defaults. */
function parse(raw: string | null): Prefs {
  if (raw === null) return { ...DEFAULTS };
  try {
    const o: unknown = JSON.parse(raw);
    if (typeof o !== 'object' || o === null) return { ...DEFAULTS };
    const r = o as Record<string, unknown>;
    return {
      bestPlayer: isScore(r.bestPlayer) ? r.bestPlayer : DEFAULTS.bestPlayer,
      bestAI: isScore(r.bestAI) ? r.bestAI : DEFAULTS.bestAI,
      aiSpeed: SPEEDS.includes(r.aiSpeed as AISpeed) ? (r.aiSpeed as AISpeed) : DEFAULTS.aiSpeed,
      muted: typeof r.muted === 'boolean' ? r.muted : DEFAULTS.muted,
      // Unknown keys (such as `volume`, saved before the slider was dropped) are ignored.
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // access itself can throw (blocked cookies)
  }
}

export function createPrefsStore(store: Storage | null = defaultStorage()): PrefsStore {
  return {
    load() {
      try {
        return parse(store ? store.getItem(PREFS_KEY) : null);
      } catch {
        return { ...DEFAULTS };
      }
    },
    save(p) {
      if (!store) throw new Error('Storage is unavailable');
      store.setItem(PREFS_KEY, JSON.stringify(p));
    },
  };
}
