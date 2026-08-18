import { defineConfig, devices } from '@playwright/test';

/**
 * Standalone config for the hover-card TAB-STOP + focus-open matrix.
 *
 * Why it exists at all: jsdom has no tab-order engine, so it can never press
 * Tab, and two defects in this component slipped through unit tests that
 * verified a keyboard claim with a non-keyboard mechanism (a synthetic
 * `focusIn`, then a programmatic `.focus()`). This suite presses the real key.
 *
 * Deliberately self-contained and Storybook-free: it serves the built
 * `dist/kai.es.js` and one static fixture, so it exercises the SHIPPED bundle
 * and shares no setup with the other e2e configs. Needs `nx build ui` first.
 *
 * The server is the workspace's own vite via `pnpm exec` — never bare `npx`,
 * for the hermetic-CI reason `playwright.config.ts` documents. `pnpm exec`
 * rather than a path because pnpm hoists vite to the workspace root and
 * `packages/ui/node_modules/.bin/vite` does not exist; rather than an npm
 * script so this config adds nothing to package.json that a concurrent branch
 * could conflict on.
 *
 * Port 6013: away from Storybook (6006), the remote-card host/provider
 * (6006/6007) and the docs site (4321).
 *
 * Run: `npx playwright test --config playwright.hovercard.config.ts`
 */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /hover-card-tabstops\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:6013',
    trace: 'on-first-retry',
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
    command: 'pnpm exec vite --port 6013 --strictPort',
    url: 'http://localhost:6013/tests/e2e/fixtures/hover-card-tabstops.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
