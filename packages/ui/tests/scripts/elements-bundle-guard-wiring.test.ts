/**
 * GUARD — `verify-elements-bundle` still DETECTS, and `build` still runs it.
 *
 * The guard itself asserts the two independent things that have to hold for a
 * consumer of `@kitn.ai/ui/elements` to get any elements at all: our build keeps the
 * reference to the hashed registration chunk, and package.json `sideEffects` covers
 * that chunk so the consumer's bundler keeps its side effects. It is the last-but-two
 * step of `build`, and `prepublishOnly` runs `build`, so it gates every publish.
 *
 * This file exists because of HOW that guard would be lost. Not by someone deleting
 * it: by the `--self-test` half dropping off the npm script, by the `build` chain
 * dropping the step, or by the check degrading into one that classifies nothing and
 * exits 0. It has ALREADY been the third of those — it was green through the release
 * that shipped the uncovered-chunk defect, because at the time it only checked the
 * reference. A guard that looks at nothing is indistinguishable from a clean tree.
 *
 * So the assertions that matter do not trust the script's own self-report. They RUN
 * it against synthesized package roots — one per planted defect, and one where it can
 * classify no registration chunk at all — and require a non-zero exit from each.
 *
 * Watched failing, per assertion: dropping `--self-test` from `verify:elements-bundle`
 * turns the second red naming the script, replacing the `npm run` step in `build`
 * turns the third red, and neutering the analyzer (`const uncovered = []`) turns the
 * uncovered-chunk case red while the rest of this file stays green.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = 'scripts/verify-elements-bundle.mjs';
const NPM_SCRIPT = 'verify:elements-bundle';

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

/** A throwaway package root the guard can be pointed at with `--package-root`. */
function fixtureRoot(files: Record<string, string | null>): string {
  const root = mkdtempSync(join(tmpdir(), 'elements-bundle-guard-'));
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

const TAGS = ['kai-chat', 'kai-message', 'kai-thread', 'kai-prompt-input', 'kai-markdown', 'kai-toast'];
const CHUNK = TAGS.map((t) => `customElements.define("${t}", C);`).join('\n');
const tree = (over: Record<string, string | null> = {}) => ({
  'package.json': JSON.stringify({
    sideEffects: ['**/*.css', './dist/kai.es.js', './dist/register-impl-*.js', './dist/elements/*.js'],
  }),
  'src/elements/element-manifest.json': JSON.stringify({ tags: Object.fromEntries(TAGS.map((t) => [t, {}])) }),
  'dist/kai.es.js': 'export const elementsReady = import("./register-impl-abc123.js");\n',
  'dist/register-impl-abc123.js': CHUNK,
  ...over,
});

describe('the elements-bundle guard detects, and build runs it', () => {
  it('ships the guard', () => {
    expect(existsSync(resolve(pkgRoot, SCRIPT)), `${SCRIPT} is missing`).toBe(true);
  });

  it(`\`${NPM_SCRIPT}\` runs the self-test half as well as the check`, () => {
    const cmd = pkg.scripts[NPM_SCRIPT];
    expect(cmd, `no \`${NPM_SCRIPT}\` script in packages/ui/package.json`).toBeTruthy();
    expect(
      cmd,
      `\`${NPM_SCRIPT}\` no longer runs \`--self-test\`. That half is what proves the check ` +
        `still DETECTS; without it a check that looks at nothing exits 0 and reads as a clean build.`,
    ).toContain('--self-test');
    expect(cmd, `\`${NPM_SCRIPT}\` no longer runs the check itself`).toContain(SCRIPT);
  });

  it('`build` invokes it, so `prepublishOnly` does too', () => {
    expect(
      pkg.scripts.build,
      `the \`build\` chain no longer runs \`${NPM_SCRIPT}\`. Nothing else checks that the ` +
        `register-all bundle still registers anything in a consumer's bundler.`,
    ).toContain(`npm run ${NPM_SCRIPT}`);
    expect(pkg.scripts.prepublishOnly, 'prepublishOnly no longer runs build').toContain('build');
  });

  it('passes on a healthy synthetic tree, so the failures below mean something', () => {
    const { code, output } = runGuard(['--package-root', fixtureRoot(tree())]);
    expect(code, `the guard failed a tree with nothing wrong with it: ${output}`).toBe(0);
  });

  it('fires on a stripped register-impl reference', () => {
    // The chunk is still imported and still sideEffects-covered, under a different
    // name: only the reference this half looks for is gone, so this is that defect
    // ALONE rather than both at once.
    const root = fixtureRoot(
      tree({
        'dist/kai.es.js': 'export const elementsReady = import("./elements-registry-abc123.js");\n',
        'dist/register-impl-abc123.js': null,
        'dist/elements-registry-abc123.js': CHUNK,
        'package.json': JSON.stringify({
          sideEffects: ['**/*.css', './dist/kai.es.js', './dist/elements-registry-*.js'],
        }),
      }),
    );
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, `the guard exited ${code} on a bundle referencing no register-impl`).not.toBe(0);
    expect(output).toContain('does NOT reference');
  });

  it('fires on a registration chunk no sideEffects glob covers (the 0.19.0 ship)', () => {
    const root = fixtureRoot(tree({ 'package.json': JSON.stringify({ sideEffects: ['**/*.css', './dist/kai.es.js'] }) }));
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, `the guard exited ${code} on an uncovered registration chunk`).not.toBe(0);
    expect(output).toContain('NOT covered by package.json');
    expect(output).toContain('dist/register-impl-abc123.js');
    // Fired for the RIGHT reason: the reference itself is intact in this tree.
    expect(output).not.toContain('does NOT reference');
  });

  it('treats a run that classified no registration chunk as a failure, not a pass', () => {
    // Every dynamically imported chunk is under the tag floor, so the sideEffects
    // half had nothing to check. Exiting 0 here is this repo's most expensive
    // recurring defect.
    const root = fixtureRoot(tree({ 'dist/register-impl-abc123.js': 'export const nothing = 1;\n' }));
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, 'a run that classified nothing exited 0, which reads as "nothing was wrong"').not.toBe(0);
    expect(output).toContain('loads no chunk carrying element registrations');
  });
});
