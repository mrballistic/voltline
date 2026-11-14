import { useId } from 'react';
import { CHROME, NEON } from '../theme';

/**
 * The Voltline mark (public/logo-mark.svg): one trace, a V with a voltage jog, a circuit pad at
 * each tip. Decorative; the h1 beside it carries the name.
 */
export default function LogoMark({ size = 26 }: { size?: number }) {
  // A per-instance id, so two marks on one page never resolve to the same gradient.
  const gradient = `vl-mark-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg
      data-testid="logo-mark" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false"
      style={{ flex: 'none', overflow: 'visible', filter: `drop-shadow(0 0 3px ${NEON.cyan}88)` }}
    >
      <defs>
        <linearGradient id={gradient} x1="10" y1="0" x2="80" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={NEON.cyan} />
          <stop offset="1" stopColor={NEON.magenta} />
        </linearGradient>
      </defs>
      <g transform="translate(6 3)">
        <path
          d="M16 20 L44 80 L60 48 L48 48 L72 14" fill="none" stroke={`url(#${gradient})`}
          strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"
        />
        <circle cx="16" cy="20" r="7" fill={CHROME.page} stroke={NEON.cyan} strokeWidth="5" />
        <circle cx="72" cy="14" r="7" fill={CHROME.page} stroke={NEON.magenta} strokeWidth="5" />
      </g>
    </svg>
  );
}
