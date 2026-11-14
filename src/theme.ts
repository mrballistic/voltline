// MUI dark theme: Orbitron for display text (title, score, level), Rajdhani for the UI.
import '@fontsource/orbitron/700.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/700.css';
import { createTheme } from '@mui/material/styles';

export const DISPLAY_FONT = '"Orbitron", system-ui, sans-serif';
export const BODY_FONT = '"Rajdhani", system-ui, sans-serif';

/** Neon accents, matching the piece colors. */
export const NEON = { cyan: '#4dd8ff', magenta: '#ff4fd8', yellow: '#ffe14d', green: '#3bffb0' } as const;

/**
 * Chrome colors beyond the neon accents (docs/superpowers/specs/2026-11-13-voltline-chrome-design.md §1).
 * Contrast on the page (#0a0a11): textDisabled 5.6:1, focus 15.2:1; on the dialog surface, focus 13.0:1.
 */
export const CHROME = {
  page: '#0a0a11',
  text: '#e6e9ff',
  textSecondary: '#9aa3d6',
  magentaHover: '#ff7be3',
  magentaPressed: '#e63fc2',
  cyanHover: '#85e5ff',
  cyanPressed: '#2fbde6',
  focus: '#ffe14d',
  textDisabled: '#7d86b8',
  dialog: '#1a1a34',
} as const;

/** The chrome's easing for hover and press. */
export const EASE_STANDARD = 'cubic-bezier(0.2, 0, 0, 1)';
const HOVER_MS = 120;
const PRESS_MS = 60;
const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce)';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: CHROME.page, paper: '#14142a' },
    primary: { main: NEON.cyan },
    secondary: { main: NEON.magenta },
    text: { primary: CHROME.text, secondary: CHROME.textSecondary },
    // MUI's default (30% white) is about 2:1 on the page.
    action: { disabled: CHROME.textDisabled },
  },
  typography: {
    fontFamily: BODY_FONT,
    fontWeightRegular: 500,
    fontWeightBold: 700,
    h1: { fontFamily: DISPLAY_FONT, fontWeight: 700 },
    h2: { fontFamily: DISPLAY_FONT, fontWeight: 700 },
    h3: { fontFamily: DISPLAY_FONT, fontWeight: 700 },
    button: { fontFamily: BODY_FONT, fontWeight: 700, textTransform: 'none', letterSpacing: '0.04em' },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
      styleOverrides: {
        root: { '&.Mui-focusVisible': { outline: `2px solid ${CHROME.focus}`, outlineOffset: 3 } },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: 44,
          minWidth: 110,
          transition: ['color', 'background-color', 'border-color', 'box-shadow']
            .map((p) => `${p} ${HOVER_MS}ms ${EASE_STANDARD}`)
            .concat(`transform ${PRESS_MS}ms ${EASE_STANDARD}`)
            .join(', '),
          '&:active': { transform: 'translateY(1px)' },
          // The dashed border is the cue that doesn't rely on color.
          '&.Mui-disabled': {
            color: CHROME.textDisabled,
            border: '1px dashed rgba(154,163,214,0.45)',
            background: 'transparent',
            boxShadow: 'none',
          },
          [REDUCED_MOTION]: {
            transition: `color ${HOVER_MS}ms ${EASE_STANDARD}`,
            '&:active': { transform: 'none' },
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          width: 44,
          height: 44,
          borderRadius: 10,
          '&:hover': { backgroundColor: 'rgba(77,216,255,0.10)' },
          '&:active': { backgroundColor: 'rgba(77,216,255,0.18)' },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          minHeight: 44,
          minWidth: 52,
          fontSize: 14,
          borderRadius: 8,
          color: CHROME.textSecondary,
          '&:hover': { color: CHROME.text, backgroundColor: 'rgba(154,163,214,0.08)' },
          '&.Mui-selected, &.Mui-selected:hover': {
            color: NEON.magenta,
            background: 'rgba(255,79,216,0.16)',
            boxShadow: `inset 0 0 0 1px ${NEON.magenta}`,
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        // Flat surface: the elevation-24 overlay lightens paper to #3b3b4d, where magenta is 3.8:1.
        paper: { backgroundColor: CHROME.dialog, backgroundImage: 'none', border: `1px solid ${NEON.cyan}55`, margin: 16 },
      },
    },
  },
});
