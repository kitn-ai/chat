import { defineConfig, devices } from '@playwright/test';

/**
 * Standalone Playwright config for the REAL cross-origin Card-transport matrix
 * (NOT @vitest/browser-playwright). Two distinct origins are spun up so the
 * host↔provider postMessage handshake is genuinely cross-origin:
 *
 *   - host page   → http://localhost:6006   (examples/remote-host, Vite)
 *   - provider    → http://localhost:6007   (examples/remote-provider, Vite)
 *
 * The Storybook visual/interaction stories (src/elements/remote.stories.tsx) run
 * SAME-origin and are covered by `npm run test:storybook`; this suite is the
 * security matrix (origin/source/nonce pinning, auto-height, theme push, fallback)
 * that jsdom and same-origin Storybook can't prove.
 *
 * webServers use the pinned LOCAL vite bin (via npm scripts), never bare `npx`, for
 * hermetic CI. `reuseExistingServer:!CI` lets you keep `dev:host`/`dev:provider`
 * running locally while iterating.
 *
 * WARNING: `dev:host` and Storybook BOTH bind :6006 — do NOT run e2e locally while a
 * Storybook dev server is up, or Playwright (reuseExistingServer) will reuse Storybook
 * as the host and the suite will fail confusingly. Stop Storybook first.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  // This config exists ONLY for the cross-origin remote-card matrix (served by
  // dev:host/dev:provider below). The composer / prompt-input IVPs and the
  // *.shot specs need Storybook, so they run via their own projects in
  // config/playwright/storybook.config.ts (--project=composer, =promptinput,
  // =shot) — keep them out of this one.
  testMatch: /remote-element\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:6006',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev:host',
      url: 'http://localhost:6006',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:provider',
      url: 'http://localhost:6007',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
