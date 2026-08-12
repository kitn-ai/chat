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
 * THE NUMBERS BELOW ARE INVALIDATED. Read this before citing any of them.
 *
 * They were recorded between Aug 11 22:10 and Aug 12 10:05 local, and for that
 * entire window four orphaned `while :; do :; done` shells — CPU burners leaked
 * by a stale flake-hunting script and never reaped — were pinning four of this
 * box's ten cores continuously. This table landed inside that window (c6c83fe,
 * Aug 11 23:16 local), so the column headed `idle` was never measured on an idle
 * machine; it was measured on a box already down four cores. The `starved`
 * column is not "32 spinners" either, it is 32 spinners ON TOP OF that
 * pre-existing four-core deficit. Both columns are real observations of
 * something, but neither is the quantity its heading claims, and the header's
 * stated method is untrue in its first half.
 *
 * WHICH DIRECTION THE ERROR RUNS, because that decides how urgent this is.
 * Every figure was taken with LESS CPU available than the method claims, so
 * every figure is too HIGH, and any budget derived from them is too GENEROUS
 * rather than too tight. Nothing is newly flaky, no test is at risk, and no
 * budget needs raising. This is a truth problem, not a stability problem: the
 * reasoning written on top of these numbers is unsound even though the values
 * it produced are safe. That is also why nothing here was retuned in response.
 *
 * WHAT WOULD SETTLE IT: re-run the same method on a genuinely quiet machine.
 * Confirm the machine is quiet FIRST, because that is the step that was skipped
 * here — check the load average (`uptime`) and look for runaway processes
 * pinning cores (`ps -A -o %cpu,command | sort -rn | head`) BEFORE trusting any
 * timing number, not after one looks surprising. Deliberately NOT re-measured at
 * the time this was caught: the box was running several agents and was not quiet
 * either, and a second wrong number recorded confidently is worse than one
 * flagged as wrong.
 *
 * The original method, for whoever re-runs it: each figure is the file's slowest
 * single test, taken with 9 vitest forks (the default), then again under
 * synthetic CPU starvation from 32 spinning processes on 10 cores.
 *
 *   file                         "idle"   "starved"   BOTH SUSPECT — see above
 *   element-types-lib-check       3766ms   6045ms  (blew the 5s budget)
 *   inline-element-types           967ms   1633ms
 *   variant-aurora                 272ms   TIMEOUT
 *   variant-wave                   334ms   TIMEOUT
 *   variant-custom                 246ms   TIMEOUT
 *   highlighter                    277ms    841ms
 *
 * The `because` strings on the entries below quote the same run — the
 * `element-types-lib-check` entry says "3.8s idle" — and carry the same caveat.
 * They are left as recorded rather than silently reworded.
 *
 * EVERYWHERE ELSE THE SAME WINDOW LEAKED, so a reader who lands on one of these
 * first can find this note. All were recorded Aug 11 22:10 - Aug 12 10:05 local:
 *
 *   packages/ui/emitted-code-tests.ts   the 60s budget + 9635/32621. Value STANDS
 *                                       (the error runs generous); the ratios do not.
 *   packages/ui/vitest.config.ts        the `--maxWorkers=4` advice, WITHDRAWN —
 *                                       a finding about contention, measured under
 *                                       four cores of hidden contention.
 *   .github/workflows/test.yml          9.6s/32.6s again, plus a "~10s" step estimate.
 *   CLAUDE.md                           "~11s" — a SEPARATE later reading, not a
 *                                       restatement, so it needs its own re-measure.
 *
 * One more lives only in a commit message and therefore cannot be corrected in
 * place: db979e1 (Aug 11 23:40 local) records `verify:scaffold` wall clock going
 * 14.5s -> 15.1s for +22% cells, read as "+4% time". Its author noticed the after
 * went UP and set it aside as ordinary contention; it was not ordinary. Worth
 * separating, though: the two runs shared the same hidden load, so the RATIO
 * ("+4% for +22% cells") is far more robust than either absolute, and the
 * conclusion it supports probably survives. The absolutes do not.
 *
 * WHAT SURVIVES, and why the table still stands: the two causes are structural,
 * not contention artifacts. `element-types-lib-check` runs a real
 * `ts.createProgram`, and the shader-variant files `await import()` the variant
 * module, `shader-canvas` and a `.glsl` asset from inside the test body, so Vite
 * transform cost is charged to the TEST's budget rather than to setup. Those
 * hold at any load. What does NOT survive is the specific claim that
 * `element-types-lib-check` spends 75% of the default budget "on an idle machine
 * with zero contention": the machine had contention, so its true idle share is
 * lower than 75% and is currently unknown.
 *
 * ADDING AN ENTRY IS A SMELL, NOT A ROUTINE. If a test needs more than five
 * seconds, the first question is whether it should be doing that work at all.
 * These earn it: the tsc files are guards that must genuinely compile, and the
 * shader files must genuinely load their real module graph. A test that is
 * slow because it sleeps or polls does NOT belong here — fix the test.
 *
 * `emitted-card-path.live` USED TO BE the entry to be uneasy about, and what
 * happened to it is the precedent worth keeping. It measured 9635ms "idle" and
 * 32621ms "starved" (4cd2de9, Aug 12 00:39 local — same invalidated window, same
 * caveat, and the pair that the 60s budget in `emitted-code-tests.ts` is derived
 * from) — 2.5x the next slowest file here and the only entry that ever
 * needed more than 30 seconds — because it RUNS emitted consumer code end to end,
 * which is an integration test wearing a unit test's filename. This header called
 * the fix a separate vitest project for run-the-emitted-code guards, with its own
 * budget; that project now exists (`emitted`), the file runs there, and the entry
 * MOVED with it rather than being left behind.
 *
 * Left behind is the failure worth naming, because it would have looked fine:
 * `vitest.setup.timeouts.ts` is registered on the `unit` project only, so an entry
 * here for a file that no longer runs in `unit` grants nothing, and the guard in
 * `test-timeout-budgets.test.ts` only checks that entries point at files that
 * EXIST. A stale entry would have stayed green forever while protecting nothing —
 * the same shape this header warns about for `audio-visualizer/index.test.tsx`.
 *
 * See `emitted-code-tests.ts` for that project's budget and the measurements
 * behind it. Do not read this table as a precedent for parking multi-second
 * integration work in `unit`; that is what the other project is for.
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
