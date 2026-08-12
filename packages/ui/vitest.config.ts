import { defineConfig } from 'vitest/config';
import solidPlugin from 'vite-plugin-solid';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import {
  EMITTED_CODE_TESTS,
  EMITTED_CODE_TESTS_EXCLUDE,
  EMITTED_CODE_TIMEOUT,
  EMITTED_PROJECT,
} from './emitted-code-tests';
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

// Three Vitest projects:
//   • `unit` — jsdom unit tests, the fast inner loop
//   • `emitted` — run-the-emitted-code guards: they write the `kai` MCP scaffolder's
//     output to a real module and EXECUTE it, so they are integration tests and cost
//     seconds each. Split out of `unit` so its 5000ms default stays a meaningful hang
//     detector; see `emitted-code-tests.ts` for the measurements and the budget.
//   • `storybook` — every *.stories.tsx runs as a browser test (play functions,
//     smoke render, and axe a11y) via @storybook/addon-vitest + Playwright.
//
// Run them:
//   npm test                             # all projects (unit + emitted + storybook)
//   vitest run --project=unit            # the fast inner loop
//   vitest run --project=emitted         # the emitted-code guards
//   npm run test:storybook               # stories-as-tests only
//
// a11y-in-test: @storybook/addon-a11y is registered in .storybook/main.ts and
// the default `a11y.test` is set in .storybook/preview.ts (currently 'error' =
// a11y violations FAIL the run; 'todo' would make them non-failing warnings).
//
// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [cssRawPlugin(), solidPlugin()],
  // `@kitn.ai/ui/schemas` -> src, for the test run ONLY.
  //
  // src/agent-tooling/mcp/ imports the schemas barrel by its PUBLIC specifier
  // (manifest.ts, tools/reference.ts, reference.test.ts) rather than by a relative
  // path, deliberately: the MCP emits that specifier into scaffolded routes, so
  // writing it here is what keeps the emitted form and the compiled form the same
  // string. The cost is that Node/Vite resolve it through the package `exports`
  // map to ./dist/schemas.js, which does not exist until `nx build ui` has run.
  // On a fresh clone or worktree that made 2 files fail to COLLECT --
  // reference.test.ts (direct) and server.test.ts (transitively, via
  // tools/reference.ts) -- with "Failed to resolve import", which reads as a
  // broken checkout rather than a missing build step. Same shape as the
  // compiled.css trap documented in CLAUDE.md, and it cost two people a debug
  // session each before it was written down.
  //
  // THIS DOES NOT WEAKEN THE EXPORTS MAP. It rewrites the specifier for vitest and
  // nothing else: the library builds (vite.config.mcp.ts bundles the MCP against
  // the BUILT dist/schemas.js, which vite.config.schemas.ts emits one step earlier
  // in the `build` script) never load this file, and neither does any consumer.
  // The consumer resolution path stays guarded by verify:schemas, verify:ssr,
  // verify:tool-schemas, verify:dts / verify:dts:consumer and verify:consumer,
  // every one of which reads the BUILT entry through the exports map from outside
  // the repo. If the `./schemas` key regressed, those still fail; only this run
  // would keep working, and it is not the check that covers them.
  //
  // Anchored with ^...$ instead of a bare string on purpose: Vite's string aliases
  // match by PREFIX, so '@kitn.ai/ui/schemas' would also capture the real
  // './schemas/*' subpath (@kitn.ai/ui/schemas/confirm.schema.json) and rewrite it
  // to a path inside index.ts. The regex matches the barrel and only the barrel.
  resolve: {
    alias: [
      {
        find: /^@kitn\.ai\/ui\/schemas$/,
        replacement: path.resolve(dirname, 'src/schemas/index.ts'),
      },
    ],
  },
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
        // EMITTED_CODE_TESTS_EXCLUDE hands the run-the-emitted-code guards to the
        // `emitted` project below. Same constant on both sides, used in opposite
        // directions, so the include and the exclude cannot drift into a file that
        // runs twice or a file that runs nowhere.
        exclude: ['**/node_modules/**', '**/.claude/**', 'tests/react/**', '**/tests/react/**', 'tests/e2e/**', '**/tests/e2e/**', ...EMITTED_CODE_TESTS_EXCLUDE]
      }
    }, {
      extends: true,
      test: {
        // Run-the-emitted-code guards. They take what the `kai` MCP scaffolder emits
        // into a consumer's repo, write it to a real module and EXECUTE it — the only
        // layer that can tell a working emit from a plausible-looking one, and by
        // construction seconds of Vite transform plus a driven streaming loop rather
        // than milliseconds of assertion.
        //
        // Same jsdom environment and the same plugins as `unit` (hence `extends`),
        // deliberately NOT a separate config file like vitest.react.config.ts: that
        // one exists because React tests need a different JSX transform, and these
        // need exactly the Solid one `unit` already has. What differs is the BUDGET,
        // which is a project, not a config.
        //
        // No `setupFiles`. `vitest.setup.timeouts.ts` applies the per-file exceptions
        // in `test-timeout-budgets.ts`, which are a device for keeping ONE strict
        // default honest in a suite of ~2600 fast tests. There is no strict default to
        // protect here, so the budget is stated once for the project.
        name: EMITTED_PROJECT,
        environment: 'jsdom',
        globals: true,
        include: [EMITTED_CODE_TESTS],
        testTimeout: EMITTED_CODE_TIMEOUT,
        hookTimeout: EMITTED_CODE_TIMEOUT,
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
          // This block used to be a nine-flag "CI hardening" list, and none of it
          // ran. `launchOptions` belongs to the PROVIDER, not to a browser
          // instance: @vitest/browser-playwright reads `this.options.launchOptions`
          // off the object passed to `playwright()` and spreads exactly that into
          // `playwright.chromium.launch()`, so an instance-level `launchOptions` is
          // read by nobody. It sat on the instance until 2026-08-12.
          //
          // Nothing caught it, and the reason is worth keeping: the block never did
          // that work, but the work was being done. Playwright's own chromium
          // defaults already pass --disable-dev-shm-usage (the /dev/shm fix the old
          // comment led with), --disable-background-timer-throttling,
          // --disable-backgrounding-occluded-windows, --disable-renderer-backgrounding
          // and --no-sandbox. Five of the nine flags were exact duplicates of
          // playwright's list, so their absence could never show up as a symptom —
          // and their PRESENCE in `ps` could never show up as proof either. Deleted
          // as duplicates rather than kept as belt-and-braces; if a playwright bump
          // ever drops one, re-check `chromiumSwitches` in
          // playwright-core/lib/coreBundle.js, which is where that list lives.
          //
          // Three more were deleted because they had never once run and each
          // measured harmful the moment it did — see the notes below.
          //
          // That leaves --disable-gpu: the one flag here that is genuinely ours.
          // Verify it actually arrives with `node scripts/probe-browser-launch-args.mjs`,
          // which reads the argv of the chromium a real storybook run launches and
          // judges only flags playwright does not set by itself (0/1 before this
          // moved to the provider, 1/1 after).
          provider: playwright({
            launchOptions: {
              args: [
                // Kept, but be honest about its standing: UNVERIFIED on the platform
                // that matters, and disproven on the one that was measurable.
                //
                // The claim is that headless CI has no GPU, so this avoids a GPU
                // process and its memory. On macOS chrome-headless-shell it does not:
                // `node scripts/probe-disable-gpu-effect.mjs` counts ONE
                // --type=gpu-process child with the flag and one without, and the WebGL
                // renderer string is byte-identical SwiftShader either way. The flag
                // changes nothing observable here.
                //
                // That is not grounds to delete it, because a macOS measurement cannot
                // settle a claim about ubuntu-latest, which is where CI runs and where
                // the flag has never been measured. It IS grounds to stop calling it
                // required. Retained as not-disproven-where-it-matters, no stronger.
                // If someone gets a reading on a real runner, act on it — including by
                // deleting this, which would empty the list. The probe handles that
                // case and passes vacuously rather than failing; do not keep a flag
                // alive to give the probe something to check.
                '--disable-gpu',

                // NO '--disable-software-rasterizer'. It used to sit here, inert.
                // The moment it became live it removed WebGL: --disable-gpu alone
                // still leaves SwiftShader ("ANGLE (Google, Vulkan 1.3.0 (SwiftShader
                // Device), SwiftShader driver)"), and the two together leave nothing,
                // so `canvas.getContext('webgl')` returns null. Measured by
                // `node scripts/probe-webgl-under-flags.mjs`, which bisects the list.
                // That is not a crash — audio-visualizer's wave/aurora/custom variants
                // "fall back to bars if WebGL is unavailable", so those stories would
                // go on PASSING while silently exercising the bar path and never the
                // shader path they exist to cover.

                // NO '--disable-features=...' here. Playwright's own defaults already
                // pass one (16 names it disables for test determinism: PaintHolding,
                // Translate, HttpsUpgrades, RenderDocument, ...) and it appends our
                // args AFTER its own, so a second `--disable-features` does not extend
                // that list — chromium keeps the LAST duplicate switch and drops the
                // first, so ours would REPLACE all 16. Verified, not assumed:
                // `node scripts/probe-duplicate-switch.mjs` passes --user-agent twice
                // and the browser reports the second. The two names this used to pass
                // were dead weight anyway: BackForwardCache is already covered by
                // playwright's dedicated `--disable-back-forward-cache`, and
                // CalculateNativeWinOcclusion is Windows-only (CI is ubuntu-latest).
                // NO '--js-flags=--max-old-space-size=2048' either. It was written to
                // "give the renderer more headroom" and measures as the exact
                // opposite.
                //
                // THE LOAD-BEARING EVIDENCE, and the only thing anyone should cite
                // here: `node scripts/probe-heap-cap.mjs` reads
                // performance.memory.jsHeapSizeLimit straight out of the renderer —
                // 3586 MB without the flag, 2222 MB with it. Chromium's own default
                // ceiling is already ABOVE 2048, so the cap can only make the renderer
                // OOM sooner, which is the mid-suite "Browser connection was closed"
                // crash this block exists to prevent. That is a direct reading of the
                // thing being claimed, and it does not depend on a sample.
                //
                // DO NOT CITE THIS NEXT NUMBER AS THOUGH IT SETTLED ANYTHING. One bare
                // full local run each got 77/115 files through with the flags inert and
                // 57/115 with them live. Suggestive, and consistent with the reading
                // above, but n=1 per side and the bare full run ALWAYS dies eventually
                // on a known per-file harness leak — which is why CI sub-shards via
                // scripts/run-storybook-tests.mjs and never runs it this way. It cannot
                // distinguish anything on its own; it is corroboration or it is noise.
              ],
            },
          }),
          instances: [{
            browser: 'chromium',
          }]
        }
      }
    }]
  }
});
