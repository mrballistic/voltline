import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import SvgIcon from '@mui/material/SvgIcon';
import { DISPLAY_FONT, NEON } from '../theme';
import type { UiSnapshot } from '../app/controller';
import LevelBar from './LevelBar';
import LogoMark from './LogoMark';
import ScoreDisplay from './ScoreDisplay';

export interface HeaderProps {
  ui: UiSnapshot | null;
  onMuted(m: boolean): void;
}

/** Title, score, level bar, best score and the mute button. Fixed rows so nothing jumps. */
export default function Header({ ui, onMuted }: HeaderProps) {
  const muted = ui?.muted ?? false;
  const best = ui ? (ui.aiOn ? ui.best.ai : ui.best.player) : 0;
  const notice = ui?.notice;
  return (
    <Box component="header" sx={{ width: '100%', px: 2, pt: 1.5, pb: 0.5 }}>
      <Stack direction="row" sx={{ height: 44, alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          <LogoMark />
          <Typography component="h1" sx={{ fontFamily: DISPLAY_FONT, fontSize: 18, letterSpacing: '0.18em', color: NEON.cyan, textShadow: `0 0 12px ${NEON.cyan}88` }}>
            {/* The V's diagonal opens the V–o pair under uniform tracking; pull just that pair in. */}
            <Box component="span" sx={{ mr: WORDMARK_VO_KERN }}>V</Box>oltline
          </Typography>
        </Stack>
        {/* The only sound control (the volume slider was dropped). The name stays “Mute”; aria-pressed carries the state. */}
        <IconButton aria-label="Mute" aria-pressed={muted} onClick={() => onMuted(!muted)} sx={{ color: muted ? 'text.secondary' : NEON.cyan }}>
          <SpeakerIcon muted={muted} />
        </IconButton>
      </Stack>
      <Stack spacing={0.5} sx={{ mt: 0.5, alignItems: 'center' }}>
        <ScoreDisplay score={ui?.score ?? 0} />
        <Typography sx={{ fontSize: 15, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', height: 20, lineHeight: '20px' }}>
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

/** Extra kerning between the wordmark's V and o, on top of its 0.18em tracking. */
export const WORDMARK_VO_KERN = '-0.12em';

/** Speaker with sound waves; muted shows a cross instead, so the state is visible at a glance. */
function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <SvgIcon data-testid="speaker-icon" data-muted={muted}>
      <path d="M3 9v6h4l5 5V4L7 9H3z" />
      {muted
        ? <path d="M16.3 8.9l1.4-1.4 2.3 2.3 2.3-2.3 1.4 1.4-2.3 2.3 2.3 2.3-1.4 1.4-2.3-2.3-2.3 2.3-1.4-1.4 2.3-2.3z" transform="translate(-3 1)" />
        : <path d="M14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02S15.48 8.7 14 7.97zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />}
    </SvgIcon>
  );
}
