import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // No SPA fallback, like production: a missing file is a real 404 in `vite preview` (and so in
  // the smoke test), not index.html served under the file's name.
  appType: 'mpa',
  test: {
    environment: 'node',
    // CI runners with coverage on are several times slower than a dev Mac;
    // the engine/AI oracle and search tests are deterministic, just heavy.
    testTimeout: 15_000,
    setupFiles: ['./src/test/setup.ts'],
    // Agent worktrees live inside the repo; never collect their copies of the tests.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**', '.worktrees/**', 'scripts/smoke.spec.ts'],
    // Coverage gates only the pure rules engine and the search AI, the code
    // whose bugs are silent. Rendering and UI are checked by the browser smoke test.
    coverage: {
      provider: 'v8',
      include: ['src/engine/**', 'src/ai/**'],
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
      reporter: ['text-summary', 'text'],
      thresholds: { lines: 90, branches: 85, functions: 90 },
    },
  },
  worker: { format: 'es' },
  // Same policy as deploy/apache-voltline-le-ssl.conf, so `npm run smoke` runs under it.
  preview: {
    headers: {
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:",
    },
  },
});
