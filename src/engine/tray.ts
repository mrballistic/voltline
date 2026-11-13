import { TRAY_CAPACITY, TRAY_THRESHOLD } from './rules';
import type { Board, Cleared, Color, Pos, Step } from './types';
import { COLORS } from './types';

const isColor = (key: Cleared['key']): key is Color => (COLORS as readonly string[]).includes(key);

export function countClears(
  counters: Record<Color, number>,
  tray: Color[],
  cleared: Cleared[],
): { counters: Record<Color, number>; tray: Color[]; events: Step[] } {
  const nextCounters = { ...counters };
  const nextTray = [...tray];
  const events: Step[] = [];
  for (const c of cleared) {
    if (!isColor(c.key)) continue;
    const color = c.key;
    nextCounters[color] += 1;
    if (nextCounters[color] < TRAY_THRESHOLD) continue;
    nextCounters[color] -= TRAY_THRESHOLD;
    if (nextTray.length < TRAY_CAPACITY) {
      const slot = nextTray.length;
      nextTray.push(color);
      events.push({ t: 'tray-earn', color, from: c.at, slot });
      if (nextTray.length === TRAY_CAPACITY) events.push({ t: 'tray-full' });
    } else {
      events.push({ t: 'tray-lost', color, from: c.at });
    }
  }
  return { counters: nextCounters, tray: nextTray, events };
}

export function canPlace(board: Board, tray: Color[], slot: number, at: Pos): boolean {
  if (!Number.isInteger(slot) || slot < 0 || slot >= tray.length) return false;
  const target = board[at.row]?.[at.col];
  if (!target || target.kind !== 'gem' || target.special !== 'none') return false;
  return target.color !== tray[slot];
}
