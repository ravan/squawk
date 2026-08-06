import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI === undefined ? 0 : 2,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
  webServer: {
    command:
      'pnpm exec vite e2e/fixture-site --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: process.env.CI === undefined,
  },
});
