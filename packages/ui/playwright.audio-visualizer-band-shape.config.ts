import { defineConfig, devices } from '@playwright/test';

/**
 * Config for `tests/e2e/audio-visualizer-band-shape.spec.ts` — the
 * centre-outward band-mirror regression guard (see the HANDOFF doc, section
 * 3, and commit 3f34a45).
 *
 * Deliberately a SEPARATE config from `playwright.audio-visualizer.config.ts`,
 * not a reuse of it: that config's `baseURL` and `webServer` both target port
 * 6006, which belongs to the MAIN checkout's Storybook, not this worktree's.
 * This one targets port **6018** instead — never 6006.
 *
 * `webServer` below mirrors `playwright.audio-visualizer.config.ts`'s own
 * pattern (`reuseExistingServer: true`) rather than omitting it: an earlier
 * draft of this config had NO `webServer` block at all, on the theory that a
 * dev server would always already be running out-of-band for whoever runs
 * this file. That is true for the session that just used it, but makes the
 * config silently unusable — a bare `connection refused` with no hint why —
 * for anyone else (a fresh session, CI, Rob running it directly). With
 * `reuseExistingServer: true`, BOTH cases work with the exact same command:
 * if a server is already listening on 6018 (this worktree's, confirmed via
 * `/index.json` before relying on it), Playwright reuses it as-is and never
 * restarts or tears it down; if nothing is listening, Playwright starts one
 * itself from the command below and stops it after the run.
 *
 * The command deliberately does NOT reuse the `storybook` npm script
 * (`packages/ui/package.json`'s `"storybook": "npm run build:css &&
 * storybook dev -p 6006"`) — that hardcodes port 6006, and relying on a
 * trailing `-p 6018` argument to silently override an earlier `-p 6006`
 * already baked into the script is the kind of undocumented CLI
 * last-flag-wins behaviour that is easy to get wrong across storybook
 * versions. This spells out the equivalent command explicitly instead.
 *
 * To start the server yourself first (optional — `webServer` above handles
 * it either way): `cd packages/ui && npm run build:css && npx storybook dev
 * -p 6018 --ci --quiet`.
 *
 * Run: `pnpm --filter @kitn.ai/ui exec playwright test --config playwright.audio-visualizer-band-shape.config.ts`
 */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /audio-visualizer-band-shape\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  reporter: 'list',
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:6018',
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
          args: ['--disable-dev-shm-usage', '--no-sandbox'],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run build:css && npx storybook dev -p 6018 --ci --quiet',
    url: 'http://localhost:6018/iframe.html',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
