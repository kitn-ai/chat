/**
 * GUARD — `verify-react-wrappers` still DETECTS, and `build` still runs it.
 *
 * The guard itself asserts that every `@kitn.ai/ui/elements/<X>` specifier in
 * dist/react.js resolves to a real emitted element file, and that the bundle opens
 * with 'use client'. Both failures are silent in production: a 404 on the lazy import
 * means `<Chat>` never registers, and a missing banner means RSC rejects the hooks.
 * It runs in `build`, and `prepublishOnly` runs `build`, so it gates every publish.
 *
 * This file exists because of HOW that guard would be lost: the `--self-test` half
 * dropping off the npm script, the `build` chain dropping the step, or the check
 * degrading into one that matches no specifiers and exits 0 — "zero of zero resolve"
 * is a pass that has looked at nothing.
 *
 * The FIRST assertion is the odd one and is deliberate. This guard's recorded defect
 * was a false POSITIVE: run with the wrong cwd it reported all 78 wrappers as pointing
 * at missing files, a loud alarm about nothing. No planted defect can catch that,
 * because every planted defect expects red — so a healthy tree is asserted to draw
 * exactly zero findings.
 *
 * Watched failing, per assertion: dropping `--self-test` from `verify:react-wrappers`
 * turns the wiring case red, replacing the `npm run` step in `build` turns the build
 * case red, and neutering the analyzer (`const missing = []`) turns the missing-file
 * case red while the rest of this file stays green.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = 'scripts/verify-react-wrappers.mjs';
const NPM_SCRIPT = 'verify:react-wrappers';

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

/** A throwaway package root the guard can be pointed at with `--package-root`. */
function fixtureRoot(files: Record<string, string | null>): string {
  const root = mkdtempSync(join(tmpdir(), 'react-wrappers-guard-'));
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

/** Runs the guard as a real subprocess and returns its exit code plus output. */
function runGuard(args: string[]): { code: number; output: string } {
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

const ELS = ['kai-chat', 'kai-message', 'kai-thread'];
const bundle = (useClient = true) =>
  (useClient ? "'use client';\n" : '') +
  ELS.map((el) => `const load_${el.replace(/-/g, '_')} = () => import('@kitn.ai/ui/elements/${el}');`).join('\n');
const tree = (over: Record<string, string | null> = {}) => ({
  'dist/react.js': bundle(),
  ...Object.fromEntries(ELS.map((el) => [`dist/elements/${el}.js`, 'export const x = 1;\n'])),
  ...over,
});

describe('the react-wrappers guard detects, and build runs it', () => {
  it('ships the guard', () => {
    expect(existsSync(resolve(pkgRoot, SCRIPT)), `${SCRIPT} is missing`).toBe(true);
  });

  it(`\`${NPM_SCRIPT}\` runs the self-test half as well as the check`, () => {
    const cmd = pkg.scripts[NPM_SCRIPT];
    expect(cmd, `no \`${NPM_SCRIPT}\` script in packages/ui/package.json`).toBeTruthy();
    expect(
      cmd,
      `\`${NPM_SCRIPT}\` no longer runs \`--self-test\`. That half is what proves the check ` +
        `still DETECTS; without it a check that matches no specifier exits 0 and reads as clean.`,
    ).toContain('--self-test');
    expect(cmd, `\`${NPM_SCRIPT}\` no longer runs the check itself`).toContain(SCRIPT);
  });

  it('`build` invokes it, so `prepublishOnly` does too', () => {
    expect(
      pkg.scripts.build,
      `the \`build\` chain no longer runs \`${NPM_SCRIPT}\`. Nothing else checks that a React ` +
        `consumer's lazy element imports resolve.`,
    ).toContain(`npm run ${NPM_SCRIPT}`);
    expect(pkg.scripts.prepublishOnly, 'prepublishOnly no longer runs build').toContain('build');
  });

  it('draws ZERO findings on a healthy tree (the false-positive shape in its header)', () => {
    const { code, output } = runGuard(['--package-root', fixtureRoot(tree())]);
    expect(code, `the guard failed a healthy tree: ${output}`).toBe(0);
    expect(output).toContain('all 3 element specifiers resolve');
  });

  it('fires on a specifier whose element file was never emitted, and NAMES it', () => {
    const root = fixtureRoot(tree({ 'dist/elements/kai-thread.js': null }));
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, `the guard exited ${code} on a specifier pointing at a missing file`).not.toBe(0);
    expect(output).toContain('non-existent element files');
    expect(output, 'the offender is not named, so nobody can act on this').toContain('kai-thread');
    expect(output).not.toContain("missing its 'use client' banner");
  });

  it("fires on a bundle that lost its 'use client' banner", () => {
    const root = fixtureRoot(tree({ 'dist/react.js': bundle(false) }));
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, `the guard exited ${code} on a bundle with no 'use client'`).not.toBe(0);
    expect(output).toContain("missing its 'use client' banner");
    expect(output).not.toContain('non-existent element files');
  });

  it('treats a bundle it found no specifier in as a failure, not a pass', () => {
    // Zero specifiers satisfies "every specifier resolves" vacuously. That is the
    // wrapper generator having changed its import shape out from under this guard,
    // not a healthy bundle.
    const root = fixtureRoot(tree({ 'dist/react.js': "'use client';\nexport const Chat = () => null;\n" }));
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, 'a zero-specifier run exited 0, which reads as "all of them resolve"').not.toBe(0);
    expect(output).toContain('NO `@kitn.ai/ui/elements/<X>` specifier');
  });
});
