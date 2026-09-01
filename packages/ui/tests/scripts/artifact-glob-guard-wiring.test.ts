/**
 * GUARD -- the artifact-glob guard DETECTS, and CI runs it.
 *
 * The upload glob in the `build` leg is the new `outputs:` list: four downstream
 * legs see exactly what it names and nothing else, and they never run
 * `postbuild`, so a path left out is silently absent rather than stale. This
 * file exists because of how that guard would be lost -- the `--self-test` half
 * dropping off the npm script, or CI dropping the step.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiredGateBlock } from './lib/required-gate-block';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(pkgRoot, '../..');
const WORKFLOW = resolve(repoRoot, '.github/workflows/test.yml');
const SCRIPT = 'scripts/verify-artifact-glob.mjs';
const NPM_SCRIPT = 'verify:artifact-glob';

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

function run(args: string[]): { code: number; output: string } {
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

describe('the artifact-glob guard detects, and CI runs it', () => {
  it('ships the guard', () => {
    expect(existsSync(resolve(pkgRoot, SCRIPT)), `${SCRIPT} is missing`).toBe(true);
  });

  it(`\`${NPM_SCRIPT}\` runs the self-test half as well as the check`, () => {
    const script = pkg.scripts[NPM_SCRIPT];
    expect(script, `no \`${NPM_SCRIPT}\` script in packages/ui/package.json`).toBeTruthy();
    expect(script, `\`${NPM_SCRIPT}\` no longer runs \`--self-test\``).toContain('--self-test');
    expect(script, `\`${NPM_SCRIPT}\` no longer runs the check itself`).toContain(SCRIPT);
  });

  it('refuses a run with no pre-build snapshot instead of covering nothing', () => {
    // Rooted at a FIXTURE tree that already has the upload step, not at this
    // repo. The guard checks the workflow before the snapshot, so on a tree
    // where the step does not exist yet this case would pass on the wrong
    // refusal and stop saying anything about vacuity. The fixture makes it
    // reach the check it is named for, on every tree, before and after the
    // split lands.
    const tmp = mkdtempSync(join(tmpdir(), 'artifact-glob-'));
    try {
      mkdirSync(join(tmp, '.github/workflows'), { recursive: true });
      writeFileSync(
        join(tmp, '.github/workflows/test.yml'),
        [
          'jobs:',
          '  build:',
          '    steps:',
          '      - name: Upload the kit build for the downstream legs',
          '        uses: actions/upload-artifact@v4',
          '        with:',
          '          path: |',
          '            packages/ui/dist/**',
          '',
        ].join('\n'),
      );
      const { code, output } = run(['--repo-root', tmp]);
      expect(code, `a run with no snapshot exited 0:\n${output}`).not.toBe(0);
      expect(output).toContain('ARTIFACT_GLOB_BEFORE');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('its self-test proves it detects an uncovered path', () => {
    const { code, output } = run(['--self-test']);
    expect(code, `the self-test failed:\n${output}`).toBe(0);
    expect(output).toContain('THE DEFECT');
  });

  it('is invoked by the REQUIRED gate graph in CI', () => {
    // Two vacuity guards, and they answer different questions now that the gate
    // is a GRAPH. The empty check catches a renamed root job; the `--project=unit`
    // canary catches a graph that stopped reaching the leg that runs the suite,
    // which is what a dropped `needs:` edge looks like from in here.
    const block = requiredGateBlock(readFileSync(WORKFLOW, 'utf-8'));
    expect(block, `no \`test:\` job found in ${WORKFLOW}`).not.toBe('');
    expect(
      block,
      'the required gate graph no longer runs the unit project either -- read this guard',
    ).toContain('--project=unit');
    expect(
      block,
      `the gate graph does not run \`${NPM_SCRIPT}\`. Without it the upload glob is a list nobody ` +
        `checks, and a build-written path left out of it is absent downstream rather than stale.`,
    ).toContain(NPM_SCRIPT);
  });

  it('the upload step it reads is the one the legs download', () => {
    const block = requiredGateBlock(readFileSync(WORKFLOW, 'utf-8'));
    expect(block, 'no upload step in the gate graph').toContain(
      'Upload the kit build for the downstream legs',
    );
  });
});
