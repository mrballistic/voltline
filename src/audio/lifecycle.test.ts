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

type State = AudioContextState | 'none' | 'interrupted';

function setup() {
  const calls: string[] = [];
  // unlock creates a running context, as a real one does inside a gesture.
  const engine = {
    state: 'none' as State,
    unlock() { calls.push('unlock'); this.state = 'running'; },
    suspend() { calls.push('suspend'); this.state = 'suspended'; },
    resume() { calls.push('resume'); this.state = 'running'; },
  };
  const win = new CountingTarget();
  const doc = Object.assign(new CountingTarget(), { hidden: false });
  const detach = attachAudioLifecycle(engine as Parameters<typeof attachAudioLifecycle>[0], win, doc);
  const fire = (t: EventTarget, type: string, extra: Record<string, unknown> = {}) =>
    t.dispatchEvent(Object.assign(new Event(type), extra));
  return { calls, engine, win, doc, detach, fire };
}

describe('attachAudioLifecycle', () => {
  it('no context before the first gesture; a mouse press creates it', () => {
    const { calls, engine, win, fire } = setup();
    expect(engine.state).toBe('none');
    fire(win, 'pointermove', { pointerType: 'mouse' });
    expect(calls).toEqual([]);
    fire(win, 'pointerdown', { pointerType: 'mouse' });
    expect(calls).toEqual(['unlock']);
    fire(win, 'pointerup', { pointerType: 'mouse' });
    fire(win, 'pointerdown', { pointerType: 'mouse' });
    expect(calls).toEqual(['unlock']); // running: later gestures do nothing
  });

  it('a touch pointerdown does not create the context; its pointerup does', () => {
    const { calls, win, fire } = setup();
    fire(win, 'pointerdown', { pointerType: 'touch' });
    expect(calls).toEqual([]);
    fire(win, 'pointerup', { pointerType: 'touch' });
    expect(calls).toEqual(['unlock']);
    fire(win, 'pointerdown', { pointerType: 'pen' });
    fire(win, 'pointerup', { pointerType: 'pen' });
    expect(calls).toEqual(['unlock']);
  });

  it('a key press unlocks (Escape is not a gesture)', () => {
    const { calls, win, fire } = setup();
    fire(win, 'keydown', { key: 'Escape' });
    expect(calls).toEqual([]);
    fire(win, 'keydown', { key: 'a' });
    expect(calls).toEqual(['unlock']);
  });

  it('a later gesture resumes a context that stopped running (iOS interruption)', () => {
    const { calls, engine, win, fire } = setup();
    fire(win, 'keydown', { key: 'Enter' });
    engine.state = 'interrupted';
    fire(win, 'pointerup', { pointerType: 'touch' });
    expect(calls).toEqual(['unlock', 'unlock']);
    expect(engine.state).toBe('running');
  });

  it('suspends while the tab is hidden and resumes on return', () => {
    const { calls, doc, fire } = setup();
    doc.hidden = true;
    fire(doc, 'visibilitychange');
    doc.hidden = false;
    fire(doc, 'visibilitychange');
    expect(calls).toEqual(['suspend', 'resume']);
  });

  it('detach removes every listener, gesture and visibility alike', () => {
    const { calls, win, doc, detach, fire } = setup();
    expect(win.live).toBeGreaterThan(0);
    expect(doc.live).toBe(1);
    detach();
    detach(); // twice is harmless
    expect(win.live).toBe(0);
    expect(doc.live).toBe(0);
    fire(win, 'pointerdown', { pointerType: 'mouse' });
    doc.hidden = true;
    fire(doc, 'visibilitychange');
    expect(calls).toEqual([]);
  });
});
