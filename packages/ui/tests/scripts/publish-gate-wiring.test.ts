/**
 * GUARD — the npm publish is still gated on the commit's required checks.
 *
 * Before the gate existed, `release-please.yml` published to npm with no `needs:`
 * and no status check of any kind. It and `test.yml` are separate workflows on
 * the same `push: main` trigger, so they race and the publish wins: on af6f7717
 * the `release` workflow finished at 01:30:57 and the required `test` check did
 * not conclude until 01:39:48. On 12a51dad the same race resolved the other way —
 * `release` completed at 01:56:58 and `test` FAILED at 02:04:17. Four releases
 * went out on that basis.
 *
 * This file exists because of HOW that gate would be lost, which is never by
 * someone deleting it in a commit called "remove the publish gate". It is lost by
 * the step's `if:` drifting narrower than the publish step's, by a
 * `continue-on-error: true` added to get one stuck release out, by the `--require`
 * list emptying, or by the script decaying into something that exits 0 on
 * everything. Each of those leaves a workflow that still LOOKS gated, and a
 * `release` job that is green either way.
 *
 * So the assertions are structural where they can be, and where they cannot they
 * RUN the gate and require a non-zero exit. Nothing here trusts the script's own
 * self-report, and nothing here touches the network.
 *
 * Watched failing, per assertion: narrowing the gate's `if:` by one character
 * turns the condition test red; adding `continue-on-error: true` to the gate step
 * turns that one red; moving the gate below the publish step turns the ordering
 * one red; emptying `--require` turns that one red; and stubbing the resolver to
 * always return PASS turns the last two red while leaving the rest green.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(pkgRoot, '../..');
const WORKFLOW = resolve(repoRoot, '.github/workflows/release-please.yml');
const GATE = resolve(repoRoot, '.github/scripts/require-green-checks.mjs');
const GATE_REF = '.github/scripts/require-green-checks.mjs';
const PUBLISH_CMD = 'npm publish --access public';

const yaml = readFileSync(WORKFLOW, 'utf-8');

/**
 * The body of one top-level job. Same crude extraction as the other wiring tests
 * in this directory, for the same reason — the repo carries no YAML parser and
 * the question is answerable from the job's lines.
 */
function jobBlock(job: string): string {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => line === `  ${job}:`);
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^ {2}[A-Za-z0-9_-]+:/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** Split a job body into its individual steps (chunks starting `      - `). */
function steps(block: string): string[] {
  const out: string[] = [];
  let current: string[] | null = null;
  for (const line of block.split('\n')) {
    if (/^ {6}- /.test(line)) {
      if (current) out.push(current.join('\n'));
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) out.push(current.join('\n'));
  return out;
}

/** The `if:` expression of a step, verbatim. */
function condition(step: string): string | null {
  const m = step.match(/^\s*if:\s*(.+?)\s*$/m);
  return m ? m[1] : null;
}

const release = jobBlock('release');
const releaseSteps = steps(release);
const gateStep = releaseSteps.find((s) => s.includes(GATE_REF));
const publishStep = releaseSteps.find((s) => s.includes(PUBLISH_CMD));

/** Runs the gate binary and returns its exit code plus combined output. */
function runGate(args: string[]): { code: number; output: string } {
  try {
    const stdout = execFileSync('node', [GATE, ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('the npm publish is gated on the required checks passing', () => {
  it('ships the gate script', () => {
    expect(existsSync(GATE), `${GATE_REF} is missing`).toBe(true);
  });

  it('finds the release job and its publish step', () => {
    // If either extraction returns nothing (the job renamed, the publish
    // rewritten), every assertion below would pass vacuously. Fail here instead.
    expect(release, `no \`release:\` job found in ${WORKFLOW}`).not.toBe('');
    expect(releaseSteps.length, 'the release job parsed to no steps').toBeGreaterThan(3);
    expect(publishStep, `no step running \`${PUBLISH_CMD}\` — read this guard`).toBeTruthy();
  });

  it('runs the publish gate in the release job', () => {
    expect(
      gateStep,
      `the release job no longer runs \`${GATE_REF}\`. Without it the publish is back to ` +
        `racing test.yml and winning: nothing else in this workflow asks whether the commit ` +
        `being shipped to npm passed anything.`,
    ).toBeTruthy();
  });

  it('gates on the exact commit being published, not a branch or a recent run', () => {
    expect(
      gateStep,
      'the gate no longer scopes its query to `github.sha`. "Some recent green run" is the ' +
        'same illusion as no gate.',
    ).toContain('--sha "${{ github.sha }}"');

    const checkout = releaseSteps.find((s) => s.includes('actions/checkout'));
    expect(checkout, 'no checkout step in the release job').toBeTruthy();
    expect(
      checkout,
      'the checkout is no longer pinned to `github.sha`, so on workflow_dispatch the tree that ' +
        'gets published can differ from the SHA the gate vetted.',
    ).toContain('ref: ${{ github.sha }}');
  });

  it('names at least one required context', () => {
    // Quotes are stripped before counting: `--require ''` passes an empty string
    // to the gate, which is no required context at all. Counting raw tokens
    // scored that as one and let the mutation through — watched happening.
    const required = [...(gateStep ?? '').matchAll(/--require\s+(\S+)/g)]
      .map((m) => m[1].replace(/['"]/g, '').trim())
      .filter(Boolean);
    expect(
      required.length,
      'the gate step names no `--require` context. A gate with nothing to require is a ' +
        'decoration. The live list is printed by: gh api repos/kitn-ai/ui/rulesets/18328421 ' +
        "--jq '.rules[] | select(.type == \"required_status_checks\") | " +
        ".parameters.required_status_checks[].context'",
    ).toBeGreaterThan(0);
  });

  it('applies in exactly the cases the publish applies in', () => {
    // The gate is a STEP, so what makes it unskippable is that its condition is
    // the same one that lets the publish happen. Drift here — a narrower gate
    // condition — is the quiet way back to an ungated publish, and it would look
    // completely reasonable in a diff.
    const gateIf = condition(gateStep ?? '');
    const publishIf = condition(publishStep ?? '');
    expect(gateIf, 'the gate step has no `if:`').toBeTruthy();
    expect(publishIf, 'the publish step has no `if:`').toBeTruthy();
    expect(
      gateIf,
      'the publish gate and the publish step no longer share a condition. Whenever the publish ' +
        'can run and the gate cannot, the publish is ungated.',
    ).toBe(publishIf);
  });

  it('runs before the publish', () => {
    const gateAt = release.indexOf(GATE_REF);
    const publishAt = release.indexOf(PUBLISH_CMD);
    expect(gateAt).toBeGreaterThan(-1);
    expect(publishAt).toBeGreaterThan(-1);
    expect(
      gateAt,
      'the gate no longer precedes the publish. Steps run in order and a later gate vets ' +
        'something already on npm, which cannot be taken back.',
    ).toBeLessThan(publishAt);
  });

  it('cannot be neutered by continue-on-error', () => {
    expect(
      release,
      '`continue-on-error` appeared in the release job. On the gate step it turns a refusal ' +
        'into a warning and the publish proceeds anyway.',
    ).not.toContain('continue-on-error');
  });

  it('can read the checks it asks about', () => {
    // Not cosmetic: `permissions:` is an allowlist, so an unlisted scope is
    // `none`. Without these the API read fails, the gate refuses (fail-closed,
    // correctly) and every release is blocked — the other way this ships broken.
    const header = yaml.slice(0, yaml.indexOf('jobs:'));
    expect(header, 'the workflow no longer grants `checks: read`').toContain('checks: read');
    expect(header, 'the workflow no longer grants `statuses: read`').toContain('statuses: read');
  });

  it('keeps the idempotent per-package publish guard', () => {
    // release-please re-emits `releases_created` for the last release on the
    // first plain push after one; this existence check is what keeps that run
    // green instead of hard-failing on "cannot publish over <version>".
    expect(
      publishStep,
      'the `npm view <name>@<version>` idempotency guard is gone — a plain push to main will ' +
        'hard-fail the release job again.',
    ).toContain('npm view');
  });

  it('still DETECTS — the self-test passes in both directions', () => {
    const { code, output } = runGate(['--self-test']);
    expect(code, `the gate self-test exited ${code}:\n${output}`).toBe(0);
    // The accept scenarios are as load-bearing as the refuse ones: a gate that
    // refuses unconditionally passes every negative test ever written for it and
    // takes the release pipeline down the first time it runs.
    expect(output).toMatch(/must accept/);
    expect(output).toMatch(/must refuse/);
  });

  it('really refuses — the binary exits non-zero, it does not merely say so', () => {
    // Hermetic refusals, no network: an override asked for on a push event, and
    // an empty required list. Both must be non-zero from the actual process.
    const onPush = runGate([
      '--repo',
      'kitn-ai/ui',
      '--sha',
      'deadbeef',
      '--require',
      'test',
      '--event-name',
      'push',
      '--override',
      'true',
    ]);
    expect(
      onPush.code,
      'the emergency override was honoured on a push event. It must only ever be available ' +
        'to a human on workflow_dispatch.',
    ).not.toBe(0);
    expect(onPush.output).toContain('only available on workflow_dispatch');

    const empty = runGate(['--repo', 'kitn-ai/ui', '--sha', 'deadbeef', '--require', '']);
    expect(empty.code, 'a gate with no required context exited 0').not.toBe(0);
  });
});
