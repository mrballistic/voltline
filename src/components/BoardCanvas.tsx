import { useEffect, type RefObject } from 'react';
import { computeLayout } from '../render/layout';

/** Shown in the canvas area when the renderer can't start (no WebGL, a blocked GPU, …). */
export const GRAPHICS_FAILED = 'Voltline couldn’t start the graphics. Try another browser.';

/** CSS variables BoardCanvas sets on the app column: the board's width and the board-plus-tray height. */
export const BOARD_PX_VAR = '--vl-board-px';
export const STACK_PX_VAR = '--vl-stack-px';

/**
 * Publishes the board's footprint on the host's parent (the app column) as CSS variables, so
 * chrome below the canvas (the AI dock) can line up with the board. The renderer sizes from the
 * same host with the same pure `computeLayout`, so the two always agree.
 */
function usePublishBoardSize(host: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = host.current;
    const column = el?.parentElement;
    if (!el || !column) return;
    const publish = () => {
      // clientWidth/Height, as Pixi's `resizeTo` reads them.
      const l = computeLayout(el.clientWidth, el.clientHeight);
      column.style.setProperty(BOARD_PX_VAR, `${l.board.size}px`);
      column.style.setProperty(STACK_PX_VAR, `${l.tray.y + l.tray.h - l.board.y}px`);
    };
    publish();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, [host]);
}

/**
 * The Pixi board's host element. React owns only this element; the renderer owns everything
 * inside it and sizes itself from the host (see render/layout.ts), so the host just fills its slot.
 */
export default function BoardCanvas({ host, failed }: { host: RefObject<HTMLDivElement | null>; failed: boolean }) {
  usePublishBoardSize(host);
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
