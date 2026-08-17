import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60 * 1000,
  expect: {
    timeout: 10000
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    headless: true
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: [
    {
      command: 'node --experimental-strip-types backend/server.ts',
      port: 5000,
      reuseExistingServer: true,
      timeout: 60 * 1000
    },
    {
      command: 'npm --prefix frontend run dev',
      port: 5173,
      reuseExistingServer: true,
      timeout: 60 * 1000
    }
  ]
});
