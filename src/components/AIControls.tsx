import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import type { AISpeed } from '../app/ports';
import { NEON } from '../theme';

const SPEEDS: { value: AISpeed; label: string }[] = [
  { value: 'slow', label: 'Slow' },
  { value: 'medium', label: 'Medium' },
  { value: 'fast', label: 'Fast' },
];

export interface AIControlsProps {
  on: boolean;
  speed: AISpeed;
  moves: number;
  thinking: boolean;
  onToggle(on: boolean): void;
  onSpeed(s: AISpeed): void;
}

/** AI mode: on/off (play/pause), speed, the move counter and a quiet thinking indicator. */
export default function AIControls({ on, speed, moves, thinking, onToggle, onSpeed }: AIControlsProps) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
      <FormControlLabel
        label="AI"
        control={<Switch checked={on} onChange={(_, v) => onToggle(v)} color="secondary" />}
        sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontWeight: 700, letterSpacing: '0.08em' } }}
      />
      <ToggleButtonGroup
        size="small" exclusive value={speed} aria-label="AI speed"
        onChange={(_, v: AISpeed | null) => { if (v) onSpeed(v); }}
      >
        {SPEEDS.map((s) => (
          <ToggleButton key={s.value} value={s.value} sx={{ px: 1.25, py: 0.25, fontWeight: 700, textTransform: 'none' }}>
            {s.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Typography sx={{ fontSize: 15, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', minWidth: 92 }}>
        AI moves {moves.toLocaleString('en-US')}
      </Typography>
      {/* Space is always reserved; a ranking shorter than the fade-in delay never shows at all. */}
      <Box
        aria-hidden={!thinking}
        sx={{
          minWidth: 72, fontSize: 15, color: NEON.magenta,
          opacity: thinking ? 1 : 0,
          transition: thinking ? 'opacity 150ms ease 120ms' : 'opacity 150ms ease',
        }}
      >
        Thinking…
      </Box>
    </Stack>
  );
}
