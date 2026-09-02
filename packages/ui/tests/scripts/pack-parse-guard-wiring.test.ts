/**
 * GUARD — `lint:pack-parse` still DETECTS, and CI still runs it.
 *
 * The guard itself requires every script reading `npm pack --json` to go through
 * <repo>/scripts/pack-listing.mjs, the one parser that knows both container
 * shapes. npm 12 made the top level an object keyed by package name, so
 * `JSON.parse(raw)[0]` is `undefined` under it. That is not a hypothetical: it
 * killed a publish that was already half-done, leaving a broken create-kai on
 * the registry whose own fix could not ship.
 *
 * WHY THE GUARD IS THE INTERESTING PART. #241 fixed the site that broke and
 * wrote the shared parser. Three more hand-rolled copies of the same parse sat
 * in packages/ui/scripts untouched, because nothing related the four sites to
 * one another — the fix taught the other three nothing, and each stayed green
 * under CI's npm 10 while being broken under the npm that publishes. Fixing four
 * sites is worth much less than making a fifth one impossible to add quietly.
 *
 * This file exists because of HOW that guard would be lost. Not by deletion: by
 * the `--self-test` half dropping off the npm script, by CI dropping the step,
 * or by the scan degrading into a walk that matches no file and exits 0. All
 * three make CI greener while covering less, and a linter that matches nothing
 * is indistinguishable from a clean tree.
 *
 * So the detection assertions do not trust the script's own self-report. They
 * RUN it against synthesized trees — one hand-parsing, one routed through the
 * parser, one with no pack reader at all — and require the exit codes to differ.
 *
 * Watched failing, per assertion: dropping `--self-test` from the npm script
 * turns the second red; removing the CI step turns the third; removing the
 * VERIFY_PACK_NPM line for packages/ui turns the fourth; and neutering
 * `isPackReader` to `() => false` turns the detection block red while leaving
 * this file's wiring assertions green.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiredGateBlock } from './lib/required-gate-block';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(pkgRoot, '../..');
const WORKFLOW = resolve(repoRoot, '.github/workflows/test.yml');
const SCRIPT = 'scripts/lint-pack-json-parse.mjs';
const NPM_SCRIPT = 'lint:pack-parse';

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

function runLinter(args: string[]): { code: number; output: string } {
  try {
    const output = execFileSync('node', [resolve(pkgRoot, SCRIPT), ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** A throwaway repo root holding one script under `packages/thing/scripts/`. */
function fixtureRoot(source: string): string {
  const root = mkdtempSync(join(tmpdir(), 'pack-parse-'));
  mkdirSync(join(root, 'packages/thing/scripts'), { recursive: true });
  writeFileSync(join(root, 'packages/thing/scripts/verify.mjs'), source);
  return root;
}

const PACK = `execFileSync('npm', ['pack', '--json', '--pack-destination', tmp], opts)`;

describe('lint:pack-parse is wired into the build and CI', () => {
  it('the npm script exists', () => {
    expect(pkg.scripts[NPM_SCRIPT], `\`${NPM_SCRIPT}\` is gone from package.json`).toBeDefined();
  });

  it(`\`${NPM_SCRIPT}\` runs the self-test half as well as the scan`, () => {
    // The self-test is what covers the analyzer itself. Dropping it leaves a
    // scan that can quietly stop detecting while still exiting 0.
    expect(
      pkg.scripts[NPM_SCRIPT],
      `\`${NPM_SCRIPT}\` no longer runs \`--self-test\`, so nothing proves the analyzer detects.`,
    ).toContain('--self-test');
    expect(pkg.scripts[NPM_SCRIPT]).toContain(SCRIPT);
  });

  it('the CI test job runs it', () => {
    const job = requiredGateBlock(readFileSync(WORKFLOW, 'utf-8'));
    expect(job, 'parsed no `test` job — the extraction is broken').not.toBe('');
    expect(
      job,
      `the \`test\` job no longer runs \`${NPM_SCRIPT}\`; the defect goes back to being ` +
        `invisible until an npm bump.`,
    ).toContain(NPM_SCRIPT);
  });

  it("packages/ui's verify:pack is exercised under the npm the release job pins", () => {
    // The end-to-end half. packages/ui had the same defect as create-kai and was
    // never run under npm 12 either; CI's node 22 bundles npm 10, which is the
    // shape that works. Without this line the ui guard is back to being tested
    // only under the npm that cannot reveal the problem.
    const job = requiredGateBlock(readFileSync(WORKFLOW, 'utf-8'));
    const pinned = job
      .split('\n')
      .filter((l) => l.includes('VERIFY_PACK_NPM'))
      .join('\n');
    expect(pinned, 'no VERIFY_PACK_NPM step at all in the test job').not.toBe('');
    expect(
      pinned,
      'the pinned-npm step no longer runs @kitn.ai/ui verify:pack',
    ).toContain('@kitn.ai/ui run verify:pack');
    expect(
      pinned,
      'the pinned-npm step no longer runs create-kai verify:pack',
    ).toContain('create-kai run verify:pack');
  });
});

describe('the linter actually detects, graded against real trees', () => {
  it('its own self-test passes', () => {
    const { code, output } = runLinter(['--self-test']);
    expect(code, output).toBe(0);
    expect(output).toContain('cases behave as specified');
  });

  it('rejects a script that hand-parses the listing', () => {
    const root = fixtureRoot(`${PACK}\nconst t = join(tmp, packed[0].filename);\n`);
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, 'a hand-parsing pack reader was accepted').not.toBe(0);
    expect(output).toContain('packages/thing/scripts/verify.mjs');
  });

  it('rejects a script that imports the parser but indexes [0] anyway', () => {
    // An import is not use. A rule checking only the import statement passes
    // this file while it carries the exact defect.
    const root = fixtureRoot(
      `import { readPackedFilename } from '../../../scripts/pack-listing.mjs';\n` +
        `const packed = JSON.parse(${PACK});\nconst t = packed[0].filename;\n`,
    );
    const { code } = runLinter(['--repo-root', root]);
    expect(code, 'an unused import was accepted as going through the parser').not.toBe(0);
  });

  it('accepts a script that goes through the parser', () => {
    // THE CONTROL. Without this, a linter that rejects everything would satisfy
    // both rejection cases above.
    const root = fixtureRoot(
      `import { readPackedFilename } from '../../../scripts/pack-listing.mjs';\n` +
        `const { filename } = readPackedFilename(${PACK}, { npmVersion });\n`,
    );
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, output).toBe(0);
  });

  it('fails a tree with no pack reader at all, instead of passing vacuously', () => {
    // The zero-match tripwire. A scan matching nothing looks exactly like a
    // clean tree from CI, and this repo has shipped a check that did that.
    const root = fixtureRoot(`const meta = JSON.parse(readFileSync(p))[0];\n`);
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, 'a tree with nothing to check exited 0').not.toBe(0);
    expect(output).toContain('no scripts invoking');
  });
});
