import { defineConfig, devices } from '@playwright/test';

/**
 * Standalone IVP config for the input masker — the same arrangement every other
 * IVP in this family uses (playwright.menu / composer / command / slots).
 *
 * Self-contained: starts Storybook on :6006 (reusing an already-running one).
 * Run: `npx playwright test --config playwright.input-mask.config.ts`
 */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /input-mask-ivp\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  // Storybook compiles each story on first load (Vite on-demand); a cold first
  // hit can exceed the 5s default.
  expect: { timeout: 30_000 },
  use: {
    baseURL: 'http://localhost:6006',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--disable-dev-shm-usage', '--no-sandbox'] },
      },
    },
  ],
  webServer: {
    command: 'npm run storybook -- --ci --quiet',
    url: 'http://localhost:6006/iframe.html',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
