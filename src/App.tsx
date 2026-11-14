import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import CssBaseline from '@mui/material/CssBaseline';
import GlobalStyles from '@mui/material/GlobalStyles';
import Link from '@mui/material/Link';
import { ThemeProvider } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { openConsentSettings } from './app/consent';
import { isDesktopApp } from './app/platform';
import { useGame } from './app/useGame';
import AIControls from './components/AIControls';
import BoardCanvas from './components/BoardCanvas';
import ConsentBanner from './components/ConsentBanner';
import GameControls from './components/GameControls';
import GameOverDialog from './components/GameOverDialog';
import HowToPlayDialog from './components/HowToPlayDialog';
import Header from './components/Header';
import TrayNotice from './components/TrayNotice';
import { CHROME, theme } from './theme';

/** Optional `?seed=N` for a reproducible board (handy for screenshots and bug reports). */
function seedFromUrl(): number | undefined {
  const raw = new URLSearchParams(window.location.search).get('seed');
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

const seed = seedFromUrl();
const CREDITS_URL = 'https://github.com/mrballistic/voltline/blob/main/CREDITS.md';
const MAC_APP_URL = 'https://github.com/mrballistic/voltline/releases/latest';

// Dark circuit-grid page (spec §6.3).
const pageStyles = {
  'html, body, #app': { margin: 0, height: '100%' },
  body: {
    backgroundColor: '#0a0a11',
    backgroundImage:
      'linear-gradient(rgba(120,140,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(120,140,255,.06) 1px, transparent 1px)',
    backgroundSize: '24px 24px',
    overflow: 'hidden',
  },
} as const;

// 28 px tall targets; hover and keyboard focus brighten to the body text, and focus gets the shared ring.
const footerLinkSx = {
  display: 'inline-block', padding: '6px 2px', textUnderlineOffset: 2,
  '&:hover, &:focus-visible': { color: CHROME.text },
  '&:focus-visible': { outline: `2px solid ${CHROME.focus}`, outlineOffset: 3 },
} as const;
// “Cookie settings” is a button that looks like the links beside it.
const footerButtonSx = { ...footerLinkSx, font: 'inherit', verticalAlign: 'baseline', '&.Mui-focusVisible': footerLinkSx['&:focus-visible'] } as const;

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const { ui, actions, failed } = useGame(host, seed);
  const [helpOpen, setHelpOpen] = useState(false);
  const over = ui?.over ?? false;
  // The best of the game that ended (recordBest's rule), not of the mode toggled afterwards.
  const best = ui ? (ui.overAI ? ui.best.ai : ui.best.player) : 0;
  // The desktop app stays offline: no Mac app link (it is the Mac app) and no analytics to configure.
  const desktop = isDesktopApp();

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      <GlobalStyles styles={pageStyles} />
      <Box
        component="main"
        sx={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
        <Box sx={{ width: '100%', maxWidth: 640, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Header ui={ui} onMuted={actions.setMuted} />
          <BoardCanvas host={host} failed={failed} />
          <TrayNotice trayFull={ui?.trayFull ?? false} />
          <GameControls
            hintDisabled={failed || (ui?.busy ?? true) || (ui?.aiOn ?? false)} over={over} onHint={actions.hint} onNewGame={actions.newGame}
            onHowToPlay={() => { actions.uiClick(); setHelpOpen(true); }}
          />
          <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center', pt: 1 }}>
            <AIControls
              on={ui?.aiOn ?? false} speed={ui?.aiSpeed ?? 'medium'} moves={ui?.aiMoves ?? 0} thinking={ui?.aiThinking ?? false}
              disabled={failed} onToggle={actions.setAI} onSpeed={actions.setAISpeed}
            />
          </Box>
          {/* In the column's flow below 1280 px, a fixed corner card from there up (ConsentBanner). */}
          {!desktop && <ConsentBanner />}
          <Typography component="footer" sx={{ mt: 'auto', py: 1, fontSize: 13, lineHeight: '16px', color: 'text.secondary' }}>
            <Link href={CREDITS_URL} target="_blank" rel="noopener noreferrer" color="inherit" sx={footerLinkSx}>Credits</Link>
            {' · '}
            <Link href={`${CREDITS_URL.replace('CREDITS.md', 'LICENSE')}`} target="_blank" rel="noopener noreferrer" color="inherit" sx={footerLinkSx}>MIT License</Link>
            {!desktop && (
              <>
                {' · '}
                <Link href={MAC_APP_URL} target="_blank" rel="noopener noreferrer" color="inherit" sx={footerLinkSx}>Mac app</Link>
                {' · '}
                <Link component="button" type="button" onClick={openConsentSettings} color="inherit" sx={footerButtonSx}>Cookie settings</Link>
              </>
            )}
          </Typography>
        </Box>
      </Box>
      <HowToPlayDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <GameOverDialog
        open={over}
        score={ui?.score ?? 0}
        level={ui?.level ?? 1}
        best={best}
        newBest={ui?.newBest ?? false}
        ai={ui?.overAI ?? false}
        onPlayAgain={actions.newGame}
      />
    </ThemeProvider>
  );
}
