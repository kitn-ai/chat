import { defineConfig } from '@playwright/test';

// The conformance harness drives the REAL app in a real browser. It has to: the
// behaviours under test (a disclosure surviving a delta, parts rendering in
// stream order, a card resolving) are layout facts, and jsdom cannot see any of
// them.
//
// The dev server is started here rather than assumed, so `mode=replay` needs
// nothing but a checkout — no key, no network. A `mode=live` run needs a key the
// server picks up on its own (see HARNESS.md); the harness never handles it.
const PORT = Number(process.env.SPIKE_PORT || 5177);

export default defineConfig({
  testDir: '.',
  testMatch: process.env.SPIKE_TESTMATCH ? new RegExp(process.env.SPIKE_TESTMATCH) : /scenarios\.spec\.ts/,
  // One scenario at a time. They share a dev server, a fixture directory and (in
  // live mode) a rate limit, and a flaky harness is worth less than a slow one.
  workers: 1,
  fullyParallel: false,
  // No retries, deliberately. A scenario that passes on the second attempt is
  // information, and swallowing it is how a suite starts proving nothing.
  retries: 0,
  timeout: 120_000,
  reporter: process.env.CI ? [['list'], ['json', { outputFile: 'harness-report.json' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 1400 },
  },
  webServer: {
    command: 'pnpm exec vite --port ' + PORT + ' --strictPort',
    cwd: '..',
    url: `http://localhost:${PORT}/api/config`,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
