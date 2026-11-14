import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import { NEON } from '../theme';
import { MOTION, REDUCED_MOTION_MEDIA, usePrefersReducedMotion } from './motion';

export const TRAY_FULL = 'Tray full—spend one to free a slot.';

const fadeIn = keyframes`from { opacity: 0; } to { opacity: 1; }`;

/**
 * Persistent while the tray is full. The slot is always rendered (and its height reserved) so the
 * live region announces and nothing shifts. The text fades in and out (instant with reduced motion).
 */
export default function TrayNotice({ trayFull }: { trayFull: boolean }) {
  const reduced = usePrefersReducedMotion();
  // Keep the text through its fade-out, then clear it (React's “adjust state on prop change” pattern).
  const [prev, setPrev] = useState(trayFull);
  const [leaving, setLeaving] = useState(false);
  if (prev !== trayFull) {
    setPrev(trayFull);
    setLeaving(!trayFull && !reduced);
  }
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(false), MOTION.fadeMs);
    return () => clearTimeout(t);
  }, [leaving]);

  return (
    <Typography
      role="status"
      aria-live="polite"
      sx={{ minHeight: 24, textAlign: 'center', fontSize: 16, color: NEON.yellow, textShadow: `0 0 10px ${NEON.yellow}88` }}
    >
      {(trayFull || leaving) && (
        <Box
          component="span"
          sx={{
            opacity: trayFull ? 1 : 0,
            animation: `${fadeIn} ${MOTION.fadeMs}ms ease`,
            transition: `opacity ${MOTION.fadeMs}ms ease`,
            [REDUCED_MOTION_MEDIA]: { animation: 'none', transition: 'none' },
          }}
        >
          {TRAY_FULL}
        </Box>
      )}
    </Typography>
  );
}
