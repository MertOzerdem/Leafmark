import { defineConfig } from '@playwright/test';

const pwaBaseURL = process.env.PWA_BASE_URL ?? 'http://127.0.0.1:4173/Leafmark/';
const usePublishedSite = Boolean(process.env.PWA_BASE_URL);

export default defineConfig({
  testDir: './tests/pwa',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: pwaBaseURL,
    browserName: 'chromium',
    launchOptions: { channel: 'chrome' },
    viewport: { width: 1194, height: 834 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },
  ...(usePublishedSite ? {} : {
    webServer: {
      command: 'npm run web:export && npm run web:serve',
      url: pwaBaseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  }),
});
