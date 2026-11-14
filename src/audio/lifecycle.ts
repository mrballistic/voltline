// When the audio engine may play (spec §6.4): browsers only let an AudioContext start inside a
// user gesture, and the game goes quiet while its tab is hidden.
import type { AudioEngine } from './engine';

type Lifecycle = Pick<AudioEngine, 'unlock' | 'suspend' | 'resume' | 'state'>;
type Listenable = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/**
 * Whether `e` lets audio start: a mouse press, the end of a touch or pen tap, or a key press other
 * than Escape. A touch pointerdown doesn't count, so the context is never created on one.
 */
function isGesture(e: Event): boolean {
  if (e.type === 'keydown') return (e as KeyboardEvent).key !== 'Escape';
  const mouse = (e as PointerEvent).pointerType === 'mouse';
  return e.type === 'pointerdown' ? mouse : !mouse;
}

/**
 * On every gesture anywhere on `win` while the context isn't running, calls `engine.unlock()`: the
 * first creates the context, later ones recover one that stopped (an iOS interruption). Once it
 * runs, a gesture costs one state check. Suspends while `doc` is hidden and resumes when it shows.
 * Returns a detach.
 */
export function attachAudioLifecycle(engine: Lifecycle, win: Listenable, doc: Listenable & { hidden: boolean }): () => void {
  const opts = { capture: true, passive: true } as const;
  const onGesture = (e: Event) => {
    if (engine.state !== 'running' && isGesture(e)) engine.unlock();
  };
  const onVisibility = () => {
    if (doc.hidden) engine.suspend();
    else engine.resume();
  };
  const gestures = ['pointerdown', 'pointerup', 'keydown'] as const;
  for (const type of gestures) win.addEventListener(type, onGesture, opts);
  doc.addEventListener('visibilitychange', onVisibility);

  let attached = true;
  return () => {
    if (!attached) return;
    attached = false;
    for (const type of gestures) win.removeEventListener(type, onGesture, opts);
    doc.removeEventListener('visibilitychange', onVisibility);
  };
}
