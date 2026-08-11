// The conformance runner.
//
// One Playwright test per catalog scenario. Each one navigates the REAL app to
// `?scenario=<id>&mode=<mode>`, lets the app fire the scenario's own prompt with
// the scenario's own tools, and then hands the page to the scenario's `assert`.
//
// Two rules the runner enforces so a green report means something:
//
//  1. A `knownGap` scenario is EXPECTED to fail. If it passes, the run fails —
//     loudly — because a gap that quietly closed is a gap nobody documented.
//  2. Nothing here asserts anything itself. Every claim comes from the scenario
//     module, against the rendered DOM. The runner only decides which mode to
//     run in and what a verdict means.
//
// Mode is chosen with SPIKE_MODE:
//   replay (default) — no key, no network, fixtures only.
//   live             — hits the model and RECORDS each round into fixtures/live.
//   both             — live first, then replay the freshly recorded stream.
import { test, expect, type Page } from '@playwright/test';
import { SCENARIOS, replayDirFor, type Scenario, type ScenarioMode } from '../src/scenarios';
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

/** Point a hardcoded `canned/...` control directory at the dialect this server
 *  actually speaks. The wire is a server decision (see `resolveWire`), so it is
 *  read from `/api/config` rather than guessed from an env var that could drift
 *  from it. */
async function controlDirFor(page: Page, dir: string): Promise<string> {
  const config = (await page.request.get('/api/config').then((r) => r.json())) as { wire?: string };
  return config.wire === 'anthropic' ? dir.replace(/^canned\//, 'canned-anthropic/') : dir;
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
  // `knownGap` scenarios are skipped: they already fail against their REAL
  // stream, so a control run tells us nothing we do not know.
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
      const duringProblem = scenario.during
        ? await scenario.during(page).then(() => null, (e: unknown) => e)
        : null;

      await page.waitForSelector('html[data-kai-phase="done"], html[data-kai-phase="error"]', {
        timeout: 90_000,
      });

      const problem = duringProblem ?? (await scenario.assert(page).then(() => null, (e: unknown) => e));

      if (!problem) {
        throw new Error(
          `${scenario.id}'s assertion PASSED against ${control}, a stream that cannot produce what it claims to check. ` +
            'The assertion is not testing what it says it is testing.',
        );
      }
      console.log(`  ${scenario.id}: control red as required — ${(problem as Error).message.split('\n')[0]}`);
    });
  }
}

for (const scenario of CONTROL ? [] : selected) {
  for (const mode of modesFor(scenario)) {
    const label = `${scenario.id} [${mode}] — ${scenario.title}`;

    test(label, async ({ page }, testInfo) => {
      testInfo.annotations.push({ type: 'proves', description: scenario.proves });
      if (scenario.knownGap) {
        testInfo.annotations.push({ type: 'known-gap', description: scenario.knownGap });
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
      const duringResult = scenario.during
        ? await scenario.during(page).then(
            () => null,
            (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
          )
        : null;

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

      const assertResult =
        duringResult ??
        (await scenario
          .assert(page)
          .then(
            () => null,
            (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
          ));

      const problem = assertResult ?? (failures.length ? new Error(failures.join('\n')) : null);

      if (scenario.knownGap) {
        // Expected-to-fail. Passing is the alarming outcome.
        if (!problem) {
          throw new Error(
            `${scenario.id} PASSED but is marked as a known gap:\n  ${scenario.knownGap}\n` +
              'If the gap has been closed, delete `knownGap` from the scenario so it is enforced from now on.',
          );
        }
        testInfo.annotations.push({ type: 'confirmed-gap', description: problem.message });
        console.log(`\n  ${scenario.id}: KNOWN GAP CONFIRMED\n    ${problem.message}\n`);
        return;
      }

      if (problem) {
        // Attach what the model actually did, so a failure report says whether
        // the UI broke or the model simply did not call the tool.
        const detail = [
          problem.message,
          '',
          `mode:    ${mode}`,
          `model:   ${state?.model ?? 'unknown'}`,
          `rounds:  ${state?.stats?.rounds ?? '—'}`,
          `tools:   ${state?.stats?.toolCallsSeen ?? '—'} seen, ${state?.stats?.toolCallsMalformed ?? '—'} malformed`,
          `finish:  ${state?.stats?.finishReason ?? '—'}`,
          `app err: ${state?.error ?? 'none'}`,
        ].join('\n');
        throw new Error(detail);
      }
    });
  }
}

/**
 * S12's POSITIVE control.
 *
 * S12 is expected to fail, which raises an obvious objection: how do we know the
 * citation locator is looking in the right place, rather than being broken in a
 * way that would keep failing after the feature ships? So: inject an anchor of
 * exactly the shape a citation row would render, into the same shadow root, and
 * confirm the locator finds it. A red S12 with a green control here is a missing
 * FEATURE. A red S12 with a red control here would just be a bad selector.
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
  }
});
