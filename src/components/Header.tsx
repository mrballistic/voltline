import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { DISPLAY_FONT, NEON } from '../theme';
import type { UiSnapshot } from '../app/controller';
import LevelBar from './LevelBar';
import ScoreDisplay from './ScoreDisplay';

export interface HeaderProps {
  ui: UiSnapshot | null;
  onMuted(m: boolean): void;
  onVolume(v: number): void;
}

/** Title, score, level bar, best score and the sound controls. Fixed rows so nothing jumps. */
export default function Header({ ui, onMuted, onVolume }: HeaderProps) {
  const muted = ui?.muted ?? false;
  const best = ui ? (ui.aiOn ? ui.best.ai : ui.best.player) : 0;
  const notice = ui?.notice;
  return (
    <Box component="header" sx={{ width: '100%', px: 2, pt: 1.5, pb: 0.5 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography component="h1" sx={{ fontFamily: DISPLAY_FONT, fontSize: 18, letterSpacing: '0.18em', color: NEON.cyan, textShadow: `0 0 12px ${NEON.cyan}88` }}>
          Voltline
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Slider
            size="small" min={0} max={1} step={0.05} value={ui?.volume ?? 0.8} disabled={muted}
            onChange={(_, v) => onVolume(v)} aria-label="Volume" sx={{ width: 64 }}
          />
          <IconButton size="small" aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted} onClick={() => onMuted(!muted)} sx={{ fontSize: 14, fontFamily: 'inherit', borderRadius: 2 }}>
            {muted ? 'Muted' : 'Sound'}
          </IconButton>
        </Stack>
      </Stack>
      <Stack spacing={0.5} sx={{ mt: 0.5, alignItems: 'center' }}>
        <ScoreDisplay score={ui?.score ?? 0} />
        <Typography sx={{ fontSize: 15, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', minHeight: 20 }}>
          {ui ? `${ui.aiOn ? 'AI best' : 'Best'} ${best.toLocaleString('en-US')}` : ''}
        </Typography>
        <LevelBar level={ui?.level ?? 1} progress={ui?.levelProgress ?? 0} />
        <Typography role="status" aria-live="polite" sx={{ minHeight: 26, fontFamily: DISPLAY_FONT, fontSize: 16, color: NEON.green, textShadow: `0 0 10px ${NEON.green}88` }}>
          {notice?.kind === 'level-up' && notice.level !== undefined ? `Level ${notice.level}!` : ''}
        </Typography>
      </Stack>
    </Box>
  );
}
