import { useEffect, useRef, useState } from 'react';
import { createGame } from '../app/bootstrap';

/** Shown in the canvas area when the renderer can't start (no WebGL, a blocked GPU, …). */
export const GRAPHICS_FAILED = 'Voltline couldn’t start the graphics. Try another browser.';

/** The Pixi board. React owns only this host element; the renderer owns everything inside it. */
export default function BoardCanvas({ seed }: { seed?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let destroy: (() => void) | null = null;
    // init is async: if we unmount first, tear the game down as soon as it exists.
    createGame(el, { seed }).then(
      (game) => {
        if (disposed) game.destroy();
        else destroy = () => game.destroy();
      },
      (err: unknown) => {
        console.error('Voltline failed to start', err);
        if (!disposed) setFailed(true);
      },
    );
    return () => {
      disposed = true;
      destroy?.();
    };
  }, [seed]);

  return (
    <div ref={host} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {failed && (
        <p
          role="alert"
          style={{
            position: 'absolute', inset: 0, margin: 0, display: 'grid', placeItems: 'center', padding: 24,
            color: '#c8d0ff', font: '500 18px Rajdhani, system-ui, sans-serif', textAlign: 'center',
          }}
        >
          {GRAPHICS_FAILED}
        </p>
      )}
    </div>
  );
}
