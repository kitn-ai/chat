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

export const TEST_TIMEOUT_BUDGETS: readonly TestTimeoutBudget[] = [
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
