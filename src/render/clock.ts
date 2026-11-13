// One clock for the board (spec §6.1): Pixi's ticker drives GSAP, so every tween is updated in the
// same frame, from the same delta, just before Pixi renders it. GSAP's own requestAnimationFrame
// loop is unhooked while any board is mounted and put back when the last one goes.
//
// The clock advances by the ticker's `deltaMS`, which Pixi caps (minFPS), so a hitch or a
// backgrounded tab slows the animation for a frame instead of jumping a cascade to its end.
import { UPDATE_PRIORITY, type Ticker } from 'pixi.js';
import { gsap } from 'gsap';

const drivers: Ticker[] = [];
let clock = 0;

/** Makes `ticker` the GSAP clock until the returned function is called. */
export function driveGsapFrom(ticker: Ticker): () => void {
  if (drivers.length === 0) {
    gsap.ticker.remove(gsap.updateRoot);
    clock = gsap.globalTimeline.time();
  }
  drivers.push(ticker);
  // Only the newest board drives, so two mounted at once (StrictMode) never double the speed.
  const step = () => {
    if (drivers[drivers.length - 1] !== ticker) return;
    clock += ticker.deltaMS / 1000;
    gsap.updateRoot(clock);
  };
  ticker.add(step, undefined, UPDATE_PRIORITY.HIGH);
  let attached = true;
  return () => {
    if (!attached) return;
    attached = false;
    ticker.remove(step);
    drivers.splice(drivers.indexOf(ticker), 1);
    if (drivers.length === 0) gsap.ticker.add(gsap.updateRoot);
  };
}
