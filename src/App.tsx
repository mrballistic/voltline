import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import CssBaseline from '@mui/material/CssBaseline';
import GlobalStyles from '@mui/material/GlobalStyles';
import Link from '@mui/material/Link';
import { ThemeProvider } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useGame } from './app/useGame';
import AIControls from './components/AIControls';
import BoardCanvas from './components/BoardCanvas';
import GameControls from './components/GameControls';
import GameOverDialog from './components/GameOverDialog';
import HowToPlayDialog from './components/HowToPlayDialog';
import Header from './components/Header';
import TrayNotice from './components/TrayNotice';
import { theme } from './theme';

/** Optional `?seed=N` for a reproducible board (handy for screenshots and bug reports). */
function seedFromUrl(): number | undefined {
  const raw = new URLSearchParams(window.location.search).get('seed');
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

const seed = seedFromUrl();
const CREDITS_URL = 'https://github.com/mrballistic/voltline/blob/main/CREDITS.md';

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

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const { ui, actions, failed } = useGame(host, seed);
  const [helpOpen, setHelpOpen] = useState(false);
  const over = ui?.over ?? false;
  // The best of the game that ended (recordBest's rule), not of the mode toggled afterwards.
  const best = ui ? (ui.overAI ? ui.best.ai : ui.best.player) : 0;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      <GlobalStyles styles={pageStyles} />
      <Box
        component="main"
        sx={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
        <Box sx={{ width: '100%', maxWidth: 640, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Header ui={ui} onMuted={actions.setMuted} onVolume={actions.setVolume} />
          <BoardCanvas host={host} failed={failed} />
          <TrayNotice trayFull={ui?.trayFull ?? false} />
          <GameControls
            hintDisabled={(ui?.busy ?? true) || (ui?.aiOn ?? false)} over={over} onHint={actions.hint} onNewGame={actions.newGame}
            onHowToPlay={() => { actions.uiClick(); setHelpOpen(true); }}
            aiSlot={(
              <AIControls
                on={ui?.aiOn ?? false} speed={ui?.aiSpeed ?? 'medium'} moves={ui?.aiMoves ?? 0} thinking={ui?.aiThinking ?? false}
                onToggle={actions.setAI} onSpeed={actions.setAISpeed}
              />
            )}
          />
          <Typography component="footer" sx={{ py: 1, fontSize: 13, color: 'text.secondary' }}>
            <Link href={CREDITS_URL} target="_blank" rel="noopener noreferrer" color="inherit">Credits</Link>
            {' · '}
            <Link href={`${CREDITS_URL.replace('CREDITS.md', 'LICENSE')}`} target="_blank" rel="noopener noreferrer" color="inherit">MIT License</Link>
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
