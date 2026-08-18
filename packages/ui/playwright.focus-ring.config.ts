import { defineConfig, devices } from '@playwright/test';

/**
 * Standalone config for the focus-ring PAINT guard (`focus-ring-paints.spec.ts`).
 *
 * Deliberately does NOT use Storybook as its server, unlike every other IVP
 * config in this package. Storybook loads Tailwind at DOCUMENT level, which
 * registers the `--tw-*` custom properties globally and makes shadow-root rings
 * paint — the precise condition that hid this defect. This suite runs against a
 * bare harness that serves only the built element bundle, which is what a real
 * consumer app looks like, and the spec asserts that absence before it measures
 * anything.
 *
 * Needs a build first (`nx build ui`) — it drives `dist/`, not source.
 * Run: `npm run test:focus-ring` inside packages/ui.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /focus-ring-paints\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 180_000,
  use: {
    baseURL: 'http://localhost:6210',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1100, height: 900 },
        launchOptions: { args: ['--disable-dev-shm-usage', '--no-sandbox'] },
      },
    },
  ],
  webServer: {
    command: 'node tests/e2e/focus-ring-harness-server.mjs',
    url: 'http://localhost:6210/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
