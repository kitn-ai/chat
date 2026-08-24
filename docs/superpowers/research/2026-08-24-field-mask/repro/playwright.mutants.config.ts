import { defineConfig, devices } from '@playwright/test';

/**
 * Standalone IVP config for the input masker — the same arrangement every other
 * IVP in this family uses (playwright.menu / composer / command / slots).
 *
 * IT LIVES HERE, NOT IN `packages/ui/`, ONLY BECAUSE OF THE TASK-6 WRITER LOCK
 * (spec file + this evidence dir). To LAND it, copy this file to
 * `packages/ui/playwright.input-mask.config.ts` — dropping the `testDir` /
 * `cwd` overrides below, which exist purely to reach back into `packages/ui`
 * from here — and add
 *   "test:input-mask-ivp": "playwright test --config playwright.input-mask.config.ts"
 * to `packages/ui/package.json`, beside `test:menu-ivp`.
 *
 * Not in CI, deliberately: the required `test` job runs none of this family,
 * and the root `playwright.config.ts` testMatches only `remote-element.spec.ts`.
 *
 * Run from here:
 *   npx playwright test --config .superpowers/sdd/2026-08-24-form-field-formats/t6-evidence/playwright.input-mask.config.ts
 */
const UI = new URL('../../../../../packages/ui/', import.meta.url).pathname;

export default defineConfig({
  testDir: new URL('.', import.meta.url).pathname,
  testMatch: /mutants\.spec\.ts/,
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
    cwd: UI,
    url: 'http://localhost:6006/iframe.html',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
