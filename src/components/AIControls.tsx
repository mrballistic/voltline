import Box from '@mui/material/Box';
import Fade from '@mui/material/Fade';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import type { AISpeed } from '../app/ports';
import { CHROME, NEON } from '../theme';
import { MOTION, REDUCED_MOTION_MEDIA, usePrefersReducedMotion } from './motion';

const SPEEDS: { value: AISpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'medium', label: 'Medium' },
  { value: 'fast', label: 'Fast' },
];

/** The dock's fixed height: toggling AI mode never resizes the board. */
export const AI_DOCK_PX = 52;

export interface AIControlsProps {
  on: boolean;
  speed: AISpeed;
  moves: number;
  thinking: boolean;
  /** Renderer failed: nothing for the AI to play. */
  disabled?: boolean;
  onToggle(on: boolean): void;
  onSpeed(s: AISpeed): void;
}

/**
 * The AI dock under the buttons, as wide as the board (`--vl-board-px`, published by BoardCanvas).
 * Off, it holds only the switch; on, it adds the speed toggle, the move counter and Thinking….
 */
export default function AIControls({ on, speed, moves, thinking, disabled = false, onToggle, onSpeed }: AIControlsProps) {
  const reduced = usePrefersReducedMotion();
  const fade = reduced ? 0 : MOTION.fadeMs;
  return (
    <Box
      role="group"
      aria-label="AI mode"
      sx={{
        width: 'var(--vl-board-px, 100%)', maxWidth: '100%', height: AI_DOCK_PX, boxSizing: 'border-box',
        px: '3px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: 1,
        border: '1px solid', borderColor: on ? 'rgba(255,79,216,0.45)' : 'rgba(154,163,214,0.2)',
        bgcolor: on ? 'rgba(255,79,216,0.06)' : 'transparent',
        transition: `border-color ${MOTION.fadeMs}ms ease, background-color ${MOTION.fadeMs}ms ease`,
        [REDUCED_MOTION_MEDIA]: { transition: 'none' },
      }}
    >
      <FormControlLabel
        label="AI"
        disabled={disabled}
        control={<Switch size="small" checked={on} onChange={(_, v) => onToggle(v)} color="secondary" />}
        sx={{
          flex: 'none', height: 44, m: 0, pl: 0.5, pr: 1, gap: 0.5, borderRadius: '8px',
          '& .MuiFormControlLabel-label': {
            fontWeight: 700, fontSize: 15, letterSpacing: '0.04em', color: on ? NEON.magenta : CHROME.text,
            transition: `color ${MOTION.fadeMs}ms ease`,
          },
          '& .MuiFormControlLabel-label.Mui-disabled': { color: CHROME.textDisabled },
        }}
      />
      <Fade in={on} timeout={fade} unmountOnExit>
        <ToggleButtonGroup
          exclusive value={speed} aria-label="AI speed" role="group"
          onChange={(_, v: AISpeed | null) => { if (v) onSpeed(v); }}
          sx={{ flex: 'none' }}
        >
          {SPEEDS.map((s) => (
            <ToggleButton key={s.value} value={s.value} sx={{ px: { xs: 1, sm: 1.75 }, py: 0, fontWeight: 700, textTransform: 'none' }}>
              {s.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Fade>
      <Fade in={on} timeout={fade} unmountOnExit>
        <Stack sx={{ ml: 'auto', pr: 1, alignItems: 'flex-end', fontSize: 15, lineHeight: '18px', fontWeight: 500, whiteSpace: 'nowrap' }}>
          <Box component="span" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
            AI moves {moves.toLocaleString('en-US')}
          </Box>
          {/* Always laid out; a ranking shorter than the fade-in delay never shows at all. */}
          <Box
            component="span"
            aria-hidden={!thinking}
            sx={{
              display: 'flex', alignItems: 'center', gap: '6px', color: NEON.magenta,
              opacity: thinking ? 1 : 0,
              transition: thinking ? `opacity ${MOTION.fadeMs}ms ease ${MOTION.thinkingDelayMs}ms` : `opacity ${MOTION.fadeMs}ms ease`,
              [REDUCED_MOTION_MEDIA]: { transitionDuration: '0ms' },
            }}
          >
            <Box component="span" aria-hidden="true" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: NEON.magenta, boxShadow: `0 0 8px ${NEON.magenta}` }} />
            Thinking…
          </Box>
        </Stack>
      </Fade>
    </Box>
  );
}
