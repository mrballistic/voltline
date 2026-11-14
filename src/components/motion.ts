// Chrome motion: timings and the reduced-motion preference for the React UI. The renderer's
// timings live in src/render/constants.ts; these are the chrome's own (chrome spec, “Motion”).
import { useSyncExternalStore } from 'react';

export const MOTION = {
  /** Score count-up. */
  countMs: 400,
  /** Score flare: up, then back. */
  flareUpMs: 120,
  flareDownMs: 400,
  /** Fades: tray notice, AI dock contents, Thinking…. */
  fadeMs: 150,
  /** Thinking… waits this long, so a quick ranking never shows it. */
  thinkingDelayMs: 120,
  /** Ease-out for the flare. */
  easeOutExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const;

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
/** For `sx`: styles that apply only with reduced motion. */
export const REDUCED_MOTION_MEDIA = `@media ${REDUCED_MOTION_QUERY}`;

const query = () => (typeof matchMedia === 'function' ? matchMedia(REDUCED_MOTION_QUERY) : null);

function subscribe(onChange: () => void) {
  const q = query();
  q?.addEventListener?.('change', onChange);
  return () => q?.removeEventListener?.('change', onChange);
}

/** True while the player asks for reduced motion; follows changes to the setting live. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => query()?.matches ?? false, () => false);
}
