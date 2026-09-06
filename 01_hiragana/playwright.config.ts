import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel: true, workers: 1, retries: 0, timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'tablet-webkit', use: { ...devices['iPad (gen 7)'] } },
  ],
  webServer: { command: 'node scripts/serve-dist.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
