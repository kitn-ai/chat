import { defineConfig, devices } from '@playwright/test';

/**
 * Standalone IVP config for `<kai-audio-visualizer>` — the final, once-at-the-
 * end-of-the-epic browser verification (Task 18). Drives the REAL custom
 * element (not just the Solid component) rendered by the Storybook dev
 * server: shadow DOM, `defineWebComponent`'s theme wiring, the dynamic
 * shader-chunk import boundary, and live WebGL, none of which jsdom can
 * exercise.
 *
 * Storybook static builds tree-shake the kai-* registration away, so this
 * MUST run against `pnpm dev` (port 6006), never `storybook-static`.
 *
 * `deviceScaleFactor: 2` gives sharper screenshots for the translucent-edge
 * zoom-in inspection (check 3) — a plain 1x capture is too soft to judge a
 * one-or-two-pixel fringe.
 *
 * Run: `pnpm --filter @kitn.ai/ui exec playwright test --config playwright.audio-visualizer.config.ts`
 */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /audio-visualizer-ivp\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:6006',
    trace: 'off',
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 2,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--disable-dev-shm-usage',
            '--no-sandbox',
            // Lets the WAV `<audio>` element and the Web Audio graph in
            // check 8 actually play without a synthetic user gesture.
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run storybook -- --ci --quiet',
    url: 'http://localhost:6006/iframe.html',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
