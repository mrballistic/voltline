import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    environment: 'node',
    setupFiles: [],
    // Agent worktrees live inside the repo; never collect their copies of the tests.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**', '.worktrees/**'],
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
});
