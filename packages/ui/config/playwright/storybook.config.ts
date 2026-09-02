import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The nine Storybook-driven browser suites, one project each, one Storybook
// server for all of them.
//
// WHY THESE NINE AND NOT ALL FOURTEEN: `webServer` is a TestConfig option, not
// a TestProject one, so a single config starts every listed server on every
// run. Two of the fourteen bind port 6006 and would collide: Storybook (here)
// and dev:host (config/playwright/cross-origin.config.ts). The three paint
// guards plus hover-card run against bare harness servers and live in
// config/playwright/bare.config.ts. Port conflict is what draws the file
// boundaries, and it is the only thing that does.
//
// KAI_SB_PORT: playwright.audio-visualizer-band-shape.config.ts existed
// entirely because a worktree's run must not attach to the PARENT checkout's
// Storybook on 6006, so it hardcoded 6018. That need is real and it is now
// config-wide: set KAI_SB_PORT once and every suite here moves together,
// instead of one suite having an escape hatch the other eight lack.
//
// The webServer command spells storybook out rather than reusing the
// `storybook` npm script, which hardcodes `-p 6006`. Relying on a trailing
// `-p` to override an earlier one is undocumented last-flag-wins behaviour
// that changes across storybook versions.
//
// HOW TO READ THE PER-PROJECT COMMENTS BELOW: each one moved here VERBATIM
// from the config file it came from, so several still name paths like
// `playwright.composer.config.ts` and still say things like "Self-contained:
// starts Storybook on :6006". None of those files exists any more, and the
// server is started once for the whole config rather than per suite. The
// decoder is mechanical: the deleted `playwright.<name>.config.ts` is the
// project named `<name>` here. Each block carries a `Run (current):` line as
// its first line, which is the command that works today; a `Run:` line further
// down is the historical one from the deleted file, kept so the reasoning
// around it stays unedited.

// NOT `__dirname`. The vite configs next door use it and get away with it
// because Vite transpiles a config to CJS before running it; Playwright's TS
// loader keeps this an ES module (packages/ui is "type": "module"), so
// `__dirname` is undefined and the config throws before a single test runs.
const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = process.env.KAI_SB_PORT ?? '6006';
const BASE = `http://localhost:${PORT}`;

const CHROMIUM = {
  ...devices['Desktop Chrome'],
  launchOptions: { args: ['--disable-dev-shm-usage', '--no-sandbox'] },
};

// Storybook compiles each story on first load (Vite on-demand). A generous
// ceiling tolerates the cold compile while returning as soon as the assertion
// passes on warm runs.
const COLD_COMPILE = { timeout: 30_000 };

export default defineConfig({
  // Relative to THIS FILE: Playwright resolves testDir against the config's
  // own directory, not the cwd.
  testDir: '../../tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: BASE, trace: 'off' },
  projects: [
    {
      /*
       * Run (current): `npm run test:composer-ivp`
       *
       * Standalone IVP config for <kai-composer>. Drives the REAL element rendered by
       * Storybook (same-origin) in Chromium with native keyboard events — proving the
       * contenteditable / trigger-menu / atomic-pill / submit-payload behavior that
       * jsdom and synthetic userEvent cannot.
       *
       * Self-contained: starts Storybook on :6006 (reusing an already-running one).
       * Run: `npx playwright test --config playwright.composer.config.ts`
       */
      name: 'composer',
      testMatch: /composer-ivp\.spec\.ts/,
      retries: process.env.CI ? 1 : 0,
      expect: COLD_COMPILE,
      use: CHROMIUM,
    },
    {
      /*
       * Run (current): `npm run test:slots-ivp`
       *
       * Standalone IVP config for the SPIKE <kai-chat> slotted-shell composition slots. Drives the
       * REAL element rendered by Storybook (same-origin) in Chromium, asserting that
       * consumer light-DOM is assigned to the shadow slots and screenshotting each
       * composition pattern (inject / replace / data-flow wall).
       *
       * Self-contained: starts Storybook on :6006 (reusing an already-running one).
       * Run: `npx playwright test --config playwright.slots.config.ts`
       */
      name: 'slots',
      testMatch: /(chat|promptinput)-slots-ivp\.spec\.ts/,
      retries: 0,
      expect: COLD_COMPILE,
      use: CHROMIUM,
    },
    {
      /*
       * Run (current): `npm run test:menu-ivp`
       *
       * Standalone IVP config for the cascading-menu primitives (Dropdown + submenu,
       * separator, checkbox item, label). Drives the REAL story rendered by Storybook
       * (same-origin) in Chromium with native pointer/keyboard events — proving the
       * portal positioning, submenu open/close, and checkbox toggle that jsdom cannot.
       *
       * Self-contained: starts Storybook on :6006 (reusing an already-running one).
       * Run: `npx playwright test --config playwright.menu.config.ts`
       */
      name: 'menu',
      testMatch: /menu-ivp\.spec\.ts/,
      retries: process.env.CI ? 1 : 0,
      expect: COLD_COMPILE,
      use: CHROMIUM,
    },
    {
      /*
       * Run (current): `npm run test:command-ivp`
       *
       * Standalone IVP config for the `<kai-command>` grouped filterable
       * command/mention palette. Drives the REAL MentionPicker story rendered by
       * Storybook (same-origin) in Chromium with native pointer/keyboard events —
       * proving grouping, search filtering, ArrowDown/Up+Enter keyboard nav, and
       * kai-select / kai-query-change CustomEvent emission that jsdom cannot simulate
       * inside a Shadow DOM.
       *
       * Self-contained: starts Storybook on :6006 (reusing an already-running one).
       * Run: `npx playwright test --config playwright.command.config.ts`
       */
      name: 'command',
      testMatch: /command-ivp\.spec\.ts/,
      retries: process.env.CI ? 1 : 0,
      expect: COLD_COMPILE,
      use: CHROMIUM,
    },
    {
      /*
       * Run (current): `npm run test:input-mask-ivp`
       *
       * Standalone IVP config for the input masker — the same arrangement every other
       * IVP in this family uses (playwright.menu / composer / command / slots).
       *
       * Self-contained: starts Storybook on :6006 (reusing an already-running one).
       * Run: `npx playwright test --config playwright.input-mask.config.ts`
       */
      name: 'input-mask',
      testMatch: /input-mask-ivp\.spec\.ts/,
      retries: 0,
      expect: COLD_COMPILE,
      use: CHROMIUM,
    },
    {
      /*
       * Run (current): `SHOT=baseline|after npm run test:promptinput`
       *
       * Screenshot harness for the kai-prompt-input swap (textarea → composer).
       * Run: SHOT=baseline|after npx playwright test --config playwright.promptinput.config.ts
       */
      name: 'promptinput',
      testMatch: /promptinput-(shot|behavior|pills)\.spec\.ts/,
      retries: 0,
      expect: COLD_COMPILE,
      use: CHROMIUM,
    },
    {
      /*
       * Run (current): `npm run test:shot`
       *
       * Screenshot-artifact config: runs any `*.shot.spec.ts` against the REAL
       * Storybook-rendered elements to capture PNGs for visual review (NOT assertions).
       * Self-contained: starts Storybook on :6006 (reusing a running one).
       * Run: `npx playwright test --config playwright.shot.config.ts`
       */
      name: 'shot',
      testMatch: /\.shot\.spec\.ts$/,
      retries: 0,
      expect: COLD_COMPILE,
      use: CHROMIUM,
    },
    {
      /*
       * Run (current): `npm run test:audio-visualizer`
       *
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
      name: 'audio-visualizer',
      testMatch: /audio-visualizer-ivp\.spec\.ts/,
      retries: 0,
      timeout: 60_000,
      expect: { timeout: 15_000 },
      use: {
        ...CHROMIUM,
        viewport: { width: 1400, height: 1000 },
        deviceScaleFactor: 2,
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
    {
      /*
       * Run (current): `npm run test:audio-visualizer-band-shape`
       *
       * The hardcoded port 6018 the comment below is built around is gone: the
       * need it served is now the config-wide KAI_SB_PORT documented at the top
       * of this file, and a worktree sets it once for all nine projects.
       *
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
      name: 'audio-visualizer-band-shape',
      testMatch: /audio-visualizer-band-shape\.spec\.ts/,
      retries: 0,
      timeout: 90_000,
      expect: { timeout: 15_000 },
      use: {
        ...CHROMIUM,
        viewport: { width: 1400, height: 1000 },
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    // cwd is REQUIRED: Playwright defaults webServer.cwd to the config file's
    // own directory, which is config/playwright/, where `npm run build:css`
    // does not exist.
    cwd: PKG,
    command: `npm run build:css && npx storybook dev -p ${PORT} --ci --quiet`,
    url: `${BASE}/iframe.html`,
    // Reuse whatever is already listening. Both cases work with the same
    // command: an existing server is used as-is and never restarted or torn
    // down, and if nothing is listening Playwright starts one and stops it
    // after the run.
    reuseExistingServer: true,
    // The ceiling of the nine originals, which ranged from 120s to 180s. A
    // longer ceiling never fails a run that would have passed.
    timeout: 180_000,
  },
});
