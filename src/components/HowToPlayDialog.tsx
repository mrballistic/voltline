import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, type ReactNode } from 'react';
import { ROCK_START_LEVEL, STINGY_START_LEVEL, TRAY_CAPACITY, TRAY_THRESHOLD } from '../engine/rules';
import { CHROME, DISPLAY_FONT, NEON } from '../theme';
import { DIALOG_ACTION_SX } from './dialogStyles';
import { usePrefersReducedMotion } from './motion';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** Number words for the small rule values (1 to 10); anything else stays a digit. */
export const numberWord = (n: number) => WORDS[n] ?? String(n);

const glow = 'drop-shadow(0 0 4px currentColor)';

/** Small piece swatches, drawn from the reference art (docs/superpowers/specs/assets/voltline-pieces-reference.html). */
function Swatch({ children }: { children: ReactNode }) {
  return (
    <Box component="svg" viewBox="0 0 100 100" aria-hidden="true" sx={{ width: 36, height: 36, flex: 'none' }}>
      {children}
    </Box>
  );
}

const ChargeSwatch = () => (
  <Swatch>
    <circle cx="50" cy="50" r="31" fill="#ff3b5c" fillOpacity=".14" stroke="#ff3b5c" strokeWidth="7" style={{ color: '#ff3b5c', filter: glow }} />
    <circle cx="50" cy="50" r="11" fill="#ff3b5c" fillOpacity=".45" stroke="#fff" strokeWidth="4" />
  </Swatch>
);

const ArcSwatch = () => (
  <Swatch>
    <rect x="21" y="21" width="58" height="58" rx="8" fill="#4d7bff" fillOpacity=".14" stroke="#4d7bff" strokeWidth="7" style={{ color: '#4d7bff', filter: glow }} />
    <g fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      {[0, 90, 180, 270].map((deg) => (
        <polyline key={deg} points="6,50 9.5,46 13,54 16.5,47.5 19.5,51" transform={`rotate(${deg} 50 50)`} />
      ))}
    </g>
  </Swatch>
);

const PrismSwatch = () => (
  <Swatch>
    <defs>
      <linearGradient id="htp-prism" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ff3b5c" />
        <stop offset=".33" stopColor="#ffe14d" />
        <stop offset=".66" stopColor="#3bffb0" />
        <stop offset="1" stopColor="#4d7bff" />
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="29" fill="none" stroke="url(#htp-prism)" strokeWidth="11" style={{ color: '#fff', filter: glow }} />
    <circle cx="50" cy="50" r="9" fill="#fff" />
  </Swatch>
);

const RockSwatch = () => (
  <Swatch>
    <rect x="19" y="19" width="62" height="62" rx="6" fill="#24242c" stroke="#45454f" strokeWidth="5" />
    <path d="M35 35 L65 65 M65 35 L35 65" stroke="#52525c" strokeWidth="6" strokeLinecap="round" />
    <g fill="#45454f">
      <rect x="11" y="31" width="8" height="6" /><rect x="11" y="63" width="8" height="6" />
      <rect x="81" y="31" width="8" height="6" /><rect x="81" y="63" width="8" height="6" />
    </g>
  </Swatch>
);

function Heading({ children }: { children: ReactNode }) {
  return (
    <Typography component="h3" sx={{ fontFamily: DISPLAY_FONT, fontSize: 14, letterSpacing: '0.12em', color: NEON.cyan, mt: 2.5, mb: 0.75, '&:first-of-type': { mt: 0.5 } }}>
      {children}
    </Typography>
  );
}

/** A swatch beside its text; the text sits 6 px down so its first line centers on the 36 px swatch. */
function SwatchRow({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', mb: 1.25 }}>
      {swatch}
      <Typography sx={{ mt: '6px' }}>{children}</Typography>
    </Stack>
  );
}

function Row({ swatch, name, children }: { swatch: ReactNode; name: string; children: ReactNode }) {
  return (
    <SwatchRow swatch={swatch}>
      <strong>{name}.</strong> {children}
    </SwatchRow>
  );
}

/** A pointer-events-none fade over the scrolling text, in the dialog's surface color. */
function EdgeFade({ edge, testId }: { edge: 'top' | 'bottom'; testId: string }) {
  const clear = 'rgba(26,26,52,0)';
  return (
    <Box
      aria-hidden="true"
      data-testid={testId}
      sx={{
        position: 'absolute', left: 0, right: 0, [edge]: 0, height: edge === 'top' ? 28 : 32, pointerEvents: 'none',
        background: edge === 'top' ? `linear-gradient(${CHROME.dialog}, ${clear})` : `linear-gradient(${clear}, ${CHROME.dialog})`,
      }}
    />
  );
}

export interface HowToPlayDialogProps {
  open: boolean;
  onClose(): void;
}

/** The rules in one scrollable modal. Purely informational: it never touches game state. */
export default function HowToPlayDialog({ open, onClose }: HowToPlayDialogProps) {
  const reduced = usePrefersReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  // Each opening starts at the top, so the top fade starts hidden.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setScrolled(false);
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      scroll="paper"
      fullWidth
      maxWidth="sm"
      aria-labelledby="how-to-play-title"
      transitionDuration={reduced ? 0 : undefined}
      // The theme's 16 px margin, so the paper is the viewport less 32 px each way at most.
      slotProps={{ paper: { sx: { width: 'calc(100% - 32px)', maxHeight: 'calc(100% - 32px)' } } }}
    >
      <DialogTitle id="how-to-play-title" sx={{ p: '22px 24px 14px', fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 20, textAlign: 'center' }}>
        How to play
      </DialogTitle>
      <Box sx={{ position: 'relative', flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <DialogContent
          data-testid="how-to-play-content"
          onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
          sx={{
            pt: 0, pb: 3, '& p': { m: 0 },
            scrollbarWidth: 'thin', scrollbarColor: 'rgba(77,216,255,0.5) transparent',
          }}
        >
          <Heading>The goal</Heading>
          <Typography>
            Swap two neighboring pieces to line up three or more of the same color. They clear, new pieces drop in, and every
            match that follows chains for more points. A swap that makes no match slides back.
          </Typography>

          <Heading>Special pieces</Heading>
          <Row swatch={<ChargeSwatch />} name="Charge">Made by matching 4 in a line. Clears the 3×3 area around it.</Row>
          <Row swatch={<ArcSwatch />} name="Arc">Made by an L or T shape. Clears its whole row and column.</Row>
          <Row swatch={<PrismSwatch />} name="Prism">Made by matching 5 in a line. Swap it with a colored piece to clear every piece of that color, or with a rock to clear every rock.</Row>
          <Typography sx={{ color: 'text.secondary' }}>Specials chain: an explosion that reaches another special sets it off.</Typography>

          <Heading>The tray</Heading>
          <Typography>
            Every {TRAY_THRESHOLD} pieces of one color you clear earns a spare piece of that color. The tray holds {numberWord(TRAY_CAPACITY)}, and counting pauses
            while it’s full, so spend one. Tap a tray piece, then a plain piece on the board (or drag it there) to put it in that piece’s place.
            Placing costs a move. Drop it while pieces are still falling and it waits, then lands when they stop; a cell it can’t take
            (its own color, a special or a rock) sends it back with a buzz.
          </Typography>

          <Heading>Rocks</Heading>
          <SwatchRow swatch={<RockSwatch />}>
            From level {ROCK_START_LEVEL}, gray rocks start appearing. Clear them by matching three, or with an explosion.
            Match four or more and they explode like a Charge.
            A Prism swapped with a rock clears every rock on the board.
          </SwatchRow>

          <Heading>Levels and game over</Heading>
          <Typography>
            Fill the progress bar to level up. Past level {STINGY_START_LEVEL - 1}, refills get harder. The game ends when no move can make a match,
            tray placements included, so a spare piece can save you.
          </Typography>

          <Heading>Hint and AI mode</Heading>
          <Typography><strong>Hint</strong> shows the best moves as arrows.</Typography>
          <Typography><strong>AI mode</strong> plays for you until you switch it off.</Typography>

          <Heading>Controls</Heading>
          <Typography>Tap or click a piece, then a neighbor. Or drag (or swipe) a piece toward a neighbor.</Typography>
        </DialogContent>
        {scrolled && <EdgeFade edge="top" testId="how-to-play-fade-top" />}
        <EdgeFade edge="bottom" testId="how-to-play-fade-bottom" />
      </Box>
      <DialogActions sx={{ justifyContent: 'center', p: '14px 24px 20px', borderTop: '1px solid rgba(120,140,255,0.14)' }}>
        <Button variant="contained" autoFocus onClick={onClose} sx={DIALOG_ACTION_SX}>
          Got it
        </Button>
      </DialogActions>
    </Dialog>
  );
}
