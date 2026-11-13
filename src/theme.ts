// MUI dark theme: Orbitron for display text (title, score, level), Rajdhani for the UI.
import '@fontsource/orbitron/700.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/700.css';
import { createTheme } from '@mui/material/styles';

export const DISPLAY_FONT = '"Orbitron", system-ui, sans-serif';
export const BODY_FONT = '"Rajdhani", system-ui, sans-serif';

/** Neon accents, matching the piece colors. */
export const NEON = { cyan: '#4dd8ff', magenta: '#ff4fd8', yellow: '#ffe14d', green: '#3bffb0' } as const;

export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: '#0a0a11', paper: '#14142a' },
    primary: { main: NEON.cyan },
    secondary: { main: NEON.magenta },
    text: { primary: '#e6e9ff', secondary: '#9aa3d6' },
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
});
