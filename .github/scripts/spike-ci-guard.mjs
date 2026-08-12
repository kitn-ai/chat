#!/usr/bin/env node
// The spend guard for the openrouter spike's conformance harness.
//
// The harness can drive REAL models through OpenRouter and bill a real account.
// A measured five-configuration sweep came to $0.1019 (see HARNESS.md, "Cost").
// Small per run, unbounded per repository: a workflow that goes live on every
// push to a busy branch spends until somebody notices the invoice.
//
// So live runs stay manual and deliberate, and this file is the MECHANISM that
// keeps them that way. A comment saying "don't run live in CI" is not a
// mechanism -- it is a request, and the next person to add a workflow will not
// read it.
//
// Two commands, deliberately different in kind:
//
//   exec  -- pins THIS run. Refuses a live mode outright, scrubs the credential
//            out of the child environment, and only then runs the command.
//            Protects the job it wraps.
//
//   audit -- pins EVERY FUTURE run. Reads every workflow file in the repository
//            and fails if any of them could spend. This is the half that
//            survives copy-paste: a new workflow that clones the conformance job
//            and flips it live goes red on this repo's own required check before
//            it can merge, whether or not its author ever read HARNESS.md.
//
// The audit's central rule is DENY-BY-DEFAULT (`unguarded-harness` below), and
// that is the whole design. A blocklist of live spellings is only ever as good
// as the list -- `conformance:live` today, some new script name tomorrow, and
// the guard silently stops covering the thing it is named for. Requiring that
// every invocation route go through `exec` inverts it: a route nobody predicted
// is flagged because it is unrecognised, not passed because it is unlisted.
//
// Neither half can pass vacuously. `audit` runs a self-test over synthetic
// known-bad and known-good workflow text FIRST, and hard-fails the whole run if
// a rule that must fire does not, or if the clean sample draws a finding. This
// repo has shipped five guards in one epic that covered nothing; a guard whose
// rules have never been watched firing is one more of those.
//
// No network, no dependencies, no YAML parser -- the rules read the literal text
// a human copies, which is the artifact whose safety is in question.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const WORKFLOW_DIR = join(REPO_ROOT, '.github', 'workflows');
const SPIKE_DIR = join(REPO_ROOT, 'examples', 'internal', 'openrouter-spike');
const GUARD_REF = 'spike-ci-guard';

/** The only SPIKE_MODE value that costs nothing. `live` records from the model;
 *  `both` runs live FIRST and then replays what it recorded. */
const FREE_MODE = 'replay';

const red = (s) => `[31m${s}[0m`;
const bold = (s) => `[1m${s}[0m`;

// ── the rules ────────────────────────────────────────────────────────────────
//
// Each rule reads ONE line of workflow text. `sample` is a line that MUST be
// flagged; the self-test below fails the run if it is not. Keeping the sample
// next to the rule is what stops a rule from being edited into something that
// still looks right and no longer fires.
const RULES = [
  {
    id: 'live-spike-mode',
    why: 'sets SPIKE_MODE to something other than `replay`, which bills the account',
    sample: '          SPIKE_MODE: live',
    // Any assignment whose value is not exactly `replay`. Refusing UNKNOWN
    // values, not just `live` and `both`, is deliberate: the harness currently
    // falls back to replay on a value it does not recognise, so `LIVE` is free
    // today -- but that is a fallback, not a promise, and a guard that depends
    // on it breaks silently the day the harness starts normalising case.
    test: (line) => {
      const m = /SPIKE_MODE\s*[:=]\s*['"]?([A-Za-z]+)/.exec(line);
      return m ? m[1] !== FREE_MODE : false;
    },
  },
  {
    id: 'live-conformance-script',
    why: 'runs the `conformance:live` package script, which hits the model and records',
    sample: '        run: pnpm --filter @kitn.ai/ui-example-openrouter-spike conformance:live',
    test: (line) => /conformance:live/.test(line),
  },
  {
    id: 'matrix-runner',
    why: 'runs run-matrix.mjs, whose mode DEFAULTS to live -- it spends with no `live` anywhere on the line',
    sample: '        run: node harness/run-matrix.mjs',
    test: (line) => /run-matrix\.mjs/.test(line),
  },
  {
    id: 'openrouter-secret',
    why: 'wires an OpenRouter credential into a workflow, which is the only thing standing between CI and a bill',
    sample: '          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}',
    test: (line) => /secrets\s*\.\s*OPENROUTER/i.test(line),
  },
  {
    id: 'openrouter-key-assignment',
    why: 'gives OPENROUTER_API_KEY a non-empty value, which re-arms the live path',
    // Deliberately tolerates the empty assignment (`OPENROUTER_API_KEY:` with no
    // value, or `=""`), because explicitly blanking the key is a SAFE act and a
    // guard that punishes it teaches people to stop writing it.
    sample: '          OPENROUTER_API_KEY: sk-or-v1-deadbeef',
    test: (line) => {
      const m = /OPENROUTER_API_KEY\s*[:=]\s*(.*)$/.exec(line);
      if (!m) return false;
      const value = m[1].trim().replace(/^['"]|['"]$/g, '').trim();
      return value.length > 0;
    },
  },
  {
    id: 'unguarded-harness',
    why: `invokes the conformance harness without going through \`${GUARD_REF} exec\`, so nothing pins its mode`,
    sample: '        run: pnpm --filter @kitn.ai/ui-example-openrouter-spike conformance',
    // DENY-BY-DEFAULT, and the reason the other five rules are a convenience
    // rather than the defence. Any way of reaching the harness -- a package
    // script, playwright directly, a shell wrapper someone adds next year -- is
    // flagged unless the same line hands it to `exec`, which is the only code
    // path that refuses a live mode and scrubs the credential.
    test: (line) => {
      if (line.includes(GUARD_REF)) return false;
      // Case-insensitive on purpose. A `run:` line is prose as often as it is a
      // command, and matching only lowercase would make the rule's coverage
      // depend on how someone happened to capitalise a script name.
      const invokesHarness =
        /\bconformance(?::[a-z]+)?\b/i.test(line) ||
        /playwright\s+test[^\n]*harness\/playwright\.config/i.test(line);
      return invokesHarness && /\brun\s*:|\bnode\b|\bpnpm\b|\bnpx\b/.test(line);
    },
  },
];

/** A workflow that is safe, and must draw ZERO findings. Every construct here is
 *  one the real job below actually uses, so a rule that is too greedy fails the
 *  self-test instead of failing a contributor's unrelated PR. */
const CLEAN_SAMPLE = `
name: test
jobs:
  spike-conformance:
    steps:
      - name: Conformance harness (replay)
        env:
          SPIKE_MODE: replay
          OPENROUTER_API_KEY:
        run: node .github/scripts/spike-ci-guard.mjs exec -- pnpm --filter @kitn.ai/ui-example-openrouter-spike conformance
      - name: Spike unit tests
        run: pnpm --filter @kitn.ai/ui-example-openrouter-spike test
      - name: Spike typecheck
        run: pnpm --filter @kitn.ai/ui-example-openrouter-spike typecheck
`;

function scanText(text, label) {
  const findings = [];
  text.split('\n').forEach((line, i) => {
    if (/^\s*#/.test(line)) return; // a comment cannot spend
    for (const rule of RULES) {
      if (rule.test(line)) findings.push({ rule, file: label, line: i + 1, text: line.trim() });
    }
  });
  return findings;
}

// ── the self-test ────────────────────────────────────────────────────────────
//
// Runs BEFORE the real scan, every time, and hard-fails the whole command if it
// does not behave. "0 findings" has to mean "nothing dangerous", never "the
// rules stopped matching anything".
function selfTest() {
  const problems = [];

  for (const rule of RULES) {
    const hits = scanText(rule.sample, `<self-test:${rule.id}>`);
    if (!hits.some((h) => h.rule.id === rule.id)) {
      problems.push(
        `rule \`${rule.id}\` did NOT flag its own known-bad sample:\n      ${rule.sample.trim()}\n` +
          '    A rule that cannot fire is a rule that proves nothing.',
      );
    }
  }

  const falsePositives = scanText(CLEAN_SAMPLE, '<self-test:clean>');
  for (const f of falsePositives) {
    problems.push(
      `rule \`${f.rule.id}\` flagged the KNOWN-GOOD sample at line ${f.line}:\n      ${f.text}\n` +
        '    A rule this greedy will fail unrelated PRs and get switched off.',
    );
  }

  if (problems.length) {
    console.error(red(bold('\nspike-ci-guard SELF-TEST FAILED\n')));
    for (const p of problems) console.error(`  - ${p}\n`);
    console.error('The audit below would have been meaningless, so it did not run.\n');
    process.exit(1);
  }

  console.log(
    `spike-ci-guard self-test: ${RULES.length} rules each fired on their known-bad sample, ` +
      '0 findings on the known-good sample.',
  );
}

// ── audit ────────────────────────────────────────────────────────────────────
function audit() {
  selfTest();

  if (!existsSync(WORKFLOW_DIR)) {
    console.error(red(`No workflow directory at ${WORKFLOW_DIR}. Refusing to report "clean".`));
    process.exit(1);
  }

  const files = readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f));
  if (files.length === 0) {
    console.error(red('No workflow files found. Refusing to report "clean" over an empty set.'));
    process.exit(1);
  }

  const findings = files.flatMap((f) =>
    scanText(readFileSync(join(WORKFLOW_DIR, f), 'utf8'), `.github/workflows/${f}`),
  );

  if (findings.length) {
    console.error(red(bold('\nA workflow can spend real money on model calls.\n')));
    for (const f of findings) {
      console.error(`  ${bold(`${f.file}:${f.line}`)}`);
      console.error(`    ${f.text}`);
      console.error(`    ${red(`[${f.rule.id}]`)} ${f.rule.why}\n`);
    }
    console.error(
      'The openrouter spike harness bills a real account in live mode. CI runs it in\n' +
        'REPLAY only, from committed fixtures -- no key, no network, no cost.\n\n' +
        `Route the harness through the guard instead:\n\n` +
        `    run: node .github/scripts/spike-ci-guard.mjs exec -- <your harness command>\n\n` +
        'If you genuinely need a live run, do it locally and deliberately:\n' +
        '`pnpm --filter @kitn.ai/ui-example-openrouter-spike conformance:live` with a key in\n' +
        '.env.local. See examples/internal/openrouter-spike/HARNESS.md.\n',
    );
    process.exit(1);
  }

  console.log(`spike-ci-guard audit: ${files.length} workflow files, no path to a live model call.`);
}

// ── exec ─────────────────────────────────────────────────────────────────────
function execGuarded(argv) {
  const sep = argv.indexOf('--');
  const command = sep === -1 ? [] : argv.slice(sep + 1);
  if (command.length === 0) {
    console.error('usage: spike-ci-guard.mjs exec -- <command> [args...]');
    process.exit(1);
  }

  // GitHub Actions sets both. Either is enough to mean "nobody is watching this
  // run, and nobody chose to spend money on it".
  const inCI = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
  const requested = process.env.SPIKE_MODE;

  // Refused ANYWHERE, not only on CI. `exec` always replays, so honouring a live
  // request is impossible and silently downgrading it to replay would be worse
  // than failing: the caller asked for live, would be handed offline results,
  // and nothing would say so. That is the same shape as the bug that recorded
  // S13 as a confirmed gap while its stream was replaying in the wrong dialect
  // and parsing to nothing. Only the REASON differs by context.
  if (requested !== undefined && requested !== FREE_MODE) {
    console.error(
      red(bold(`\nREFUSING: SPIKE_MODE=${JSON.stringify(requested)} through a wrapper that only ever replays.\n`)),
    );
    if (inCI) {
      console.error(
        `  This is a CI context, and only ${JSON.stringify(FREE_MODE)} is free.\n\n` +
          '  Live mode drives real models through OpenRouter and bills a real account.\n' +
          '  A measured five-configuration sweep came to $0.1019 (HARNESS.md, "Cost").\n' +
          '  Live runs are manual and deliberate on purpose -- run one locally with a key\n' +
          '  in .env.local, never from a workflow.\n',
      );
    } else {
      console.error(
        '  Not a CI context, so this is not a spend risk -- but this wrapper pins replay\n' +
          '  unconditionally, and returning offline results to someone who asked for live\n' +
          '  would be a false measurement rather than a saving.\n\n' +
          '  For a real live run, call the harness directly and deliberately:\n' +
          '      pnpm --filter @kitn.ai/ui-example-openrouter-spike conformance:live\n',
      );
    }
    process.exit(1);
  }

  // Refuse a credential FILE too. Scrubbing the environment below does nothing
  // about `.env.local`, which is what the proxy's loadEnv actually reads, and a
  // workflow step that writes a secret to that path would otherwise sail past
  // every check here. It is gitignored and cannot arrive from a checkout, so on
  // CI its presence means a step deliberately created it.
  if (inCI) {
    for (const name of ['.env.local', '.env']) {
      const path = join(SPIKE_DIR, name);
      if (existsSync(path)) {
        console.error(red(bold(`\nREFUSING to run: ${name} exists in the spike on CI.\n`)));
        console.error(
          `  ${path}\n\n` +
            '  That file is where the proxy looks for OPENROUTER_API_KEY. It is gitignored,\n' +
            '  so on CI it can only have been written by an earlier step -- which means this\n' +
            '  run is one config change away from spending money. Remove the step.\n',
        );
        process.exit(1);
      }
    }
  }

  // Pin it. Setting the variable rather than trusting the harness's default is
  // the point: `replay` is currently what an unset SPIKE_MODE falls back to, but
  // an explicit value is a decision this job made, not a default it inherited.
  const env = { ...process.env, SPIKE_MODE: FREE_MODE };

  // Scrub the credential from the child. Belt to the mode refusal's braces: even
  // if some future edit reaches the live branch, the proxy answers 503
  // `missing_key` and no request leaves the runner.
  delete env.OPENROUTER_API_KEY;

  console.log(
    `spike-ci-guard: SPIKE_MODE pinned to ${FREE_MODE}` +
      `${inCI ? ', OPENROUTER_API_KEY scrubbed from the child environment' : ' (not a CI context)'}.`,
  );
  console.log(`spike-ci-guard: running ${command.join(' ')}\n`);

  const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit', env });
  if (result.error) {
    console.error(red(`spike-ci-guard: could not run ${command[0]}: ${result.error.message}`));
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

const [, , cmd, ...rest] = process.argv;
if (cmd === 'audit') audit();
else if (cmd === 'exec') execGuarded(rest);
else {
  console.error('usage: spike-ci-guard.mjs <audit | exec -- <command>>');
  process.exit(1);
}
