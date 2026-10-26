import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/pwa',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/Leafmark/',
    browserName: 'chromium',
    launchOptions: { channel: 'chrome' },
    viewport: { width: 1194, height: 834 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run web:export && npm run web:serve',
    url: 'http://127.0.0.1:4173/Leafmark/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
