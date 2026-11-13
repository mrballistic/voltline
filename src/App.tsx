import GlobalStyles from '@mui/material/GlobalStyles';
import BoardCanvas from './components/BoardCanvas';

/** Optional `?seed=N` for a reproducible board (handy for screenshots and bug reports). */
function seedFromUrl(): number | undefined {
  const raw = new URLSearchParams(window.location.search).get('seed');
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

const seed = seedFromUrl();

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
  return (
    <>
      <GlobalStyles styles={pageStyles} />
      <main style={{ position: 'fixed', inset: 0 }}>
        <BoardCanvas seed={seed} />
      </main>
    </>
  );
}
