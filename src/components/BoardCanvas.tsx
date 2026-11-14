import type { RefObject } from 'react';

/** Shown in the canvas area when the renderer can't start (no WebGL, a blocked GPU, …). */
export const GRAPHICS_FAILED = 'Voltline couldn’t start the graphics. Try another browser.';

/**
 * The Pixi board's host element. React owns only this element; the renderer owns everything
 * inside it and sizes itself from the host (see render/layout.ts), so the host just fills its slot.
 */
export default function BoardCanvas({ host, failed }: { host: RefObject<HTMLDivElement | null>; failed: boolean }) {
  return (
    <div ref={host} style={{ position: 'relative', flex: '1 1 0', minHeight: 0, width: '100%', overflow: 'hidden' }}>
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
