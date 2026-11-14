import { defineConfig } from '@playwright/test';

// The smoke test drives the production build under `vite preview`, which serves the
// same Content-Security-Policy as the real server (see vite.config.ts).
export default defineConfig({
  testDir: 'scripts',
  testMatch: 'smoke.spec.ts',
  timeout: 90_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
