import { defineConfig, devices } from '@playwright/test';

/**
 * Standalone config for the content/chrome brand-bleed guard
 * (`content-brand-bleed.spec.ts`) — the sweep that closed reasoning.tsx,
 * loader.tsx (terminal + loading-dots), prompt-suggestion.tsx, file-tree.tsx,
 * and source.tsx's hardcoded `text-primary` (the same class of defect as the
 * user-message-text fix in `message-text-token.spec.ts`).
 *
 * Reuses `focus-ring-harness-server.mjs` verbatim, own port: a bare page that
 * loads only the built `dist/kai.es.js` bundle with NO document-level
 * Tailwind, because only the real cascade proves what a branded
 * `--kai-color-primary` resolves to inside a shadow root — same reasoning as
 * every other guard in this family.
 *
 * Needs a build first (`nx build ui`) — it drives `dist/`, not source.
 * Run: `npm run test:content-brand-bleed` inside packages/ui.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /content-brand-bleed\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:6212',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 900, height: 800 },
        launchOptions: { args: ['--disable-dev-shm-usage', '--no-sandbox'] },
      },
    },
  ],
  webServer: {
    command: 'node tests/e2e/focus-ring-harness-server.mjs',
    url: 'http://localhost:6212/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: { FOCUS_RING_PORT: '6212' },
  },
});
