import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { NEON } from '../theme';

/** Hint, How to play and New game under the tray. The AI dock is its own block below (App). */
export default function GameControls(
  { hintDisabled, over, onHint, onNewGame, onHowToPlay }: { hintDisabled: boolean; over: boolean; onHint(): void; onNewGame(): void; onHowToPlay(): void },
) {
  return (
    <Stack sx={{ width: '100%', alignItems: 'center', pt: 0.5 }}>
      <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'center' }}>
        <Button variant="outlined" color="primary" disabled={hintDisabled || over} onClick={onHint} sx={{ minWidth: 110 }}>
          Hint
        </Button>
        <Button variant="outlined" color="secondary" onClick={onHowToPlay} sx={{ minWidth: 110 }}>
          How to play
        </Button>
        <Button
          variant="contained"
          onClick={onNewGame}
          sx={{ minWidth: 110, bgcolor: NEON.magenta, color: '#0a0a11', '&:hover': { bgcolor: '#ff7be3' } }}
        >
          New game
        </Button>
      </Stack>
    </Stack>
  );
}
