import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { DISPLAY_FONT, NEON } from '../theme';

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

export default function GameOverDialog({ open, score, level, best, newBest, ai, onPlayAgain }: GameOverDialogProps) {
  return (
    <Dialog open={open} aria-labelledby="game-over-title" slotProps={{ paper: { sx: { border: `1px solid ${NEON.cyan}55`, minWidth: 280 } } }}>
      <DialogTitle id="game-over-title" sx={{ fontFamily: DISPLAY_FONT, textAlign: 'center' }}>
        No moves left
      </DialogTitle>
      <DialogContent sx={{ textAlign: 'center' }}>
        <Typography sx={{ fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>Score {fmt(score)}</Typography>
        <Typography sx={{ fontSize: 18 }}>Level {level}</Typography>
        <Typography sx={{ fontSize: 18, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
          {ai ? 'AI best' : 'Best'} {fmt(best)}
        </Typography>
        {newBest && (
          <Typography sx={{ mt: 1, fontFamily: DISPLAY_FONT, color: NEON.yellow, textShadow: `0 0 10px ${NEON.yellow}88` }}>
            New best!
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'center', pb: 2 }}>
        <Button variant="contained" autoFocus onClick={onPlayAgain}>
          Play again
        </Button>
      </DialogActions>
    </Dialog>
  );
}
