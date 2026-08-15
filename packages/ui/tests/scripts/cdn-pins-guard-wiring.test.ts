/**
 * GUARD — `lint:cdn-pins` still DETECTS, and CI still runs it.
 *
 * The guard itself keeps hand-typed `@kitn.ai/ui@<version>` CDN pins equal to
 * packages/ui/package.json. It exists because the docs correctly tell people to
 * pin an exact version for CDN use, and every pin was then a literal nobody
 * updated: when a Critical advisory landed against 0.14.1-0.24.0, four
 * copy-pasteable URLs across the docs and the npm README were still handing
 * readers 0.20.1 and 0.16.0. npm warns when you install a deprecated version;
 * a CDN fetch warns about nothing.
 *
 * This file exists because of HOW that guard would be lost. Not by someone
 * deleting it: by the `--self-test` half dropping off the npm script, by CI
 * dropping the step, or by the walk degrading into a scan that matches no file
 * and exits 0. All three make CI faster and greener while covering less, and a
 * linter that matches nothing looks identical to a clean tree from outside.
 *
 * So the last two assertions do not trust the script's own self-report. They RUN
 * it against synthesized trees -- one with a stale pin, one with no pin at all --
 * and require a non-zero exit from each.
 *
 * Watched failing, per assertion: deleting the `--self-test` half turns the
 * second red naming the script, deleting the CI step turns the third red naming
 * the job, and neutering the comparison to `f.stale = false` turns the fourth
 * red while leaving every other test in this suite green.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(pkgRoot, '../..');
const WORKFLOW = resolve(repoRoot, '.github/workflows/test.yml');
const SCRIPT = 'scripts/lint-cdn-pins.mjs';
const NPM_SCRIPT = 'lint:cdn-pins';

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
  version: string;
};

/**
 * The body of one top-level job in a GitHub workflow. Same crude extraction as
 * tests/scripts/silent-drop-guard-wiring.test.ts, for the same reason -- the repo
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

/** A throwaway repo root the linter can be pointed at with `--repo-root`. */
function fixtureRoot(docBody: string, version = '0.25.0'): string {
  const root = mkdtempSync(join(tmpdir(), 'cdn-pins-guard-'));
  mkdirSync(join(root, 'packages/ui'), { recursive: true });
  mkdirSync(join(root, 'apps/docs'), { recursive: true });
  writeFileSync(
    join(root, 'packages/ui/package.json'),
    `${JSON.stringify({ name: '@kitn.ai/ui', version }, null, 2)}\n`,
  );
  writeFileSync(join(root, 'apps/docs/installation.md'), docBody);
  return root;
}

/** Runs the linter and returns its exit code plus combined output. */
function runLinter(args: string[]): { code: number; output: string } {
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

describe('the CDN pin guard detects, and CI runs it', () => {
  it('ships the linter', () => {
    expect(existsSync(resolve(pkgRoot, SCRIPT)), `${SCRIPT} is missing`).toBe(true);
  });

  it('`lint:cdn-pins` runs the self-test half as well as the scan', () => {
    const script = pkg.scripts[NPM_SCRIPT];
    expect(script, `no \`${NPM_SCRIPT}\` script in packages/ui/package.json`).toBeTruthy();
    expect(
      script,
      `\`${NPM_SCRIPT}\` no longer runs \`--self-test\`. That half is what proves the ` +
        `analyzer still DETECTS; without it a scan that silently matches nothing exits 0 ` +
        `and reads as a clean tree.`,
    ).toContain('--self-test');
    expect(script, `\`${NPM_SCRIPT}\` no longer runs the scan itself`).toContain(SCRIPT);
  });

  it('is invoked by the REQUIRED `test` job in CI', () => {
    const block = jobBlock(readFileSync(WORKFLOW, 'utf-8'), 'test');

    // If the extraction ever returns nothing (the job was renamed, the indentation
    // changed), everything below would pass vacuously. Fail here instead.
    expect(block, `no \`test:\` job found in ${WORKFLOW}`).not.toBe('');
    expect(
      block,
      'the `test` job no longer runs the unit project either — read this guard',
    ).toContain('--project=unit');
    expect(
      block,
      `the \`test\` job does not run \`${NPM_SCRIPT}\`. It is the only check that a CDN ` +
        `URL in the docs or the npm README still points at a version anyone should load; ` +
        `without it the pins silently rot one release at a time.`,
    ).toContain(NPM_SCRIPT);
  });

  it('actually fires on a stale pin, and names the advisory when one applies', () => {
    // The exact line that shipped on ui.kitn.ai. Not a self-report -- the linter
    // is run against a real tree and must exit non-zero.
    const root = fixtureRoot(
      'Pin an exact version: `https://cdn.jsdelivr.net/npm/@kitn.ai/ui@0.20.1/dist/kai.es.js`.\n',
    );
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, `the linter exited ${code} on a pin four minor versions behind`).not.toBe(0);
    expect(output).toContain('0.20.1');
    expect(output).toContain('CRITICAL ADVISORY');
  });

  it('fires on a stale pin that is NOT vulnerable, because staleness is the rule', () => {
    // The recurrence this guard is really for: the NEXT release, where the pin is
    // merely out of date rather than dangerous. If only advisory-range versions
    // fired, the guard would go quiet the moment this incident was cleaned up.
    const root = fixtureRoot(
      'Pin: `https://cdn.jsdelivr.net/npm/@kitn.ai/ui@0.25.0/dist/kai.es.js`.\n',
      '0.26.0',
    );
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, 'a pin one minor behind the manifest exited 0').not.toBe(0);
    expect(output).toContain('0.26.0');
    expect(output).not.toContain('CRITICAL ADVISORY');
  });

  it('passes when the pin matches the manifest', () => {
    const root = fixtureRoot(
      'Pin: `https://cdn.jsdelivr.net/npm/@kitn.ai/ui@0.25.0/dist/kai.es.js`.\n',
    );
    const { code } = runLinter(['--repo-root', root]);
    expect(code, 'a correct pin was reported as a failure').toBe(0);
  });

  it('treats a run that finds no pin at all as a failure, not a pass', () => {
    // A tree the walk finds no pin in means the walk is broken or the scope moved,
    // NOT that every pin is current. Exiting 0 here is this repo's most expensive
    // recurring defect, and it is why this guard's vacuity tripwire is zero
    // MATCHES rather than zero files: it scans for something the docs recommend.
    const root = fixtureRoot('Load it from a CDN. No version pinned in this prose.\n');
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, 'a zero-pin run exited 0, which reads as "nothing was wrong"').not.toBe(0);
    expect(output).toContain('NO `@kitn.ai/ui@<version>` pin');
  });

  it('waives a historical record instead of demanding it be rewritten', () => {
    // Incident reports name the release they describe. Rewriting one to the current
    // version to satisfy a linter would turn a record into a falsehood.
    const root = fixtureRoot(
      '`@kitn.ai/ui@0.25.0` is current.\n' +
        '<!-- lint-cdn-pins: historical -- an incident report; the version IS the record -->\n' +
        'The run that published `@kitn.ai/ui@0.24.0` then died.\n',
    );
    const { code } = runLinter(['--repo-root', root]);
    expect(code, 'a waived historical pin was still reported').toBe(0);
  });

  it('does not accept prose as a waiver, only the parsed directive', () => {
    // The defect this guard was built from was ALREADY surrounded by prose saying
    // the pin was deliberate. A rule honouring comments would have passed it.
    const root = fixtureRoot(
      '`@kitn.ai/ui@0.25.0` is current.\n' +
        'Deliberately pinned for reproducibility, do not bump: `@kitn.ai/ui@0.20.1`.\n',
    );
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, 'prose explaining the pin was accepted as a waiver').not.toBe(0);
    expect(output).toContain('0.20.1');
  });
});
