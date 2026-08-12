/**
 * GUARD — `verify:ssr` still RENDERS, and CI still runs it.
 *
 * The server guard used to only IMPORT every public entry. That is a real check,
 * but a component reading a DOM global at component-BODY scope sails through it:
 * the module resolves under `node`, and the process only dies when something
 * renders. Measured, not assumed — planting
 *
 *     const coarse = document.documentElement.dataset.theme === 'dark';
 *
 * in `Skeleton` left `verify:ssr` printing "all 9 required entries import cleanly
 * under `node`" and exiting 0, while a real `renderToString` of that same build
 * threw `document is not defined`.
 *
 * scripts/verify-ssr-render.mjs closes that. This file exists because of how it
 * would be lost: not by someone deleting the script, but by `verify:ssr` quietly
 * going back to one command, or by CI dropping the step. Either way the check
 * gets faster and greener while covering less, which is the exact shape of
 * failure this repo keeps hitting.
 *
 * Watched failing, per assertion: reverting the `verify:ssr` script to
 * `node scripts/verify-ssr-imports.mjs` turns the first two red naming the
 * script, and deleting the CI step turns the third red naming the job.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(pkgRoot, '../..');
const WORKFLOW = resolve(repoRoot, '.github/workflows/test.yml');
const RENDER_SCRIPT = 'scripts/verify-ssr-render.mjs';
const PROBE_SCRIPT = 'scripts/ssr-render-probe.mjs';

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

/**
 * The body of one top-level job in a GitHub workflow: everything from `  <name>:`
 * up to the next key at that same two-space indent. Same crude extraction as
 * tests/agent-tooling/emitted-project-wiring.test.ts, for the same reason — the
 * repo carries no YAML parser and the question is answerable from the job's lines.
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

describe('the SSR guard executes components, not just imports', () => {
  it('ships both halves of the render guard', () => {
    for (const script of [RENDER_SCRIPT, PROBE_SCRIPT]) {
      expect(existsSync(resolve(pkgRoot, script)), `${script} is missing`).toBe(true);
    }
  });

  it('`verify:ssr` runs the render guard, not only the import guard', () => {
    const script = pkg.scripts['verify:ssr'];
    expect(script, 'no `verify:ssr` script in packages/ui/package.json').toBeTruthy();
    expect(
      script,
      '`verify:ssr` no longer invokes ' +
        `${RENDER_SCRIPT}. Importing a module is not executing it: a DOM global read at ` +
        'component-body scope passes the import guard and still crashes a real server render.',
    ).toContain(RENDER_SCRIPT);
  });

  it('keeps a self-test the harness has to pass before it reports on anything', () => {
    const probe = readFileSync(resolve(pkgRoot, PROBE_SCRIPT), 'utf-8');
    // The probe renders one canary that MUST be classified a violation and one
    // that MUST produce markup. Without it, a harness that stopped detecting
    // anything -- a DOM shim in the probe, a renderToString that no-ops -- reads
    // as a clean tree.
    expect(probe, `${PROBE_SCRIPT} no longer emits a selftest event`).toContain("t: 'selftest'");
    expect(
      probe,
      `${PROBE_SCRIPT}'s positive canary no longer reads a browser global, so it proves nothing`,
    ).toMatch(/const positive = \(\) =>[^\n]*document\./);
  });

  it('is invoked by the REQUIRED `test` job in CI', () => {
    const block = jobBlock(readFileSync(WORKFLOW, 'utf-8'), 'test');

    // A failed extraction would make everything below pass vacuously.
    expect(block, `no \`test:\` job found in ${WORKFLOW}`).not.toBe('');
    expect(block, 'the `test` job no longer runs the unit project either — read this guard').toContain(
      '--project=unit',
    );
    expect(
      block,
      'the `test` job no longer runs `verify:ssr`. That is the only check that the built ' +
        'package can be loaded AND rendered on a server; without it an SSR/prerender/RSC ' +
        'crash reaches consumers exactly as it did through 0.20.0.',
    ).toContain('run verify:ssr');
  });
});
