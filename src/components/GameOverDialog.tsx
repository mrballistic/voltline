import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { CHROME, DISPLAY_FONT, NEON } from '../theme';
import { DIALOG_ACTION_SX } from './dialogStyles';
import { usePrefersReducedMotion } from './motion';

const fmt = (n: number) => n.toLocaleString('en-US');

export interface GameOverDialogProps {
  open: boolean;
  score: number;
  level: number;
  best: number;
  newBest: boolean;
  ai: boolean;
  onPlayAgain(): void;
}

/** No `onClose`: Escape and the backdrop do nothing; Play again is the way out. */
export default function GameOverDialog({ open, score, level, best, newBest, ai, onPlayAgain }: GameOverDialogProps) {
  const reduced = usePrefersReducedMotion();
  return (
    <Dialog
      open={open}
      aria-labelledby="game-over-title"
      transitionDuration={reduced ? 0 : undefined}
      slotProps={{
        paper: {
          sx: {
            width: 300, minWidth: 280, p: '28px 24px 24px', boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', textAlign: 'center',
          },
        },
      }}
    >
      <DialogTitle id="game-over-title" sx={{ p: 0, mb: '4px', fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 20, lineHeight: 1.3, color: CHROME.text }}>
        No moves left
      </DialogTitle>
      <Typography sx={{ fontSize: 22, lineHeight: '28px', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>Score {fmt(score)}</Typography>
      <Typography sx={{ fontSize: 18, lineHeight: '24px' }}>Level {level}</Typography>
      <Typography sx={{ fontSize: 18, lineHeight: '24px', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
        {ai ? 'AI best' : 'Best'} {fmt(best)}
      </Typography>
      {newBest && (
        <Typography sx={{ mt: 1, fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 16, color: NEON.yellow, textShadow: `0 0 12px ${NEON.yellow}88` }}>
          New best!
        </Typography>
      )}
      <Button variant="contained" autoFocus onClick={onPlayAgain} sx={{ ...DIALOG_ACTION_SX, mt: '18px' }}>
        Play again
      </Button>
    </Dialog>
  );
}
