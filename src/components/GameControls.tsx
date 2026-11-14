import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { CHROME, NEON } from '../theme';

// Height, min width, focus ring, press and disabled styles come from the theme. On a phone narrower
// than the three 110 px buttons, they shrink from 110 (labels still fit with 8 px padding) instead of
// running off the screen.
const fitSx = { flex: '0 1 110px', minWidth: { xs: 0, sm: 110 }, px: { xs: 1, sm: 2 } } as const;
const hintSx = {
  ...fitSx,
  borderColor: 'rgba(77,216,255,0.5)',
  '&:hover': { borderColor: NEON.cyan, bgcolor: 'rgba(77,216,255,0.08)' },
  '&:active': { bgcolor: 'rgba(77,216,255,0.16)' },
} as const;
const howToSx = {
  ...fitSx,
  borderColor: NEON.magenta, bgcolor: 'rgba(255,79,216,0.08)',
  '&:hover': { borderColor: NEON.magenta, bgcolor: 'rgba(255,79,216,0.14)' },
  '&:active': { bgcolor: 'rgba(255,79,216,0.22)' },
} as const;
const newGameSx = {
  ...fitSx,
  bgcolor: NEON.magenta, color: CHROME.page, boxShadow: `0 0 14px ${NEON.magenta}55`,
  '&:hover': { bgcolor: CHROME.magentaHover, boxShadow: `0 0 18px ${NEON.magenta}88` },
  '&:active': { bgcolor: CHROME.magentaPressed },
} as const;

/** Hint, How to play and New game under the tray. The AI dock is its own block below (App). */
export default function GameControls(
  { hintDisabled, over, onHint, onNewGame, onHowToPlay }: { hintDisabled: boolean; over: boolean; onHint(): void; onNewGame(): void; onHowToPlay(): void },
) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ width: '100%', boxSizing: 'border-box', px: 1, justifyContent: 'center', pt: 0.5 }}>
      <Button variant="outlined" color="primary" disabled={hintDisabled || over} onClick={onHint} sx={hintSx}>
        Hint
      </Button>
      <Button variant="outlined" color="secondary" onClick={onHowToPlay} sx={howToSx}>
        How to play
      </Button>
      <Button variant="contained" onClick={onNewGame} sx={newGameSx}>
        New game
      </Button>
    </Stack>
  );
}
