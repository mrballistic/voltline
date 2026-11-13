import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { DISPLAY_FONT, NEON } from '../theme';

/** `Level {n}` and a neon bar for the progress toward the next level (0 to 1). */
export default function LevelBar({ level, progress }: { level: number; progress: number }) {
  return (
    <Box sx={{ width: '100%', maxWidth: 360 }}>
      <Typography sx={{ fontFamily: DISPLAY_FONT, fontSize: 14, letterSpacing: '0.12em', textAlign: 'center', mb: 0.75 }}>
        Level {level}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={Math.round(progress * 100)}
        aria-label={`Level ${level} progress`}
        sx={{
          height: 8, borderRadius: 4, bgcolor: 'rgba(120,140,255,.16)',
          '& .MuiLinearProgress-bar': {
            borderRadius: 4, background: `linear-gradient(90deg, ${NEON.cyan}, ${NEON.magenta})`,
            boxShadow: `0 0 10px ${NEON.magenta}aa`,
          },
        }}
      />
    </Box>
  );
}
