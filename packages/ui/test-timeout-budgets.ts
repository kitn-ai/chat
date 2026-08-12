/**
 * Per-file test-timeout budgets for the `unit` project.
 *
 * WHY THIS EXISTS
 *
 * Vitest's default per-test budget is 5000ms, and for 2400-odd tests in this
 * suite that is enormously generous: the 99th-percentile test finishes in well
 * under a second. A handful of files are different in kind, not degree — they
 * invoke a TypeScript compiler, or transform a heavy module graph, INSIDE a
 * test body. Their real work is seconds, so the default budget leaves them
 * almost no margin, and under a loaded machine (parallel agents, a busy CI
 * runner, a `-j` build in another terminal) they blow it and the suite goes
 * red for a reason that has nothing to do with the code under test.
 *
 * A suite with known-flaky files trains everyone to discount red, so the point
 * of this table is to make the red trustworthy again WITHOUT going permissive
 * everywhere. Each entry is an explicit, justified exception; every other file
 * keeps the strict 5000ms default, where it is still a meaningful hang
 * detector.
 *
 * MEASURED, not guessed. Numbers below are the file's slowest single test on
 * an IDLE 10-core machine (9 vitest forks, the default), and what it did under
 * synthetic CPU starvation (32 spinning processes on those same 10 cores):
 *
 *   file                          idle     starved
 *   element-types-lib-check       3766ms   6045ms  (blew the 5s budget)
 *   inline-element-types           967ms   1633ms
 *   variant-aurora                 272ms   TIMEOUT
 *   variant-wave                   334ms   TIMEOUT
 *   variant-custom                 246ms   TIMEOUT
 *   highlighter                    277ms    841ms
 *   emitted-card-path.live        9635ms  32621ms  (blew a 30s INLINE budget)
 *
 * That last row is the reason a 30-second budget is not enough for it, and it
 * could only be measured by REMOVING the inline 30000 it used to carry: with
 * the cap in place both starved runs stopped at the cap and reported 30004ms,
 * which reads as "just over" and hides that the real cost is 32.6s. The number
 * above is what it actually costs when starved, not where it was truncated.
 *
 * One caveat on that row's idle figure, since the rest of the column is honest
 * about its conditions. It was taken at a 1-minute load average of 11.5 — the
 * quietest window that opened in 45 minutes on a machine running a pool of
 * parallel agents — not at true idle, and its starved runs stack the 32
 * spinners on top of that same residual load. So 9635ms is a slight OVER-
 * estimate of idle and 32621ms a slight over-estimate of starved. Both err
 * toward caution, which is the right direction for a budget.
 *
 * `element-types-lib-check` is the clearest case: it spends 75% of the default
 * budget on an idle machine with zero contention, so it needs only a 33%
 * slowdown to fail. The shader-variant files are the subtler one — their own
 * logic is a few hundred milliseconds, but they `await import()` the variant
 * module, `shader-canvas` and a `.glsl` asset from inside the test body, and
 * that transform cost is charged to the TEST's budget rather than to setup.
 *
 * ADDING AN ENTRY IS A SMELL, NOT A ROUTINE. If a test needs more than five
 * seconds, the first question is whether it should be doing that work at all.
 * These earn it: the tsc files are guards that must genuinely compile, and the
 * shader files must genuinely load their real module graph. A test that is
 * slow because it sleeps or polls does NOT belong here — fix the test.
 *
 * `emitted-card-path.live` is the entry to be uneasy about, so read this before
 * adding its neighbour. It passes the stated test — its 9.6s is a real Vite
 * transform of a real module graph, and its polling is bounded at ~1.05s by
 * construction (a 100x10ms loop that breaks on the second round), so under a
 * tenth of the cost and NOT the reason it is slow. But it costs 2.5x the next
 * slowest file here and is the only entry that needs more than 30 seconds, and
 * that is a fact about where it lives rather than about the test: it RUNS
 * emitted consumer code end to end, which is an integration test wearing a unit
 * test's filename. The honest fix is a separate vitest project for run-the-
 * emitted-code guards, with its own budget, so the `unit` default stays a
 * meaningful hang detector. That needs `vitest.config.ts`, so it is recorded
 * here rather than done here. Do not read this entry as a precedent for
 * parking further multi-second integration work in `unit`.
 *
 * WHAT THIS CANNOT FIX. Only vitest's own per-test clock is raised here.
 * `waitFor` from @solidjs/testing-library carries its OWN, much tighter 1000ms
 * budget, so on a starved machine a `waitFor`-heavy file gives up long before
 * vitest's 5000ms and reports a plain assertion failure ("expected false to be
 * true") rather than a timeout. `audio-visualizer/index.test.tsx` fails that
 * way and is deliberately NOT listed: an entry here would look protective and
 * do nothing. Fix that shape at the call site with an explicit `waitFor`
 * timeout, not here.
 *
 * `test-timeout-budgets.test.ts` fails if an entry stops matching a real file,
 * so a rename cannot silently drop a file back to the default budget and
 * quietly reintroduce the flake.
 */
export interface TestTimeoutBudget {
  /** Package-relative path of the test file, as it appears under `packages/ui/`. */
  file: string;
  /** Per-test budget in milliseconds. */
  timeout: number;
  /** Why this file cannot do its work inside the default budget. */
  because: string;
}

/** A real `tsc` invocation is seconds of single-threaded CPU, not a unit test. */
const COMPILES_TYPESCRIPT = 30_000;

/**
 * Cold `await import()` of a heavy module graph from inside a test body: the
 * Vite transform lands on the test's budget, not on setup.
 */
const TRANSFORMS_A_MODULE_GRAPH = 20_000;

/**
 * Transforms a heavy module graph and then RUNS it, which is strictly more than
 * `TRANSFORMS_A_MODULE_GRAPH` buys: the emitted module is written to disk and
 * imported (pulling the whole `src/elements/chat` component tree plus `state`,
 * `wire` and `schemas` through Vite), then driven through a two-round streaming
 * tool loop against a mounted custom element.
 *
 * 60s is ~1.8x the worst MEASURED starved run (32621ms) and ~6x idle (9635ms).
 * The margin is deliberately stated rather than tuned: the number comes from
 * the measurement plus that multiplier, NOT from raising it until the file
 * stopped flaking, which would only ever track today's load.
 */
const TRANSFORMS_AND_RUNS_A_MODULE_GRAPH = 60_000;

export const TEST_TIMEOUT_BUDGETS: readonly TestTimeoutBudget[] = [
  {
    file: 'tests/agent-tooling/emitted-card-path.live.test.ts',
    timeout: TRANSFORMS_AND_RUNS_A_MODULE_GRAPH,
    because:
      'imports and RUNS the scaffolder emitted module — the whole elements/chat graph through Vite — then drives a two-round streaming tool loop over it; 9.6s idle, 32.6s starved',
  },
  {
    file: 'tests/elements/element-types-lib-check.test.ts',
    timeout: COMPILES_TYPESCRIPT,
    because:
      'runs ts.createProgram over element-types.d.ts with skipLibCheck:false and the full DOM lib — a real compile, 3.8s idle',
  },
  {
    file: 'src/elements/inline-element-types.test.ts',
    timeout: COMPILES_TYPESCRIPT,
    because:
      'compares the generated inline type block against the real sources with tsc, so it pays for a program per assertion',
  },
  {
    file: 'src/components/audio-visualizer/variant-aurora.test.tsx',
    timeout: TRANSFORMS_A_MODULE_GRAPH,
    because: 'await import()s variant-aurora + shader-canvas + aurora.glsl inside the test body',
  },
  {
    file: 'src/components/audio-visualizer/variant-wave.test.tsx',
    timeout: TRANSFORMS_A_MODULE_GRAPH,
    because: 'await import()s variant-wave + shader-canvas + wave.glsl inside the test body',
  },
  {
    file: 'src/components/audio-visualizer/variant-custom.test.tsx',
    timeout: TRANSFORMS_A_MODULE_GRAPH,
    because: 'await import()s variant-custom + shader-canvas inside the test body, once per assertion',
  },
  {
    file: 'tests/primitives/highlighter.test.ts',
    timeout: TRANSFORMS_A_MODULE_GRAPH,
    because: 'loads the real Shiki engine and its language grammars rather than a stub',
  },
];

/**
 * The budget for `testPath`, or `undefined` to leave it on the strict default.
 * Matches on a path suffix so it works with the absolute paths vitest reports.
 */
export function budgetFor(testPath: string): TestTimeoutBudget | undefined {
  const normalized = testPath.replaceAll('\\', '/');
  return TEST_TIMEOUT_BUDGETS.find((budget) => normalized.endsWith(budget.file));
}
