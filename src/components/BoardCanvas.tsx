import { useEffect, type CSSProperties, type RefObject } from 'react';
import { FRAME_GEOMETRY, computeLayout } from '../render/layout';
import { NEON } from '../theme';

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
      {failed && <GraphicsFailed />}
    </div>
  );
}

const FAILED_INK = '#c8d0ff';

/** The renderer's corner brackets, in CSS, for when Pixi isn't running to draw them. */
function Brackets() {
  const { size, offset, radius, width } = FRAME_GEOMETRY;
  const edge = `${width}px solid ${NEON.cyan}80`;
  const corners: CSSProperties[] = [
    { left: -offset, top: -offset, borderLeft: edge, borderTop: edge, borderTopLeftRadius: radius },
    { right: -offset, top: -offset, borderRight: edge, borderTop: edge, borderTopRightRadius: radius },
    { left: -offset, bottom: -offset, borderLeft: edge, borderBottom: edge, borderBottomLeftRadius: radius },
    { right: -offset, bottom: -offset, borderRight: edge, borderBottom: edge, borderBottomRightRadius: radius },
  ];
  return corners.map((c, i) => (
    <div key={i} aria-hidden="true" style={{ position: 'absolute', width: size, height: size, boxSizing: 'border-box', ...c }} />
  ));
}

/** A chip outline with a pin missing on the left and a yellow bolt: the graphics didn't start. */
function BrokenChipIcon() {
  return (
    <svg
      data-testid="graphics-failed-icon" width="72" height="72" viewBox="0 0 72 72" aria-hidden="true" focusable="false"
      fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}
    >
      <rect x="20" y="20" width="32" height="32" rx="5" stroke={FAILED_INK} strokeWidth="2.5" strokeDasharray="5 4" />
      <path d="M28 20v-8M36 20v-8M44 20v-8M28 52v8M36 52v8M44 52v8M52 28h8M52 36h8M52 44h8" stroke={FAILED_INK} strokeWidth="2.5" />
      <path d="M20 28h-5M20 44h-8" stroke={FAILED_INK} strokeWidth="2.5" />
      <path d="M11 36h3" stroke={FAILED_INK} strokeWidth="2.5" opacity="0.5" />
      <path d="M38.5 26l-7 11h6.5l-4 9" stroke={NEON.yellow} strokeWidth="2.5" style={{ filter: `drop-shadow(0 0 4px ${NEON.yellow}99)` }} />
    </svg>
  );
}

/** A panel with the board-plus-tray footprint (`--vl-board-px` × `--vl-stack-px`), centered in the host. */
function GraphicsFailed() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
      <div
        role="alert"
        style={{
          position: 'relative', boxSizing: 'border-box',
          width: `var(${BOARD_PX_VAR}, 100%)`, height: `var(${STACK_PX_VAR}, 100%)`, maxWidth: '100%', maxHeight: '100%',
          borderRadius: 10, background: 'rgba(0,0,0,0.4)', boxShadow: 'inset 0 0 0 1px rgba(200,208,255,0.22)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32,
          textAlign: 'center',
        }}
      >
        <Brackets />
        <BrokenChipIcon />
        <p style={{ margin: 0, maxWidth: 280, color: FAILED_INK, font: '500 18px/26px Rajdhani, system-ui, sans-serif' }}>
          {GRAPHICS_FAILED}
        </p>
      </div>
    </div>
  );
}
