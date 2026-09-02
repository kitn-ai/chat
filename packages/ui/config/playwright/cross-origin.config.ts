import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 *
 * This is the one suite that cannot join either of the other two configs:
 * dev:host binds 6006, the same port Storybook binds, and `webServer` is a
 * TestConfig option rather than a TestProject one, so one config would start
 * both and they would collide. The WARNING above is the local form of the same
 * fact.
 *
 * Run: `npm run test:e2e` inside packages/ui. There is no longer a
 * `playwright.config.ts` at the package root, so a bare `playwright test` has no
 * default config and fails loudly instead of silently picking a suite.
 */

// NOT `__dirname`. The vite configs next door use it and get away with it
// because Vite transpiles a config to CJS before running it; Playwright's TS
// loader keeps this an ES module (packages/ui is "type": "module"), so
// `__dirname` is undefined and the config throws before a single test runs.
const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  // Relative to THIS FILE: Playwright resolves testDir against the config's own
  // directory, not the cwd.
  testDir: '../../tests/e2e',
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
      // cwd is REQUIRED: Playwright defaults webServer.cwd to the config file's
      // own directory, and `npm run dev:host` does not exist under
      // config/playwright/.
      cwd: PKG,
      command: 'npm run dev:host',
      url: 'http://localhost:6006',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      cwd: PKG,
      command: 'npm run dev:provider',
      url: 'http://localhost:6007',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
