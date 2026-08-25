/**
 * GUARD — `lint:llms-size` still DETECTS, and CI still runs it.
 *
 * The guard itself keeps the committed llms-full.txt under a byte ceiling (and
 * over a truncation floor). This file exists because of HOW such a guard gets
 * lost, not because anyone would delete it: the `--self-test` half drops off
 * the npm script, CI drops the step, or the check degrades into one that can
 * no longer fail. Each makes CI faster and greener while covering less.
 *
 * The detection assertions do not trust the script's self-report: they RUN it
 * against fixture files (oversized, truncated, missing) via the same CLI the
 * npm script uses, and require a non-zero exit from each.
 *
 * Watched failing, per assertion: stripping `--self-test` from the npm script
 * turns the second red; removing the CI step turns the third red; each fixture
 * case was run red before the ceiling/floor defaults were finalized.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(pkgRoot, '../..');
const WORKFLOW = resolve(repoRoot, '.github/workflows/test.yml');
const SCRIPT = 'scripts/lint-llms-size.mjs';
const NPM_SCRIPT = 'lint:llms-size';

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

/**
 * The body of one top-level job in a GitHub workflow. Same crude extraction as
 * tests/scripts/cdn-pins-guard-wiring.test.ts, for the same reason — the repo
 * carries no YAML parser and the question is answerable from the job's lines.
 */
function jobBlock(yaml: string, job: string): string {
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

/** Runs the check and returns its exit code plus combined output. */
function runCheck(args: string[]): { code: number; output: string } {
  try {
    const stdout = execFileSync('node', [resolve(pkgRoot, SCRIPT), ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** A fixture file of exactly `bytes` bytes. */
function fixtureFile(bytes: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'llms-size-wiring-'));
  const path = join(dir, 'llms-full.txt');
  writeFileSync(path, 'x'.repeat(bytes));
  return path;
}

describe('the llms-full.txt size budget detects, and CI runs it', () => {
  it('ships the check', () => {
    expect(existsSync(resolve(pkgRoot, SCRIPT)), `${SCRIPT} is missing`).toBe(true);
  });

  it('`lint:llms-size` runs the self-test half as well as the real check', () => {
    const script = pkg.scripts[NPM_SCRIPT];
    expect(script, `no \`${NPM_SCRIPT}\` script in packages/ui/package.json`).toBeTruthy();
    expect(
      script,
      `\`${NPM_SCRIPT}\` no longer runs \`--self-test\`. That half is what proves the check ` +
        `still DETECTS; without it a measurement that silently broke exits 0 and reads as ` +
        `a file within budget.`,
    ).toContain('--self-test');
    expect(script, `\`${NPM_SCRIPT}\` no longer runs the check itself`).toContain(SCRIPT);
  });

  it('is invoked by the REQUIRED `test` job in CI', () => {
    const block = jobBlock(readFileSync(WORKFLOW, 'utf-8'), 'test');
    // If the extraction ever returns nothing (job renamed, indentation changed),
    // everything below would pass vacuously. Fail here instead.
    expect(block, `no \`test:\` job found in ${WORKFLOW}`).not.toBe('');
    expect(
      block,
      `the \`test\` job does not run \`${NPM_SCRIPT}\`. It is the only check that prices ` +
        `llms-full.txt growth; without it the file bloats one generated section at a time.`,
    ).toContain(NPM_SCRIPT);
  });

  it('actually fires on an oversized file, and its failure text names the options', () => {
    const path = fixtureFile(3000);
    const { code, output } = runCheck(['--file', path, '--max-bytes', '2000', '--min-bytes', '10']);
    expect(code, 'an over-ceiling file exited 0').not.toBe(0);
    // The raise-with-a-note discipline is the point of the guard; the failure
    // text is where the author learns it.
    expect(output).toContain('TRIM');
    expect(output).toContain('RESTRUCTURE');
    expect(output).toContain('RAISE THE CEILING');
    expect(output).toContain('MAX_LLMS_FULL_BYTES');
  });

  it('fires on a truncated file (the gen-llms standalone collapse shape)', () => {
    const path = fixtureFile(5);
    const { code, output } = runCheck(['--file', path, '--max-bytes', '2000', '--min-bytes', '100']);
    expect(code, 'a near-empty artifact exited 0 under a ceiling-only mindset').not.toBe(0);
    expect(output).toContain('truncation');
  });

  it('treats a MISSING artifact as a failure, not a skip', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'llms-size-wiring-')), 'nope.txt');
    const { code, output } = runCheck(['--file', path]);
    expect(code, 'a missing committed artifact exited 0').not.toBe(0);
    expect(output).toContain('does not exist');
  });

  it('passes a file within budget', () => {
    const path = fixtureFile(1500);
    const { code, output } = runCheck(['--file', path, '--max-bytes', '2000', '--min-bytes', '10']);
    expect(code, `a within-budget file was reported as a failure:\n${output}`).toBe(0);
  });

  it('the real committed artifact is currently within its budget', () => {
    // Not a fixture: the tree itself, under the shipped ceiling and floor. If
    // this fails, CI's step fails too — fix it there, not here.
    const { code, output } = runCheck([]);
    expect(code, `llms-full.txt is out of budget:\n${output}`).toBe(0);
  });
});
