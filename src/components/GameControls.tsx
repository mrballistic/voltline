import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import type { ReactNode } from 'react';
import { NEON } from '../theme';

/** Hint and New game under the tray; `aiSlot` is where Task 17's AI controls go. */
export default function GameControls(
  { hintDisabled, over, onHint, onNewGame, aiSlot }: { hintDisabled: boolean; over: boolean; onHint(): void; onNewGame(): void; aiSlot?: ReactNode },
) {
  return (
    <Stack spacing={1} sx={{ width: '100%', alignItems: 'center' }}>
      <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'center' }}>
        <Button variant="outlined" color="primary" disabled={hintDisabled || over} onClick={onHint} sx={{ minWidth: 110 }}>
          Hint
        </Button>
        <Button
          variant="contained"
          onClick={onNewGame}
          sx={{ minWidth: 110, bgcolor: NEON.magenta, color: '#0a0a11', '&:hover': { bgcolor: '#ff7be3' } }}
        >
          New game
        </Button>
      </Stack>
      {aiSlot}
    </Stack>
  );
}
