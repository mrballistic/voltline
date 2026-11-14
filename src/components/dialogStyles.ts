// Shared by GameOverDialog and HowToPlayDialog (chrome spec §8).
import { CHROME, NEON } from '../theme';

/** The one action in each dialog (Play again, Got it): contained cyan, 44 × ≥ 140. */
export const DIALOG_ACTION_SX = {
  minWidth: 140, px: 2.5, fontSize: 15, bgcolor: NEON.cyan, color: CHROME.page, boxShadow: `0 0 14px ${NEON.cyan}55`,
  '&:hover': { bgcolor: CHROME.cyanHover, boxShadow: `0 0 14px ${NEON.cyan}55` },
  '&:active': { bgcolor: CHROME.cyanPressed },
} as const;
