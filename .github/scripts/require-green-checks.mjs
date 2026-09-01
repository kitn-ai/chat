#!/usr/bin/env node
// The publish gate: refuses to let a release go to npm unless the EXACT commit
// being published passed the checks branch protection requires.
//
// Until this existed, it did not. `release-please.yml` and `test.yml` are
// separate workflows, both triggered by the same push to main, so they race --
// and the publish wins. Measured on the last release commit (af6f7717): the
// `release` workflow finished at 01:30:57 and the required `test` check did not
// finish until 01:39:48. Nine minutes of the artifact already being on npm
// before the thing that vets it had an opinion. On 12a51dad the same shape with
// the other outcome: `release` completed 01:56:58, `test` FAILED at 02:04:17.
// Four releases went out on that basis; they happened to be fine.
//
// A `needs:` cannot express this -- it only relates jobs inside ONE workflow --
// and neither can "the PR was green": release PRs are opened by the bot with
// GITHUB_TOKEN, so their workflow runs sit in `action_required` and never
// execute. Commit 4b276894 (a release-branch head) carries literally ZERO check
// runs. So the question has to be asked about the COMMIT, against the API, at
// publish time. That is what this does.
//
// DENY BY DEFAULT, and that is the whole design. The gate does not look for a
// reason to refuse; it looks for a specific, positive observation -- this named
// check, on this exact SHA, `completed` with conclusion `success` -- and refuses
// on the absence of it. Absent, queued, cancelled, skipped, timed_out,
// action_required, a renamed context, an API that will not answer: every one of
// those is a refusal, because every one of them means nobody has told us the
// code is good. The failure a permissive gate ships is invisible; the failure
// this one ships is a red release run, which somebody reads.
//
// "Some recent green run" is NOT what is checked. The SHA is passed in and every
// lookup is scoped to it, because a gate that accepts a neighbouring commit's
// result is the same illusion as no gate, wearing a hat.
//
// Two commands:
//
//   (default)   -- ask the API about one SHA and exit 0 (green) or non-zero.
//   --self-test -- drive the resolver through every scenario below with a stub
//                  transport, including the ones that must PASS. No network.
//
// The self-test is not decoration. A gate that refuses everything passes every
// negative test ever written for it and breaks the release path the first time
// it runs, so the accept cases are as load-bearing as the refuse cases and both
// are asserted here.
//
// No dependencies. `gh` is on every GitHub-hosted runner and is already how this
// repo's docs tell you to ask about required checks (see the ruleset query in
// .github/workflows/test.yml).
import { spawnSync } from 'node:child_process';

const red = (s) => `[31m${s}[0m`;
const green = (s) => `[32m${s}[0m`;
const bold = (s) => `[1m${s}[0m`;

/** Per-context verdicts. Only PASS lets a publish happen. */
const PASS = 'pass';
const PENDING = 'pending';
const FAIL = 'fail';
const ABSENT = 'absent';

/**
 * The real transport. Returns parsed JSON, or throws.
 *
 * `gh` inherits GH_TOKEN on a runner and the user's keyring locally, so the same
 * script is exercisable by hand against real commits -- which is how this gate
 * was watched refusing before it was trusted.
 */
function ghApi(path) {
  const res = spawnSync('gh', ['api', path, '--header', 'Accept: application/vnd.github+json'], {
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.error) throw new Error(`gh could not be run: ${res.error.message}`);
  if (res.status !== 0) {
    throw new Error(`gh api ${path} exited ${res.status}: ${(res.stderr || '').trim()}`);
  }
  try {
    return JSON.parse(res.stdout);
  } catch {
    throw new Error(`gh api ${path} did not return JSON`);
  }
}

/**
 * Every check run GitHub Actions recorded for this SHA.
 *
 * `filter=latest` is the default but is passed explicitly because it is
 * load-bearing: without it a re-run leaves BOTH the old failure and the new
 * success attached to the commit, and "is there a success in this list" would
 * accept a commit whose latest attempt is red.
 *
 * Paginated properly rather than trusting one page. A missed page can only cause
 * a false REFUSAL (absent reads as not-green), never a false pass, but a gate
 * that randomly blocks releases gets deleted by the next person in a hurry.
 */
function collectCheckRuns(repo, sha, api) {
  const runs = [];
  for (let page = 1; page <= 20; page += 1) {
    const body = api(`repos/${repo}/commits/${sha}/check-runs?filter=latest&per_page=100&page=${page}`);
    const batch = body.check_runs ?? [];
    runs.push(...batch);
    const total = typeof body.total_count === 'number' ? body.total_count : runs.length;
    if (batch.length === 0 || runs.length >= total) break;
  }
  return runs;
}

/**
 * The legacy commit-status API, checked as well as check runs.
 *
 * A required context in a ruleset can be satisfied by either system. Today's
 * `test` is an Actions check run, but a context reported by an external service
 * would arrive here instead, and a gate that only knew about check runs would
 * refuse it forever while the branch-protection UI showed it green.
 */
function collectStatuses(repo, sha, api) {
  const body = api(`repos/${repo}/commits/${sha}/status?per_page=100`);
  return body.statuses ?? [];
}

/**
 * One required context -> one verdict.
 *
 * The check-run half is deliberately written as "success, or else": listing the
 * bad conclusions instead would mean a conclusion GitHub adds next year lands in
 * the `else` that publishes.
 */
export function resolveContext(name, checkRuns, statuses) {
  const run = checkRuns.find((r) => r.name === name);
  if (run) {
    if (run.status !== 'completed') {
      return { state: PENDING, detail: `check run is ${run.status}` };
    }
    if (run.conclusion === 'success') {
      return { state: PASS, detail: `check run succeeded at ${run.completed_at ?? 'unknown time'}` };
    }
    return { state: FAIL, detail: `check run concluded ${run.conclusion ?? 'null'}` };
  }

  const status = statuses.find((s) => s.context === name);
  if (status) {
    if (status.state === 'pending') return { state: PENDING, detail: 'commit status is pending' };
    if (status.state === 'success') return { state: PASS, detail: 'commit status is success' };
    return { state: FAIL, detail: `commit status is ${status.state}` };
  }

  // Nothing has reported. Distinct from PENDING because the messages differ --
  // both refuse, but "never showed up" points at a renamed context or a
  // workflow that did not trigger, and "still running" points at the race.
  return { state: ABSENT, detail: 'no check run and no commit status with this name' };
}

/**
 * Poll until every required context is green, one of them is terminally bad, or
 * the clock runs out.
 *
 * The wait is the part that keeps the release path working. `test.yml` and
 * `release-please.yml` start on the same push, so at the moment this runs the
 * required check is normally `in_progress` -- a gate that demanded an immediate
 * answer would refuse every legitimate release. On af6f7717 `test` took 10m19s
 * against a 30-minute job timeout, hence a default well clear of both.
 *
 * A terminal failure does NOT keep polling. Somebody re-running a red check
 * cannot rescue a release run that is already sitting there waiting, so it
 * refuses immediately and loudly; the human fixes main and dispatches again.
 */
export async function requireGreen({
  repo,
  sha,
  required,
  timeoutMs,
  pollMs,
  api = ghApi,
  log = console.log,
  now = () => Date.now(),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const deadline = now() + timeoutMs;
  let lastError = null;
  let attempts = 0;

  for (;;) {
    attempts += 1;
    let verdicts = null;
    try {
      const checkRuns = collectCheckRuns(repo, sha, api);
      const statuses = collectStatuses(repo, sha, api);
      verdicts = required.map((name) => ({ name, ...resolveContext(name, checkRuns, statuses) }));
      lastError = null;
    } catch (err) {
      // An API blip must not fail a real release, so this retries -- but it
      // never decays into a pass. If the API stays unreachable the loop runs out
      // of clock and refuses below.
      lastError = err instanceof Error ? err.message : String(err);
      log(`  … API error (will retry): ${lastError}`);
    }

    if (verdicts) {
      for (const v of verdicts) log(`  ${v.name}: ${v.state.toUpperCase()} — ${v.detail}`);

      const bad = verdicts.filter((v) => v.state === FAIL);
      if (bad.length > 0) {
        return {
          ok: false,
          reason:
            `required check(s) did not pass on ${sha}: ` +
            bad.map((v) => `${v.name} (${v.detail})`).join(', '),
          verdicts,
        };
      }
      if (verdicts.every((v) => v.state === PASS)) {
        return { ok: true, reason: `all required checks are green on ${sha}`, verdicts, attempts };
      }
    }

    if (now() >= deadline) {
      const stillWaiting = (verdicts ?? [])
        .filter((v) => v.state !== PASS)
        .map((v) => `${v.name} (${v.detail})`)
        .join(', ');
      return {
        ok: false,
        reason: lastError
          ? `the checks API could not be read for ${sha} before the timeout: ${lastError}`
          : `timed out waiting for required check(s) on ${sha}: ${stillWaiting || 'none resolved'}`,
        verdicts: verdicts ?? [],
      };
    }

    await sleep(pollMs);
  }
}

// ── the self-test ────────────────────────────────────────────────────────────
//
// Every scenario runs the SAME resolver and the SAME poll loop production uses,
// with the transport stubbed and the clock made of numbers. `expect: true` cases
// are as important as `expect: false` ones: a gate that refuses unconditionally
// satisfies every refusal case here and takes the release pipeline down with it.

const checkRun = (name, status, conclusion) => ({
  name,
  status,
  conclusion,
  completed_at: '2026-08-15T01:39:48Z',
});

/** A transport that answers from a scripted list of (checkRuns, statuses) turns. */
function stubApi(turns) {
  let i = 0;
  return (path) => {
    const turn = turns[Math.min(i, turns.length - 1)];
    if (typeof turn === 'function') return turn(path, i++);
    if (path.includes('/check-runs')) {
      const runs = turn.checkRuns ?? [];
      return { total_count: runs.length, check_runs: runs };
    }
    i += 1;
    return { statuses: turn.statuses ?? [] };
  };
}

const SCENARIOS = [
  {
    id: 'green-check-run',
    why: 'the real release path: the required check completed successfully on this SHA',
    required: ['test'],
    turns: [{ checkRuns: [checkRun('test', 'completed', 'success')] }],
    expect: true,
  },
  {
    id: 'failing-check-run',
    why: 'the 12a51dad shape — red main, and the publish must not happen',
    required: ['test'],
    turns: [{ checkRuns: [checkRun('test', 'completed', 'failure')] }],
    expect: false,
  },
  {
    id: 'absent-entirely',
    why: 'the 4b276894 shape — a commit with zero check runs must never publish',
    required: ['test'],
    turns: [{ checkRuns: [] }],
    expect: false,
  },
  {
    id: 'in-progress-then-success',
    why: 'the race this gate exists for: test.yml is still running when the release starts',
    required: ['test'],
    turns: [
      { checkRuns: [checkRun('test', 'in_progress', null)] },
      { checkRuns: [checkRun('test', 'in_progress', null)] },
      { checkRuns: [checkRun('test', 'completed', 'success')] },
    ],
    expect: true,
  },
  {
    id: 'in-progress-forever',
    why: 'a check that never finishes is not a check that passed',
    required: ['test'],
    turns: [{ checkRuns: [checkRun('test', 'in_progress', null)] }],
    expect: false,
  },
  {
    id: 'queued-forever',
    why: 'queued is not green either',
    required: ['test'],
    turns: [{ checkRuns: [checkRun('test', 'queued', null)] }],
    expect: false,
  },
  {
    id: 'skipped',
    why: 'a skipped required check ran nothing, so it vetted nothing',
    required: ['test'],
    turns: [{ checkRuns: [checkRun('test', 'completed', 'skipped')] }],
    expect: false,
  },
  {
    id: 'action-required',
    why: 'exactly what a bot-opened release PR produces — never treat it as a pass',
    required: ['test'],
    turns: [{ checkRuns: [checkRun('test', 'completed', 'action_required')] }],
    expect: false,
  },
  {
    id: 'cancelled',
    why: 'a cancelled run is an absence of information',
    required: ['test'],
    turns: [{ checkRuns: [checkRun('test', 'completed', 'cancelled')] }],
    expect: false,
  },
  {
    id: 'unknown-future-conclusion',
    why: 'a conclusion GitHub has not invented yet must refuse, not fall through to publish',
    required: ['test'],
    turns: [{ checkRuns: [checkRun('test', 'completed', 'flurgled')] }],
    expect: false,
  },
  {
    id: 'other-checks-green-required-absent',
    why: 'the vacuity trap — nine green checks and the required one missing is NOT green',
    required: ['test'],
    turns: [
      {
        checkRuns: [
          checkRun('build', 'completed', 'success'),
          checkRun('storybook-gate', 'completed', 'success'),
          checkRun('release', 'completed', 'success'),
        ],
      },
    ],
    expect: false,
  },
  {
    id: 'two-required-one-red',
    why: 'if the ruleset ever requires more than one context, all of them must be green',
    required: ['test', 'build'],
    turns: [
      {
        checkRuns: [checkRun('test', 'completed', 'success'), checkRun('build', 'completed', 'failure')],
      },
    ],
    expect: false,
  },
  {
    id: 'two-required-both-green',
    why: 'and the multi-context accept path still has to work',
    required: ['test', 'build'],
    turns: [
      {
        checkRuns: [checkRun('test', 'completed', 'success'), checkRun('build', 'completed', 'success')],
      },
    ],
    expect: true,
  },
  {
    id: 'test-green-storybook-gate-red',
    why: 'the actual pair release-please passes today: `test` green must not let a red `storybook-gate` publish',
    required: ['test', 'storybook-gate'],
    turns: [
      {
        checkRuns: [checkRun('test', 'completed', 'success'), checkRun('storybook-gate', 'completed', 'failure')],
      },
    ],
    expect: false,
  },
  {
    id: 'test-and-storybook-gate-both-green',
    why: 'the real release path once both ruleset contexts (18328421) are required',
    required: ['test', 'storybook-gate'],
    turns: [
      {
        checkRuns: [checkRun('test', 'completed', 'success'), checkRun('storybook-gate', 'completed', 'success')],
      },
    ],
    expect: true,
  },
  {
    id: 'legacy-commit-status-green',
    why: 'a required context reported through the statuses API still counts',
    required: ['external/ci'],
    turns: [{ checkRuns: [], statuses: [{ context: 'external/ci', state: 'success' }] }],
    expect: true,
  },
  {
    id: 'api-unreadable',
    why: 'fail CLOSED — an API we cannot read has not told us the code is good',
    required: ['test'],
    turns: [
      () => {
        throw new Error('403 rate limited');
      },
    ],
    expect: false,
  },
];

async function selfTest() {
  const failures = [];
  for (const s of SCENARIOS) {
    // A clock made of numbers: three polls' worth of budget, no real waiting.
    let clock = 0;
    const result = await requireGreen({
      repo: 'kitn-ai/ui',
      sha: 'deadbeef',
      required: s.required,
      timeoutMs: 3,
      pollMs: 1,
      api: stubApi(s.turns),
      log: () => {},
      now: () => clock,
      sleep: async () => {
        clock += 1;
      },
    });
    if (result.ok !== s.expect) {
      failures.push(
        `  ${red('✗')} ${bold(s.id)} — expected ${s.expect ? 'ACCEPT' : 'REFUSE'}, got ` +
          `${result.ok ? 'ACCEPT' : 'REFUSE'} (${result.reason})\n      ${s.why}`,
      );
    }
  }

  if (failures.length > 0) {
    console.error(red(bold('\nrequire-green-checks self-test FAILED\n')));
    console.error(failures.join('\n'));
    console.error(
      '\nThis gate decides whether a release reaches npm. Do not ship it until every\n' +
        'scenario above holds, in BOTH directions.\n',
    );
    process.exit(1);
  }

  const accepts = SCENARIOS.filter((s) => s.expect).length;
  console.log(
    green(
      `require-green-checks self-test: ${SCENARIOS.length} scenarios hold ` +
        `(${accepts} must accept, ${SCENARIOS.length - accepts} must refuse).`,
    ),
  );
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { required: [], timeoutMinutes: 45, pollSeconds: 20, eventName: '', override: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--repo') out.repo = next();
    else if (arg === '--sha') out.sha = next();
    else if (arg === '--require') out.required.push(...next().split(',').map((s) => s.trim()).filter(Boolean));
    else if (arg === '--timeout-minutes') out.timeoutMinutes = Number(next());
    else if (arg === '--poll-seconds') out.pollSeconds = Number(next());
    else if (arg === '--event-name') out.eventName = next();
    else if (arg === '--override') out.override = /^(true|1|yes)$/i.test(next() ?? '');
    else {
      console.error(`require-green-checks: unrecognised argument \`${arg}\``);
      process.exit(2);
    }
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) {
    await selfTest();
    return;
  }

  const opts = parseArgs(argv);
  for (const key of ['repo', 'sha']) {
    if (!opts[key]) {
      console.error(`require-green-checks: --${key} is required`);
      process.exit(2);
    }
  }
  if (opts.required.length === 0) {
    // Refusing an empty list is the difference between a gate and a decoration:
    // `--require ""` would otherwise sail through with nothing to check.
    console.error('require-green-checks: at least one --require <context> is required');
    process.exit(2);
  }

  console.log(bold(`Publish gate: ${opts.repo}@${opts.sha}`));
  console.log(`  required: ${opts.required.join(', ')}`);

  // The emergency hatch, and the reasons it is shaped like this:
  //
  //  - it is honoured ONLY on workflow_dispatch, and the script checks the event
  //    name itself rather than trusting the caller's flag, so no push-triggered
  //    run can set it however the YAML is edited;
  //  - it defaults to false, so the manual publish path is gated like every
  //    other path. workflow_dispatch exists because release-please's own
  //    `release_created` output has missed before -- that is a bug in the
  //    RELEASE bookkeeping, not a reason to stop caring whether main is green;
  //  - taking it requires a human to tick a box in the Actions UI for one run.
  //    It cannot be left on.
  if (opts.override) {
    if (opts.eventName !== 'workflow_dispatch') {
      console.error(
        red(
          `::error::require-green-checks: the check override was requested on a ` +
            `\`${opts.eventName || 'unknown'}\` event. It is only available on workflow_dispatch.`,
        ),
      );
      process.exit(1);
    }
    console.log(
      `::warning::PUBLISH GATE BYPASSED by explicit workflow_dispatch input. ` +
        `${opts.repo}@${opts.sha} is being published WITHOUT confirming ${opts.required.join(', ')} passed.`,
    );
    return;
  }

  const result = await requireGreen({
    repo: opts.repo,
    sha: opts.sha,
    required: opts.required,
    timeoutMs: opts.timeoutMinutes * 60_000,
    pollMs: opts.pollSeconds * 1000,
  });

  if (!result.ok) {
    console.error(red(bold('\nPUBLISH REFUSED\n')));
    console.error(`::error::${result.reason}`);
    console.error(
      `\nNothing was published. This commit has not passed the checks this repository\n` +
        `requires, so shipping it to npm would put unvetted code in front of every\n` +
        `consumer. Fix main, let \`test\` go green on the release commit, then re-run\n` +
        `this workflow (Actions -> Release -> Run workflow).\n`,
    );
    process.exit(1);
  }

  console.log(green(bold(`\nPublish gate passed: ${result.reason}`)));
}

await main();
