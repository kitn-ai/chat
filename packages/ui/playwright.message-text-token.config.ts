import { defineConfig, devices } from '@playwright/test';

/**
 * Standalone config for the user-message TEXT color guard
 * (`message-text-token.spec.ts`).
 *
 * Reuses `focus-ring-harness-server.mjs` verbatim: a bare page that loads only
 * the built `dist/kai.es.js` element bundle with NO document-level Tailwind, on
 * its own port. That is exactly the condition this spec needs too — the same
 * reason `focus-ring-paints.spec.ts` cannot run under Storybook applies here:
 * this guard is about what CSS CUSTOM PROPERTIES resolve to inside a shadow
 * root for a real consumer (who never loads Tailwind at document level), not
 * about Storybook's own environment.
 *
 * Needs a build first (`nx build ui`) — it drives `dist/`, not source.
 * Run: `npm run test:message-text-token` inside packages/ui.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /message-text-token\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:6211',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 900, height: 700 },
        launchOptions: { args: ['--disable-dev-shm-usage', '--no-sandbox'] },
      },
    },
  ],
  webServer: {
    command: 'node tests/e2e/focus-ring-harness-server.mjs',
    url: 'http://localhost:6211/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: { FOCUS_RING_PORT: '6211' },
  },
});
