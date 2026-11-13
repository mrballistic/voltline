import { useEffect, useRef } from 'react';
import { createGame } from '../app/bootstrap';

/** The Pixi board. React owns only this host element; the renderer owns everything inside it. */
export default function BoardCanvas({ seed }: { seed?: number }) {
  const host = useRef<HTMLDivElement>(null);

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
      (err: unknown) => console.error('Voltline failed to start', err),
    );
    return () => {
      disposed = true;
      destroy?.();
    };
  }, [seed]);

  return <div ref={host} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} />;
}
