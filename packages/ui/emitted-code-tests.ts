/**
 * The `emitted` vitest project — run-the-emitted-code guards.
 *
 * WHAT LIVES HERE AND WHY IT IS NOT `unit`
 *
 * A run-the-emitted-code guard takes what the `kai` MCP scaffolder EMITS into a
 * consumer's repo, writes it to a real module, and executes it. That is the only
 * layer that can tell a working emit from a plausible-looking one: `scaffold.test.ts`
 * asserts the wording of string literals, `verify:scaffold` compiles the same output
 * under eight consumer tsconfigs, and neither can see whether anything reaches the
 * screen. The cost of that coverage is that such a test transforms a heavy module
 * graph through Vite and then DRIVES it — seconds, not milliseconds, by construction.
 *
 * `tests/agent-tooling/emitted-card-path.live.test.ts` measured 9.6s idle and 32.6s
 * under CPU starvation (32 spinning processes on 10 cores). It used to sit in the
 * `unit` project on a 60s per-file exception in `test-timeout-budgets.ts`, where it
 * was 2.5x the next slowest entry and the only one needing more than 30 seconds. That
 * table's own header called it the entry to be uneasy about and named this file's
 * job as the fix: a separate project for run-the-emitted-code guards, with its own
 * budget, so `unit` keeps ONE strict 5000ms default that is still a meaningful hang
 * detector.
 *
 * So the budget MOVED rather than being copied. Leaving the entry in the shared
 * table would have made it inert — `vitest.setup.timeouts.ts` is registered on the
 * `unit` project only, so an entry for a file that no longer runs there would look
 * protective and do nothing, and `test-timeout-budgets.test.ts` only checks that
 * entries point at files that exist, so it would have stayed green forever. Exactly
 * the failure mode that table warns about for `audio-visualizer/index.test.tsx`.
 *
 * THE BUDGET. 60s is ~1.8x the worst MEASURED starved run and ~6x idle. It is a
 * PROJECT-level default here rather than a per-file exception, because inside a
 * project whose entire purpose is expensive integration runs there is no strict
 * default to protect. That is a real widening: a second file added to this project
 * gets 60s without arguing for it. The trade is deliberate — the argument moves from
 * "does this file deserve an exception" to "does this file belong in this project at
 * all", which is the question worth asking about a guard that runs emitted code.
 *
 * ADDING A FILE. Name it `*.live.test.ts` and put it under `tests/agent-tooling/`.
 * Both halves matter: `emitted-project-wiring.test.ts` fails if a `.live.test.ts`
 * turns up anywhere else, because such a file would be collected by `unit` on the
 * strict 5000ms default and flake there instead of running here.
 *
 * WHAT THE PROJECT COSTS, RE-MEASURED at three files (per-test, mean of 3 runs):
 *
 *   emitted-card-path       9601ms   (recorded idle baseline: 9635ms)
 *   emitted-maximal-surface 10793ms
 *   emitted-mock-path       11358ms
 *
 * The card path landing within 0.3% of its own recorded idle figure is the
 * CALIBRATION, and it is the only reason these numbers are quotable: the box was
 * carrying a load average of ~12 on 10 cores at the time, so a raw wall-clock
 * reading would have been worthless. Three forks on ten cores are not starved by
 * that load, and the file with a known idle number proves it rather than asserting
 * it. Check the same way before trusting a timing figure here — a budget in this
 * repo was once measured on a box that was four cores down without anyone knowing.
 *
 * The budget did not need revisiting for the third file, and the reason is worth
 * stating: it is not the slowest one. `emitted-mock-path` is, and it already lives
 * under this 60s default. Nothing here justifies a NEW number.
 *
 * WALL CLOCK BARELY MOVES, AGGREGATE CPU NEARLY DOUBLES. Adding the third file took
 * the project from 13.9s to 14.4s wall (+3.6%) while its aggregate `tests` metric
 * went 20.4s -> 32.0s (+57%): vitest runs these files in PARALLEL forks, so the
 * cost of a new guard here is CPU, not the time anyone waits. Do not read the wall
 * figure as headroom to add files indefinitely — the parallelism runs out at the
 * fork count, and the next file after that lands on the clock in full.
 *
 * WHERE IT RUNS. `.github/workflows/test.yml`, in the REQUIRED `test` job, as its
 * own step right after the unit project. A project nobody runs looks like coverage
 * and is not, so that wiring is itself asserted by `emitted-project-wiring.test.ts`
 * — which runs in `unit`, and therefore cannot be skipped by the same mistake it is
 * checking for.
 *
 * Both `vitest.config.ts` projects read the values below, so the `emitted` project's
 * include and the `unit` project's exclude cannot drift apart: one constant, used
 * twice, in opposite directions.
 */

/** Directory that owns the run-the-emitted-code guards. */
export const EMITTED_CODE_TEST_DIR = 'tests/agent-tooling';

/** Filename suffix that marks a test as one of them. */
export const EMITTED_CODE_TEST_SUFFIX = '.live.test.ts';

/** The vitest project name — `vitest run --project=emitted`. */
export const EMITTED_PROJECT = 'emitted';

/** The `emitted` project's include glob. */
export const EMITTED_CODE_TESTS = `${EMITTED_CODE_TEST_DIR}/**/*${EMITTED_CODE_TEST_SUFFIX}`;

/**
 * The same glob as an exclude for the `unit` project. Both the root-relative and
 * the unanchored form, matching how `unit` already excludes `tests/react`.
 */
export const EMITTED_CODE_TESTS_EXCLUDE: readonly string[] = [
  EMITTED_CODE_TESTS,
  `**/${EMITTED_CODE_TESTS}`,
];

/**
 * Per-test budget for the project, in milliseconds. See THE BUDGET above: ~1.8x the
 * worst measured starved run (32621ms), ~6x idle (9635ms). The multiplier is stated
 * rather than tuned — the number comes from the measurement, NOT from raising it
 * until the file stopped flaking, which would only ever track today's load.
 */
export const EMITTED_CODE_TIMEOUT = 60_000;
