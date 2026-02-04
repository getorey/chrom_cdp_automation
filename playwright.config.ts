import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'unit',
      testMatch: /.*\.unit\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'integration',
      testMatch: /.*\.integration\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
      },
    },
  ],
});
