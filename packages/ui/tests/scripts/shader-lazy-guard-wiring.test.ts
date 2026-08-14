/**
 * GUARD — `verify-shader-lazy` still DETECTS, and `build` still runs it.
 *
 * The guard itself keeps the WebGL/GLSL shader path out of the register-all bundle.
 * That bundle disables tree-shaking by design, so a static import of a shader variant
 * ships ~25-30KB of GLSL to every consumer, including one who only uses <kai-chat>.
 * It runs in `build`, and `prepublishOnly` runs `build`, so it gates every publish.
 *
 * This file exists because this guard's miss-mode is SILENCE, which its own header
 * says out loud: `findRegisterImpl()` swallows a readdir failure and returns null, and
 * the scan then runs over kai.es.js alone — a file measured to stay byte-identical
 * when a leak is planted. "Found nothing to check" and "found no leak" print the same.
 * There is a second silent shape too: the markers are string literals copied from the
 * shader source, so renaming a GLSL function leaves this searching for a string that
 * can never appear. Both are asserted fatal here.
 *
 * The assertions do not trust the script's self-report. They RUN it against
 * synthesized dist trees and require a non-zero exit from each of the three.
 *
 * Watched failing, per assertion: dropping `--self-test` from `verify:shader-lazy`
 * turns the wiring case red, replacing the `npm run` step in `build` turns the build
 * case red, neutering the analyzer (`const leaked = []`) turns the leak case red, and
 * restoring the historical quiet return on a null chunk turns the null case red.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = 'scripts/verify-shader-lazy.mjs';
const NPM_SCRIPT = 'verify:shader-lazy';

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

/** A throwaway package root the guard can be pointed at with `--package-root`. */
function fixtureRoot(files: Record<string, string | null>): string {
  const root = mkdtempSync(join(tmpdir(), 'shader-lazy-guard-'));
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

const LAZY =
  'const frag = "vec3 auroraWarp(vec2 p){return vec3(0.0);} float randFibo(float x){return x;} ' +
  'void main(){ mainImage(gl_FragColor, gl_FragCoord.xy); }";\n';
const tree = (over: Record<string, string | null> = {}) => ({
  'dist/kai.es.js': 'export const elementsReady = import("./register-impl-abc123.js");\n',
  'dist/register-impl-abc123.js': 'customElements.define("kai-chat", C);\n',
  'dist/variant-aurora-x1.js': LAZY,
  ...over,
});

describe('the shader-lazy guard detects, and build runs it', () => {
  it('ships the guard', () => {
    expect(existsSync(resolve(pkgRoot, SCRIPT)), `${SCRIPT} is missing`).toBe(true);
  });

  it(`\`${NPM_SCRIPT}\` runs the self-test half as well as the check`, () => {
    const cmd = pkg.scripts[NPM_SCRIPT];
    expect(cmd, `no \`${NPM_SCRIPT}\` script in packages/ui/package.json`).toBeTruthy();
    expect(
      cmd,
      `\`${NPM_SCRIPT}\` no longer runs \`--self-test\`. That half is what proves the string ` +
        `search still finds anything; without it a search over the wrong file, or for a stale ` +
        `marker, exits 0 and reads as "no leak".`,
    ).toContain('--self-test');
    expect(cmd, `\`${NPM_SCRIPT}\` no longer runs the check itself`).toContain(SCRIPT);
  });

  it('`build` invokes it, so `prepublishOnly` does too', () => {
    expect(
      pkg.scripts.build,
      `the \`build\` chain no longer runs \`${NPM_SCRIPT}\`. Nothing else keeps the GLSL out of ` +
        `the bundle every consumer of @kitn.ai/ui/elements loads.`,
    ).toContain(`npm run ${NPM_SCRIPT}`);
    expect(pkg.scripts.prepublishOnly, 'prepublishOnly no longer runs build').toContain('build');
  });

  it('passes when the shader path is only in the lazy chunk', () => {
    const { code, output } = runGuard(['--package-root', fixtureRoot(tree())]);
    expect(code, `the guard failed a tree with no leak: ${output}`).toBe(0);
  });

  it('fires on a GLSL marker in the hashed register-impl chunk', () => {
    // Where a static import actually lands it. kai.es.js stays byte-identical, so
    // this chunk is the only file that can show the leak at all.
    const root = fixtureRoot(
      tree({
        'dist/register-impl-abc123.js':
          'customElements.define("kai-chat", C);\nconst frag = "vec3 auroraWarp(vec2 p){return vec3(0.0);}";\n',
      }),
    );
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, `the guard exited ${code} on a leaked GLSL marker`).not.toBe(0);
    expect(output).toContain('leaked into the register-all bundle');
    expect(output).toContain('auroraWarp');
  });

  it('treats "no register-impl chunk found" as a failure, not "nothing to check"', () => {
    const root = fixtureRoot(tree({ 'dist/register-impl-abc123.js': null }));
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, 'a run with no chunk to scan exited 0, which reads as "no leak"').not.toBe(0);
    expect(output).toContain('no dist/register-impl-*.js chunk found');
    expect(output).not.toContain('leaked into the register-all bundle');
  });

  it('treats markers that match nothing anywhere as a failure (stale search terms)', () => {
    // Rename a GLSL function and the marker list goes on searching for a string that
    // can no longer appear: permanently green, permanently blind.
    const root = fixtureRoot(
      tree({ 'dist/variant-aurora-x1.js': 'const frag = "vec3 ribbonWarp(vec2 p){return vec3(0.0);}";\n' }),
    );
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, 'a run whose search terms match nothing exited 0, which reads as "no leak"').not.toBe(0);
    expect(output).toContain('marker(s) not found ANYWHERE');
  });
});
