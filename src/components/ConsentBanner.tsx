import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useSyncExternalStore } from 'react';
import { choose, initConsent, isBannerOpen, subscribeBanner } from '../app/consent';
import { BOARD_PX_VAR } from './BoardCanvas';
import { CHROME, NEON } from '../theme';

/**
 * Where the banner may float as a corner card, clear of the game column. The card sits 24 px from
 * the left and bottom and keeps a 24 px gap to the AI dock, the widest control in its band (the dock
 * is the board's width, at least 360 px; the board is at most 576 px, 8 × MAX_CELL_PX). At 1280 px
 * the card gets 1280 / 2 − 576 / 2 − 24 − 24 = 304 px beside the widest dock, and its full 400 px
 * beside the 424 px board of a 1440×900 screen (1440 / 2 − 212 − 48 = 460). Its width tracks the
 * board (CARD_WIDTH), so the gap holds at every height. Narrower than this, it can't clear the
 * column, so it sits in the column's flow instead and the board shrinks to make room.
 */
export const CORNER_CARD_MEDIA = '@media (min-width: 1280px)';
const INSET = 24;
const CARD_WIDTH = `min(400px, calc(50% - max(var(${BOARD_PX_VAR}, 576px), 360px) / 2 - ${2 * INSET}px))`;
const ROW_MEDIA = '@media (min-width: 600px)';

// Both choices carry equal weight: the same variant, size and style. Height and the focus ring
// come from the theme.
const choiceSx = {
  flex: '1 1 0', minWidth: 0, fontSize: 15, color: CHROME.text, borderColor: 'rgba(77,216,255,0.5)',
  '&:hover': { borderColor: NEON.cyan, bgcolor: 'rgba(77,216,255,0.08)' },
  '&:active': { bgcolor: 'rgba(77,216,255,0.16)' },
} as const;

/**
 * The analytics cookie banner: a labeled region, not a modal, so the game stays playable. Below
 * CORNER_CARD_MEDIA it sits in the app column between the AI dock and the footer (text above the
 * buttons on phones, beside them from 600 px), so it never covers a control; from there up it's a
 * small fixed card bottom-left. It opens after mount only when there's no saved answer.
 */
export default function ConsentBanner() {
  const open = useSyncExternalStore(subscribeBanner, isBannerOpen);
  useEffect(initConsent, []);
  if (!open) return null;
  return (
    <Box
      component="section"
      role="region"
      aria-label="Analytics cookies"
      sx={(t) => ({
        flex: 'none', boxSizing: 'border-box', width: 'calc(100% - 16px)', mt: 1, p: '12px 14px 14px',
        display: 'flex', flexDirection: 'column', gap: 1.25,
        bgcolor: CHROME.dialog, border: `1px solid ${NEON.cyan}55`, borderRadius: 1,
        [ROW_MEDIA]: { flexDirection: 'row', alignItems: 'center', gap: 2 },
        [CORNER_CARD_MEDIA]: {
          position: 'fixed', zIndex: t.zIndex.appBar, left: INSET, bottom: INSET, width: CARD_WIDTH, mt: 0,
          p: '16px 18px 18px', flexDirection: 'column', alignItems: 'stretch', gap: 1.75,
          boxShadow: '0 18px 40px -12px rgba(0,0,0,0.7)',
        },
      })}
    >
      <Typography sx={{ m: 0, flex: '1 1 auto', fontSize: 15, lineHeight: 1.4, color: 'text.secondary' }}>
        Voltline uses Google Analytics cookies to count visits. Nothing is sent unless you accept.
      </Typography>
      <Stack direction="row" spacing={1.25} sx={{ flex: 'none', [ROW_MEDIA]: { width: 240 }, [CORNER_CARD_MEDIA]: { width: 'auto' } }}>
        <Button variant="outlined" onClick={() => choose('denied')} sx={choiceSx}>Decline</Button>
        <Button variant="outlined" onClick={() => choose('granted')} sx={choiceSx}>Accept</Button>
      </Stack>
    </Box>
  );
}
