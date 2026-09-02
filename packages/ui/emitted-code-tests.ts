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
 * `mcp/tests/emitted-card-path.live.test.ts` measures 7.7s with no added
 * load and 36.8s under CPU starvation (32 spinning processes on 10 cores), both
 * medians of 3 -- see THE BUDGET below for the conditions, which were NOT idle. It
 * used to sit in the
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
 * THE BUDGET. 60s stays, and it is now backed by a measurement whose conditions
 * were captured rather than asserted.
 *
 * WHAT WENT WRONG BEFORE. The old pair (9635ms "idle", 32621ms "starved") was
 * recorded in 4cd2de9 at Aug 12 00:39 local. From Aug 11 22:10 until Aug 12 10:05
 * local, four orphaned `while :; do :; done` shells -- CPU burners leaked by a
 * stale flake-hunting script and never reaped -- pinned four of this box's ten
 * cores continuously. The "idle" baseline was taken on a box already down four
 * cores. The failure was not imprecision; it was that the stated CONDITIONS were
 * false and nothing recorded alongside the number could contradict them.
 *
 * THE REPLACEMENT, via `scripts/measure-timings.mjs` (min/median/max of 3 runs,
 * per-test, `--testTimeout=600000` so nothing is truncated):
 *
 *                            no added load          32 burners on 10 cores
 *   emitted-card-path        7710/7718/7771ms       36580/36762/36901ms
 *   emitted-maximal-surface  8791/8812/8885ms       40698/40907/41056ms
 *   emitted-mock-path        9560/9603/9614ms       38101/38265/38268ms
 *   project wall clock       11973/12031/12045ms    50383/50771/50846ms
 *
 * The per-test rows are what the 60s `testTimeout` below actually governs. The
 * wall row is the whole command including pnpm and node startup; vitest's own
 * `Duration:` line reports ~10.1s for the same run because it excludes that
 * startup, so do not compare the two directly.
 *
 * THE MULTIPLIER, stated as a multiplier rather than as a bare number:
 *
 *   60s is 6.2x the worst run with no added load (9614ms), and
 *   60s is 1.46x the worst run under 3.2x CPU oversubscription (41056ms).
 *
 * That is the whole justification. The budget is a HANG detector, so the figure it
 * has to clear is the realistic one (6.2x); the starvation column exists to show
 * the margin survives -- still above 1.0x -- even when the box is deliberately
 * given three times more spinning work than it has cores. 60s was not changed,
 * and specifically was not RAISED: nothing is flaking, and raising a budget until a
 * flake stops only ever tracks today's load, which is how the previous number got
 * into trouble.
 *
 * READ THE CONDITIONS, DO NOT ASSUME IDLE. "No added load" means only that the
 * script added none. That box was carrying a 1-minute load average of 6.6-7.9 on
 * 10 cores with two agent sessions and an editor resident, and roughly 0.95 cores
 * of steady foreign CPU (WindowServer, XprotectService, a `claude` process). It is
 * NOT an idle baseline and must not be quoted as one. The starved column is 32
 * spinners on top of that, taking the load average from 9.3 to 46.2.
 *
 * The multipliers above are therefore CONSERVATIVE: a genuinely quiet machine will
 * be faster than the left-hand column, so the real headroom is larger, never
 * smaller. Re-run `scripts/measure-timings.mjs --target=emitted --iterations=3
 * --test-timeout=600000` on a quiet box with no agent attached to tighten them.
 *
 * The old invalidated pair is still quoted in `test-timeout-budgets.ts` (which
 * carries the fuller account of the incident), `.github/workflows/test.yml`, and
 * those sites have NOT been updated with the figures above.
 *
 * The REST of the argument for this shape does not depend on any measurement, and
 * is untouched by the above. 60s is a PROJECT-level default here rather than a
 * per-file exception, because inside a project whose entire purpose is expensive
 * integration runs there is no strict default to protect. That is a real widening: a
 * second file added to this project gets 60s without arguing for it. The trade is
 * deliberate — the argument moves from "does this file deserve an exception" to
 * "does this file belong in this project at all", which is the question worth asking
 * about a guard that runs emitted code.
 *
 * ADDING A FILE. Name it `*.live.test.ts` and put it under `mcp/tests/`.
 * Both halves matter: `emitted-project-wiring.test.ts` fails if a `.live.test.ts`
 * turns up anywhere else, because such a file would be collected by `unit` on the
 * strict 5000ms default and flake there instead of running here.
 *
 * WHICH FILE IS SLOWEST DEPENDS ON CONTENTION, so do not hard-code the answer.
 * With no added load `emitted-mock-path` is the slowest at 9603ms; under 32
 * burners `emitted-maximal-surface` overtakes it, 40907ms against 38265ms. Both
 * sit under the same 60s project default, so nothing here justifies a NEW number
 * either way -- but a note claiming one specific file is "the slowest" is only
 * true at one point on the load curve.
 *
 * An earlier version of this block calibrated its figures by checking that
 * `emitted-card-path` landed within 0.3% of "its own recorded idle figure". That
 * technique is sound in general and is worth reusing, but the anchor it used was
 * the 9635ms reading from the contaminated window, so it was calibrating against a
 * number that was itself wrong -- agreement with a bad baseline reads exactly like
 * agreement with a good one. `scripts/measure-timings.mjs` replaces the technique
 * with something that cannot silently degrade that way: it samples the CPU used by
 * processes OUTSIDE its own subtree throughout each run, and discards runs that
 * were disturbed, so the anchor is the machine's measured state rather than a
 * previous figure's good name.
 *
 * WALL CLOCK BARELY MOVES, AGGREGATE CPU NEARLY DOUBLES. Adding the third file took
 * the project from 13.9s to 14.4s wall (+3.6%) while its aggregate `tests` metric
 * went 20.4s -> 32.0s (+57%). Those two wall figures are from the contaminated
 * window and were NOT re-measured — re-deriving the delta would mean deleting a
 * guard to time the project without it, which is not worth doing for a number whose
 * job is to carry a mechanism. The absolute is now 12031ms at three files, so 14.4s
 * was high, as the contamination predicts. The MECHANISM is what this paragraph is
 * for and it does not depend on either figure: vitest runs these files in PARALLEL
 * forks, so the
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
export const EMITTED_CODE_TEST_DIR = 'mcp/tests';

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
 * Per-test budget for the project, in milliseconds.
 *
 * 60s is 6.2x the worst measured run with no added load (9614ms) and 1.46x the
 * worst under 32 spinning processes on 10 cores (41056ms). Both columns are
 * min/median/max of 3 runs from `scripts/measure-timings.mjs`, which records the
 * machine conditions next to every figure; see THE BUDGET above for the table and
 * for why the left-hand column is NOT an idle baseline.
 *
 * The value did not change. It is a multiplier on a real measurement, which is the
 * only way this number is allowed to be set — never by raising it until the file
 * stops flaking, since that would only ever track today's load. An earlier
 * justification quoted ~1.8x/~6x against figures taken on a box with four cores
 * pinned by orphaned CPU burners; the ~6x survives re-measurement, the ~1.8x does
 * not.
 */
export const EMITTED_CODE_TIMEOUT = 60_000;
