import { useEffect, useRef, useState } from 'react';
import Typography from '@mui/material/Typography';
import { DISPLAY_FONT, NEON } from '../theme';

const COUNT_MS = 400;
const format = (n: number) => Math.round(n).toLocaleString('en-US');

/** The score, counting up to each new value. Tabular digits in a reserved width: no layout shift. */
export default function ScoreDisplay({ score }: { score: number }) {
  const [shown, setShown] = useState(score);
  const from = useRef(score);
  const current = useRef(score);

  useEffect(() => {
    const start = performance.now();
    const origin = current.current;
    from.current = origin;
    if (origin === score) return;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      // Counting down (a new game) just jumps; counting up eases out.
      const v = score < origin ? score : origin + (score - origin) * (1 - (1 - t) ** 3);
      current.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  return (
    <Typography
      component="div"
      aria-label={`Score ${format(score)}`}
      sx={{
        fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: { xs: 30, sm: 38 }, lineHeight: 1.1,
        fontVariantNumeric: 'tabular-nums', minWidth: '8ch', textAlign: 'center', color: '#fff',
        textShadow: `0 0 14px ${NEON.cyan}88`,
      }}
    >
      <span aria-hidden="true">{format(shown)}</span>
    </Typography>
  );
}
