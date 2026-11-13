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
  },
  worker: { format: 'es' },
});
