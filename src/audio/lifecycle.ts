// When the audio engine may play (spec §6.4): browsers keep an AudioContext suspended until a
// user gesture, and the game goes quiet while its tab is hidden.
import type { AudioEngine } from './engine';

type Lifecycle = Pick<AudioEngine, 'unlock' | 'suspend' | 'resume'>;
type Listenable = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/**
 * Unlocks `engine` on the first pointerdown or keydown anywhere on `win`, then stops listening.
 * A touch only counts as a user gesture once it ends, so the first pointerup unlocks again before
 * the listeners go. Suspends while `doc` is hidden and resumes when it shows. Returns a detach.
 */
export function attachAudioLifecycle(engine: Lifecycle, win: Listenable, doc: Listenable & { hidden: boolean }): () => void {
  const opts = { capture: true, passive: true } as const;
  let unlockAttached = true;
  const detachUnlock = () => {
    if (!unlockAttached) return;
    unlockAttached = false;
    win.removeEventListener('pointerdown', onDown, opts);
    win.removeEventListener('pointerup', onEnd, opts);
    win.removeEventListener('keydown', onEnd, opts);
  };
  const onDown = () => engine.unlock();
  const onEnd = () => {
    engine.unlock();
    detachUnlock();
  };
  const onVisibility = () => {
    if (doc.hidden) engine.suspend();
    else engine.resume();
  };
  win.addEventListener('pointerdown', onDown, opts);
  win.addEventListener('pointerup', onEnd, opts);
  win.addEventListener('keydown', onEnd, opts);
  doc.addEventListener('visibilitychange', onVisibility);

  let attached = true;
  return () => {
    if (!attached) return;
    attached = false;
    detachUnlock();
    doc.removeEventListener('visibilitychange', onVisibility);
  };
}
