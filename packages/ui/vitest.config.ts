import { defineConfig } from 'vitest/config';
import solidPlugin from 'vite-plugin-solid';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// Makes `*.css?raw` and `*.css?inline` imports return real file content in vitest.
// Vitest has a built-in "vitest:css-empty-post" (enforce: post) that converts all
// CSS imports to `export default ""` in non-browser environments.  We bypass it by:
//   1. Adding css.include for compiled.css so vitest skips its CSS interception for it.
//   2. Adding this post-enforce plugin that reads the file and injects the raw content.
function cssRawPlugin() {
  return {
    name: 'css-raw-for-vitest',
    enforce: 'post' as const,
    transform(_code: string, id: string) {
      if (/\.css\?(raw|inline)(&|$)/.test(id)) {
        const filePath = id.replace(/\?(raw|inline).*$/, '');
        const content = readFileSync(filePath, 'utf-8');
        return { code: `export default ${JSON.stringify(content)};`, map: null };
      }
    },
  };
}

// Two Vitest projects:
//   • (default) jsdom unit tests
//   • `storybook` — every *.stories.tsx runs as a browser test (play functions,
//     smoke render, and axe a11y) via @storybook/addon-vitest + Playwright.
//
// Run them:
//   npm test               # all projects (unit + storybook)
//   npm run test:storybook # stories-as-tests only (vitest run --project=storybook)
//
// a11y-in-test: @storybook/addon-a11y is registered in .storybook/main.ts and
// the default `a11y.test` is set in .storybook/preview.ts (currently 'error' =
// a11y violations FAIL the run; 'todo' would make them non-failing warnings).
//
// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [cssRawPlugin(), solidPlugin()],
  test: {
    // Allow ?raw / ?inline imports of compiled.css to pass through vitest's CSS interception.
    // vitest:css-disable and vitest:css-empty-post skip files matched by css.include.
    css: {
      include: [/compiled\.css/],
    },
    projects: [{
      extends: true,
      test: {
        name: 'unit',
        environment: 'jsdom',
        globals: true,
        // The per-test budget stays at vitest's strict 5000ms default for all
        // ~215 files. A named handful genuinely cannot fit it -- they invoke
        // tsc, or transform a heavy module graph, inside a test body -- and
        // this setup file grants those an explicit, justified, PER-FILE
        // exception instead of loosening the budget for everything.
        //
        // Deliberately not a raised global `testTimeout`: on a suite whose
        // 99th-percentile test is under a second, 5000ms is already a weak
        // hang detector, and raising it everywhere to accommodate one 3.8s
        // compile makes every genuine hang that much slower to surface while
        // hiding the fact that a few files do very expensive work. See
        // `test-timeout-budgets.ts` for the measurements and the per-file
        // reasons.
        setupFiles: ['./vitest.setup.timeouts.ts'],
        // Worker count is deliberately left at vitest's default, but if this
        // suite is flaking or crawling on YOUR machine, `--maxWorkers=4` is
        // very likely the answer. Measured here on a 10-core box, same suite,
        // same synthetic load (32 spinning processes):
        //
        //                       wall     failures
        //   default (9 forks)   395.6s   6
        //   --maxWorkers=4      257.6s   0
        //
        // Faster AND clean, which is counter-intuitive until you look at where
        // the time goes: aggregate `import` was 558s across 9 forks versus
        // 255s across 4. Nine jsdom forks on ten cores thrash the transform
        // pipeline rather than sharing it, so cutting workers removes more
        // contention than it removes parallelism. On an idle machine the same
        // flag costs only ~12% (94.1s -> 105.6s).
        //
        // NOT encoded as config on purpose: that is a result about one
        // machine's core count, not about this repo. A hard `maxWorkers: 4`
        // would FORCE oversubscription on a 2-4 core CI runner, and '50%'
        // would halve parallelism there for contention that runner does not
        // have. Reach for the flag locally; leave the repo neutral.
        // React wrapper tests run under @vitejs/plugin-react via the separate
        // vitest.react.config.ts (`npm run test:react`). They MUST be excluded
        // here, or the global Solid JSX transform would mis-compile their React
        // JSX ("Comp is not a function").
        // `.claude/**` holds throwaway agent git worktrees (full repo copies);
        // their duplicated test files must never be collected by the main run.
        // `tests/e2e/**` are standalone Playwright specs (`npm run test:e2e`), NOT
        // vitest tests — collecting them throws "test() called here" under vitest.
        exclude: ['**/node_modules/**', '**/.claude/**', 'tests/react/**', '**/tests/react/**', 'tests/e2e/**', '**/tests/e2e/**']
      }
    }, {
      extends: true,
      plugins: [
      // The plugin will run tests for the stories defined in your Storybook config
      // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
      storybookTest({
        configDir: path.join(dirname, '.storybook')
      })],
      test: {
        name: 'storybook',
        // Browser-runner CI flake mitigation: under parallel load the Vite dev
        // server occasionally drops a dynamic module ("Failed to fetch
        // dynamically imported module") or a chromium instance blips. These are
        // transient — retry the story before failing the run. Scoped to this
        // project only; the jsdom unit project stays retry-free (deterministic).
        retry: 2,
        // The deeper flake is a WHOLE-RUNNER crash, not a per-test failure: the
        // single chromium instance gets overwhelmed running ~118 story files in
        // parallel and the connection drops mid-suite ("[birpc] rpc is closed",
        // "Browser connection was closed") — `retry` can't recover that. Run the
        // story files SEQUENTIALLY so only one file's worth of render + play +
        // axe work hits the browser at a time. Slower, but it keeps chromium
        // under its memory/concurrency ceiling on GitHub runners. Scoped to this
        // project; the jsdom unit project keeps its default parallelism.
        fileParallelism: false,
        // NOTE: we deliberately do NOT set a custom `setupFiles` with
        // `setProjectAnnotations` here. Since Storybook 10.3, @storybook/addon-vitest
        // auto-provisions the project annotations from `.storybook/main.ts` +
        // `.storybook/preview` via a virtual module — and that path is the only one
        // that also wires the SolidJS renderer's `renderToCanvas`. Supplying our own
        // `setProjectAnnotations` (which the framework package can't fully reconstruct)
        // breaks rendering. The a11y addon is registered in `main.ts` addons, so its
        // annotations are picked up by the same auto-provisioning — axe runs per-story.
        browser: {
          enabled: true,
          headless: true,
          provider: playwright({}),
          instances: [{
            browser: 'chromium',
            // CI hardening: chromium crashes ("Browser connection was closed /
            // rpc is closed") partway through the story suite when it exhausts
            // the runner's memory / the tiny default /dev/shm on GitHub runners,
            // and a renderer page dies — which aborts the whole runner (not a
            // retryable per-test failure). Give the renderer more headroom and
            // stop it from being killed under load. No-op locally; required on CI.
            launchOptions: {
              args: [
                '--disable-dev-shm-usage', // route shared memory to /tmp (default /dev/shm is tiny on runners)
                '--no-sandbox',
                '--disable-gpu', // headless CI has no GPU; avoids the GPU process + its memory
                '--disable-software-rasterizer',
                '--disable-background-timer-throttling', // keep the test page fully alive when "backgrounded"
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=CalculateNativeWinOcclusion,BackForwardCache',
                '--js-flags=--max-old-space-size=2048', // each shard is ~28 files; lower cap forces earlier GC
              ],
            },
          }]
        }
      }
    }]
  }
});
