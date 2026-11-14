import { describe, expect, it } from 'vitest';
import { attachAudioLifecycle } from './lifecycle';

/** An EventTarget that counts its live listeners. */
class CountingTarget extends EventTarget {
  live = 0;
  override addEventListener(...args: Parameters<EventTarget['addEventListener']>): void {
    this.live++;
    super.addEventListener(...args);
  }
  override removeEventListener(...args: Parameters<EventTarget['removeEventListener']>): void {
    this.live--;
    super.removeEventListener(...args);
  }
}

function setup() {
  const calls: string[] = [];
  const engine = { unlock: () => calls.push('unlock'), suspend: () => calls.push('suspend'), resume: () => calls.push('resume') };
  const win = new CountingTarget();
  const doc = Object.assign(new CountingTarget(), { hidden: false });
  const detach = attachAudioLifecycle(engine, win, doc);
  const fire = (t: EventTarget, type: string) => t.dispatchEvent(new Event(type));
  return { calls, win, doc, detach, fire };
}

describe('attachAudioLifecycle', () => {
  it('unlocks on the first tap and removes its unlock listeners after it', () => {
    const { calls, win, fire } = setup();
    expect(calls).toEqual([]);
    fire(win, 'pointerdown');
    expect(calls).toEqual(['unlock']);
    // Touch only grants audio permission when the tap ends, so the pointerup unlocks again, then stops.
    fire(win, 'pointerup');
    expect(calls).toEqual(['unlock', 'unlock']);
    expect(win.live).toBe(0);
    fire(win, 'pointerdown');
    fire(win, 'pointerup');
    fire(win, 'keydown');
    expect(calls).toEqual(['unlock', 'unlock']);
  });

  it('a first key press unlocks and removes the listeners too', () => {
    const { calls, win, fire } = setup();
    fire(win, 'keydown');
    fire(win, 'pointerdown');
    expect(calls).toEqual(['unlock']);
    expect(win.live).toBe(0);
  });

  it('suspends while the tab is hidden and resumes on return', () => {
    const { calls, doc, fire } = setup();
    doc.hidden = true;
    fire(doc, 'visibilitychange');
    doc.hidden = false;
    fire(doc, 'visibilitychange');
    expect(calls).toEqual(['suspend', 'resume']);
  });

  it('detach removes every listener, unlock and visibility alike', () => {
    const { calls, win, doc, detach, fire } = setup();
    expect(win.live).toBeGreaterThan(0);
    expect(doc.live).toBe(1);
    detach();
    detach(); // twice is harmless
    expect(win.live).toBe(0);
    expect(doc.live).toBe(0);
    fire(win, 'pointerdown');
    doc.hidden = true;
    fire(doc, 'visibilitychange');
    expect(calls).toEqual([]);
  });
});
