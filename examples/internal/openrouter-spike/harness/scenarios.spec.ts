// The conformance runner.
//
// One Playwright test per catalog scenario. Each one navigates the REAL app to
// `?scenario=<id>&mode=<mode>`, lets the app fire the scenario's own prompt with
// the scenario's own tools, and then hands the page to the scenario's `assert`.
//
// Two rules the runner enforces so a green report means something:
//
//  1. A `knownGap` scenario is EXPECTED to fail — but only in ONE specific way.
//     It must reach the gap first (`knownGap.reached`), then still fail
//     (`assert`), then fail with the documented message (`knownGap.signature`).
//     A gap that quietly closed is a gap nobody documented; a gap "confirmed" by
//     a run that broke upstream is worse, because it looks like a measurement.
//  2. Nothing here asserts anything itself. Every claim comes from the scenario
//     module, against the rendered DOM. The runner only decides which mode to
//     run in and what a verdict means.
//
// Mode is chosen with SPIKE_MODE:
//   replay (default) — no key, no network, fixtures only.
//   live             — hits the model and RECORDS each round into fixtures/live.
//   both             — live first, then replay the freshly recorded stream.
import { test, expect, type Page } from '@playwright/test';
import {
  SCENARIOS,
  replayDirFor,
  type Scenario,
  type ScenarioMode,
  type ScenarioWire,
} from '../src/scenarios';
import { readHarnessState } from '../src/harness-state';

type RunMode = 'live' | 'replay' | 'both';

const MODE = (process.env.SPIKE_MODE as RunMode) || 'replay';
const ONLY = process.env.SPIKE_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);
/** SPIKE_CONTROL=1 inverts the suite: every assertion is pointed at a stream
 *  that CANNOT satisfy it, and passing is the failure. */
const CONTROL = process.env.SPIKE_CONTROL === '1';
const DEFAULT_CONTROL = 'canned/CONTROL-empty';
/** Set by the matrix runner: the model this run is supposed to be measuring. */
const EXPECT_MODEL = process.env.SPIKE_EXPECT_MODEL;

/** Which modes a given scenario should actually be run in. A `replay`-only
 *  scenario is never run live: the behaviour it covers cannot be provoked from a
 *  prompt, so a "live" attempt would just be a slower, costlier replay. */
function modesFor(scenario: Scenario): ScenarioMode[] {
  if (scenario.mode === 'replay') return ['replay'];
  if (MODE === 'both') return ['live', 'replay'];
  return [MODE === 'live' ? 'live' : 'replay'];
}

const selected = SCENARIOS.filter((s) => !ONLY || ONLY.includes(s.id));

/** Which SSE dialect this server speaks. A SERVER decision (see `resolveWire`),
 *  so it is read from `/api/config` rather than guessed from an env var that
 *  could drift from it. */
async function wireOf(page: Page): Promise<ScenarioWire> {
  const config = (await page.request.get('/api/config').then((r) => r.json())) as { wire?: string };
  return config.wire === 'anthropic' ? 'anthropic' : 'openai';
}

/** Point a hardcoded `canned/...` control directory at the dialect this server
 *  actually speaks. */
async function controlDirFor(page: Page, dir: string): Promise<string> {
  return (await wireOf(page)) === 'anthropic' ? dir.replace(/^canned\//, 'canned-anthropic/') : dir;
}

/** Turn whatever a failed promise rejected with into an Error. */
const asError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/** Run something and hand back the failure instead of throwing it. */
function problemFrom(run: Promise<unknown>): Promise<Error | null> {
  return run.then(() => null, asError);
}

if (CONTROL) {
  // ── the negative-control pass ─────────────────────────────────────────────
  //
  // Point each assertion at a stream that cannot possibly satisfy it and require
  // it to go RED. An assertion nobody has watched fail is not evidence: this
  // repo has already shipped a "Completed" badge that rendered from seeded data
  // while the live loop had never run, and five other checks in one epic that
  // covered nothing.
  //
  // `knownGap` scenarios do not get an assertion control: they already fail
  // against their REAL stream, so pointing the assertion at a control tells us
  // nothing we do not know. Their PRECONDITION gets one instead, below.
  for (const scenario of selected.filter((s) => !s.knownGap)) {
    const control = scenario.controlDir ?? DEFAULT_CONTROL;
    test(`CONTROL ${scenario.id} — must FAIL against ${control}`, async ({ page }) => {
      // The control streams exist in both SSE dialects, and the WRONG dialect
      // parses to nothing — which would make every control go red for a reason
      // that has nothing to do with the assertion under test, i.e. a green
      // control run that proves nothing. Ask the server which wire it speaks.
      const dir = await controlDirFor(page, control);
      await page.goto(
        `/?scenario=${encodeURIComponent(scenario.id)}&mode=replay&fixture=${encodeURIComponent(dir)}`,
      );
      await page.waitForSelector('html[data-kai-phase="running"]', { timeout: 60_000 });

      // `during` counts too: for S17/S18 the interaction IS the assertion.
      const duringProblem = scenario.during ? await problemFrom(scenario.during(page)) : null;

      await page.waitForSelector('html[data-kai-phase="done"], html[data-kai-phase="error"]', {
        timeout: 90_000,
      });

      const problem = duringProblem ?? (await problemFrom(scenario.assert(page)));

      if (!problem) {
        throw new Error(
          `${scenario.id}'s assertion PASSED against ${control}, a stream that cannot produce what it claims to check. ` +
            'The assertion is not testing what it says it is testing.',
        );
      }
      console.log(`  ${scenario.id}: control red as required — ${problem.message.split('\n')[0]}`);
    });
  }

  // ── the GAP-PRECONDITION control ──────────────────────────────────────────
  //
  // The same discipline, aimed at the check that decides whether a gap counts as
  // confirmed. `knownGap.reached` is what stands between "the gap is still open"
  // and "this run fell over before it got there", and a precondition that cannot
  // fail buys nothing: that is precisely how S13 was recorded as a confirmed gap
  // while its stream was being replayed in the wrong dialect and parsing to
  // nothing.
  //
  // So: point the precondition at a stream that cannot possibly reach the gap
  // and require it to go RED.
  for (const scenario of selected) {
    const gap = scenario.knownGap;
    if (!gap) continue;
    const control = scenario.controlDir ?? DEFAULT_CONTROL;
    test(`CONTROL ${scenario.id} — its gap precondition must FAIL against ${control}`, async ({ page }) => {
      const dir = await controlDirFor(page, control);
      await page.goto(
        `/?scenario=${encodeURIComponent(scenario.id)}&mode=replay&fixture=${encodeURIComponent(dir)}`,
      );
      await page.waitForSelector('html[data-kai-phase="done"], html[data-kai-phase="error"]', {
        timeout: 90_000,
      });

      const problem = await problemFrom(gap.reached(page));
      if (!problem) {
        throw new Error(
          `${scenario.id}'s gap precondition PASSED against ${control}, a stream that cannot get anywhere near the gap.\n` +
            `  documented gap: ${gap.what}\n` +
            'A precondition that cannot fail cannot tell a confirmed gap from a broken run, which is the ' +
            'exact false pass this control exists to prevent.',
        );
      }
      console.log(`  ${scenario.id}: gap precondition red as required — ${problem.message.split('\n')[0]}`);
    });
  }
}

for (const scenario of CONTROL ? [] : selected) {
  for (const mode of modesFor(scenario)) {
    const label = `${scenario.id} [${mode}] — ${scenario.title}`;

    test(label, async ({ page }, testInfo) => {
      testInfo.annotations.push({ type: 'proves', description: scenario.proves });
      if (scenario.knownGap) {
        testInfo.annotations.push({ type: 'known-gap', description: scenario.knownGap.what });
      }

      // Where the two wires cannot make the same claim (S05), the cell carries
      // the claim THIS wire's fixture actually supports. Without it the matrix
      // prints two identical `pass` glyphs for two unequal tests, and the weaker
      // one gets read as the stronger.
      const wire = await wireOf(page);
      const wireClaim = scenario.provesByWire?.[wire];
      if (wireClaim) {
        testInfo.annotations.push({ type: 'wire-claim', description: `[${wire} wire] ${wireClaim}` });
      }

      const failures: string[] = [];
      page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));

      await page.goto(`/?scenario=${encodeURIComponent(scenario.id)}&mode=${mode}`);

      // The app publishes `running` before it sends and `done` only once the
      // turn has settled. Waiting on the attribute rather than on a timeout is
      // what keeps a live run (seconds) and a replay run (sub-second) honest.
      await page.waitForSelector('html[data-kai-phase="running"]', { timeout: 60_000 });

      // Mid-stream choreography, if the scenario has any. It runs while the
      // stream is still open, which is the only moment some of these behaviours
      // exist at all.
      const duringResult = scenario.during ? await problemFrom(scenario.during(page)) : null;

      await page.waitForSelector('html[data-kai-phase="done"], html[data-kai-phase="error"]', {
        timeout: 90_000,
      });

      const state = await readHarnessState(page);
      // A replay run must PROVE it replayed. Without this a misconfigured live
      // run could quietly pass as an offline one — and cost money doing it.
      expect(state?.source, 'the app must report which stream source it used').toBe(mode);

      // The cross-model matrix restarts the dev server once per model, because
      // OPENROUTER_MODEL is read server-side per request. If a stale server from
      // the previous model were reused, every row of the table would be a lie
      // with no symptom. SPIKE_EXPECT_MODEL makes that failure loud.
      if (EXPECT_MODEL) {
        expect(state?.model, 'the server under test must be running the model this row claims').toBe(
          EXPECT_MODEL,
        );
      }

      // A `live` scenario has nothing to replay until it has been recorded once.
      // That is a MISSING RECORDING, not a failing assertion, and reporting the
      // two the same way is how a suite starts lying about its coverage.
      if (state?.error?.includes('No fixture at')) {
        test.skip(
          true,
          `${scenario.id} has no recorded stream yet — run \`pnpm conformance:live\` once to capture it. (${state.error})`,
        );
      }

      // What the model actually did. Appended to every failure, so a report says
      // whether the UI broke or the model simply did not call the tool.
      const diagnostics = () =>
        [
          '',
          `mode:    ${mode}`,
          `model:   ${state?.model ?? 'unknown'}`,
          `rounds:  ${state?.stats?.rounds ?? '—'}`,
          `tools:   ${state?.stats?.toolCallsSeen ?? '—'} seen, ${state?.stats?.toolCallsMalformed ?? '—'} malformed`,
          `finish:  ${state?.stats?.finishReason ?? '—'}`,
          `app err: ${state?.error ?? 'none'}`,
        ].join('\n');

      /** The scenario's own verdict: its `during` interaction if that already
       *  failed, otherwise its assertion, otherwise any uncaught page error.
       *  Deferred into a function so a `knownGap` run can check that it reached
       *  the gap FIRST — an assertion that is going to spend 20 seconds timing
       *  out is a slow way to learn the stream was empty. */
      const runAssertion = async (): Promise<Error | null> => {
        const assertResult = duringResult ?? (await problemFrom(scenario.assert(page)));
        return assertResult ?? (failures.length ? new Error(failures.join('\n')) : null);
      };

      const gap = scenario.knownGap;
      if (gap) {
        // ── confirming a gap takes three things, not one ──────────────────
        //
        // A gap is a claim about WHERE a working pipeline stops. `knownGap` used
        // to accept any red at all as proof of it, which meant a run that never
        // produced a single part — an empty stream, a fixture in the wrong SSE
        // dialect — was recorded as "gap confirmed" and printed as a tidy `gap`
        // cell. That happened, to S13, and the table looked fine.

        // 1. Did the run get far enough for the gap to be observable? This runs
        //    BEFORE the assertion is even considered: if the answer is no, the
        //    assertion's own red says nothing about the gap.
        const notReached = await problemFrom(gap.reached(page));
        if (notReached) {
          throw new Error(
            `${scenario.id} never got far enough to exhibit its known gap, so this run confirms NOTHING.\n\n` +
              `  documented gap:  ${gap.what}\n` +
              `  precondition:    ${notReached.message}\n\n` +
              'This is a BROKEN RUN (an empty stream, the wrong SSE dialect, a UI regression upstream of ' +
              'the gap), not the documented failure. Fix the run, or if the pipeline genuinely changed, ' +
              'rewrite `knownGap.reached`.' +
              diagnostics(),
          );
        }

        // 2. Is the gap still open? A gap that silently closed is a gap nobody
        //    documented.
        const problem = await runAssertion();
        if (!problem) {
          throw new Error(
            `${scenario.id} PASSED but is marked as a known gap:\n  ${gap.what}\n` +
              'If the gap has been closed, delete `knownGap` from the scenario so it is enforced from now on.',
          );
        }

        // 3. Is it failing for the DOCUMENTED reason? A page error, a timeout,
        //    or a second unrelated bug is not this gap.
        if (!gap.signature.test(problem.message)) {
          throw new Error(
            `${scenario.id} failed, but NOT with the failure its known gap documents.\n\n` +
              `  documented gap:  ${gap.what}\n` +
              `  expected match:  ${gap.signature}\n` +
              `  actual failure:  ${problem.message}\n\n` +
              'Reporting this as a confirmed gap would file a real, undocumented failure under a known one.' +
              diagnostics(),
          );
        }

        testInfo.annotations.push({ type: 'confirmed-gap', description: problem.message });
        console.log(`\n  ${scenario.id}: KNOWN GAP CONFIRMED\n    ${problem.message}\n`);
        return;
      }

      const problem = await runAssertion();
      if (problem) throw new Error(problem.message + '\n' + diagnostics());
    });
  }
}

/**
 * S12's POSITIVE control.
 *
 * Written while S12 was a documented gap, to answer the obvious objection: how
 * do we know the citation locator is looking in the right place, rather than
 * being broken in a way that would keep failing after the feature ships? So:
 * inject an anchor of exactly the shape a citation row renders, into the same
 * shadow root, and confirm the locator finds it. A red S12 with a green control
 * here was a missing FEATURE; a red S12 with a red control would have been a bad
 * selector.
 *
 * The citation row has since shipped and S12 is an ordinary passing scenario, so
 * this is no longer load-bearing for the gap — it is kept as a guard on the
 * locator itself, which is the one part of S12 that could rot into a check that
 * passes for the wrong reason.
 */
test('S12 control: the citation locator finds a citation when one exists', async ({ page }) => {
  const dir = await controlDirFor(page, 'canned/CONTROL-empty');
  await page.goto(`/?scenario=S12-citations&mode=replay&fixture=${encodeURIComponent(dir)}`);
  await page.waitForSelector('html[data-kai-phase="done"], html[data-kai-phase="error"]', { timeout: 60_000 });

  const citation = page.locator('a[href*="ui.kitn.ai/guides/theming"]');
  expect(await citation.count(), 'nothing should match before the anchor is injected').toBe(0);

  await page.evaluate(() => {
    const thread = document.querySelector('kai-thread');
    const root = thread?.shadowRoot;
    if (!root) throw new Error('no open shadow root on kai-thread');
    const a = document.createElement('a');
    a.href = 'https://ui.kitn.ai/guides/theming';
    a.textContent = 'Theming';
    a.style.display = 'block';
    root.appendChild(a);
  });

  await expect(citation.first()).toBeVisible();
});

test('the catalog is self-consistent', () => {
  const ids = SCENARIOS.map((s) => s.id);
  expect(new Set(ids).size, 'scenario ids must be unique — they are fixture directory names').toBe(ids.length);
  for (const s of SCENARIOS) {
    expect(s.id, `${s.id} must be a safe directory name`).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
    expect(replayDirFor(s, 'some-model'), `${s.id} must resolve a replay directory`).toBeTruthy();
    expect(s.proves.length, `${s.id} must say what a pass proves`).toBeGreaterThan(10);

    // A gap is only confirmable with both of its guards. The TYPE already
    // requires them; this catches the empty-string / match-anything versions
    // that would satisfy the type and check nothing.
    if (s.knownGap) {
      expect(s.knownGap.what.length, `${s.id} must document what its gap IS`).toBeGreaterThan(10);
      expect(
        s.knownGap.signature.test(''),
        `${s.id}'s gap signature must not match an empty message — it has to identify ONE failure`,
      ).toBe(false);
    }

    // A per-wire claim only makes sense as a REPLACEMENT for `proves` on that
    // wire, so an empty one would silently fall back to the general claim.
    for (const [wire, claim] of Object.entries(s.provesByWire ?? {})) {
      expect(claim.length, `${s.id}'s ${wire} claim must say what that wire actually proves`).toBeGreaterThan(10);
    }
  }
});
