import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { BODY_FONT, NEON } from '../theme';
import { MOTION, usePrefersReducedMotion } from './motion';

const visuallyHidden = {
  position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
} as const;
const format = (n: number) => Math.round(n).toLocaleString('en-US');
const GLOW = `0 0 14px ${NEON.cyan}88`;
const FLARE = `0 0 22px ${NEON.cyan}cc`;

/**
 * The score, counting up to each new value and flaring briefly on each increase. Tabular digits in
 * a reserved width: no layout shift. With reduced motion the value is set at once and never flares.
 */
export default function ScoreDisplay({ score }: { score: number }) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(score);
  /** The value the count is at (what a new count starts from). */
  const current = useRef(score);
  /** The value last put in `shown`; with reduced motion `shown` is skipped and can fall behind. */
  const drawn = useRef(score);
  const digits = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced) {
      current.current = score;
      return;
    }
    const origin = current.current;
    if (origin === score && drawn.current === score) return;
    const el = digits.current;
    if (score > origin && typeof el?.animate === 'function') {
      const total = MOTION.flareUpMs + MOTION.flareDownMs;
      el.animate(
        [{ textShadow: GLOW, easing: MOTION.easeOutExpo }, { textShadow: FLARE, offset: MOTION.flareUpMs / total, easing: MOTION.easeOutExpo }, { textShadow: GLOW }],
        { duration: total },
      );
    }
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / MOTION.countMs);
      // Counting down (a new game) just jumps; counting up eases out.
      const v = score < origin ? score : origin + (score - origin) * (1 - (1 - t) ** 3);
      current.current = v;
      drawn.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score, reduced]);

  return (
    <Typography
      ref={digits}
      component="div"
      sx={{
        // Rajdhani, not Orbitron: Orbitron's slashed zero reads as a null sign.
        fontFamily: BODY_FONT, fontWeight: 700, fontSize: { xs: 36, sm: 46 }, lineHeight: 1.1,
        fontVariantNumeric: 'tabular-nums', minWidth: '8ch', textAlign: 'center', color: '#fff',
        textShadow: GLOW,
      }}
    >
      <span aria-hidden="true">{format(reduced ? score : shown)}</span>
      {/* The final value only, so a screen reader doesn't hear every count-up frame. */}
      <Box component="span" sx={visuallyHidden}>{`Score ${format(score)}`}</Box>
    </Typography>
  );
}
