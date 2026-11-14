import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useSyncExternalStore } from 'react';
import { choose, initConsent, isBannerOpen, subscribeBanner } from '../app/consent';
import { CHROME, NEON } from '../theme';

// Both choices carry equal weight: the same variant, size and style. Height and the focus ring
// come from the theme.
const choiceSx = {
  flex: '1 1 0', minWidth: 0, fontSize: 15, color: CHROME.text, borderColor: 'rgba(77,216,255,0.5)',
  '&:hover': { borderColor: NEON.cyan, bgcolor: 'rgba(77,216,255,0.08)' },
  '&:active': { bgcolor: 'rgba(77,216,255,0.16)' },
} as const;

/**
 * The analytics cookie banner: a labeled region, not a modal, so the game stays playable behind
 * it. A small card bottom-left on wide screens, full width at the bottom on phones, on the
 * dialog surface. It opens after mount only when there's no saved answer.
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
      sx={{
        position: 'fixed', zIndex: 'appBar',
        left: { xs: 12, sm: 24 }, right: { xs: 12, sm: 'auto' }, bottom: { xs: 12, sm: 24 },
        maxWidth: { sm: 400 }, boxSizing: 'border-box', p: '16px 18px 18px',
        bgcolor: CHROME.dialog, border: `1px solid ${NEON.cyan}55`, borderRadius: 1,
        boxShadow: '0 18px 40px -12px rgba(0,0,0,0.7)',
      }}
    >
      <Typography sx={{ m: 0, fontSize: 15, lineHeight: 1.4, color: 'text.secondary' }}>
        Voltline uses Google Analytics cookies to count visits. Nothing is sent unless you accept.
      </Typography>
      <Stack direction="row" spacing={1.25} sx={{ mt: 1.75 }}>
        <Button variant="outlined" onClick={() => choose('denied')} sx={choiceSx}>Decline</Button>
        <Button variant="outlined" onClick={() => choose('granted')} sx={choiceSx}>Accept</Button>
      </Stack>
    </Box>
  );
}
