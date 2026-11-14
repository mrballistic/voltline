import { defineConfig } from '@playwright/test';

// The smoke test drives the production build under `vite preview`, which serves the
// same Content-Security-Policy as the real server (see vite.config.ts).
export default defineConfig({
  testDir: 'scripts',
  testMatch: 'smoke.spec.ts',
  timeout: 90_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    // Chromium's fake audio output: the smoke doesn't listen, and a host's real audio device
    // (a multichannel interface, a sleeping or missing one) can make the AudioContext report
    // device errors to the console that have nothing to do with the build.
    launchOptions: { args: ['--disable-audio-output'] },
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
