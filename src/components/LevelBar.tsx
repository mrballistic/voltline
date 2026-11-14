import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { DISPLAY_FONT, NEON } from '../theme';

const BAR_MS = 300;

/** `Level {n}` and, on the same 20 px row, a neon bar for the progress toward the next level (0 to 1). */
export default function LevelBar({ level, progress }: { level: number; progress: number }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ width: '100%', maxWidth: 360, height: 20, alignItems: 'center' }}>
      <Typography sx={{ flex: 'none', minWidth: 84, whiteSpace: 'nowrap', fontFamily: DISPLAY_FONT, fontSize: 14, letterSpacing: '0.12em' }}>
        Level {level}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={Math.round(progress * 100)}
        aria-label={`Level ${level} progress`}
        sx={{
          flex: '1 1 auto', height: 8, borderRadius: 4, bgcolor: 'rgba(120,140,255,.16)',
          '& .MuiLinearProgress-bar': {
            borderRadius: 4, background: `linear-gradient(90deg, ${NEON.cyan}, ${NEON.magenta})`,
            boxShadow: `0 0 10px ${NEON.magenta}aa`,
            transition: `transform ${BAR_MS}ms ease-out`,
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          },
        }}
      />
    </Stack>
  );
}
