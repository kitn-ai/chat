/**
 * GUARD — `verify-schemas-exported` still DETECTS, and CI still runs it.
 *
 * The guard itself proves every card JSON Schema is REACHABLE by a consumer, on both
 * surfaces. The bug it was written for is the reason a stat of dist/schemas/ would
 * prove nothing: the files were already there, already shipped in every tarball, and
 * addressable by nobody, because package.json "exports" is a CLOSED map with no
 * `./schemas` key. Our own reference harness hand-derived the confirm schema with a
 * comment saying it had to.
 *
 * That defect looked exactly like a healthy package from every angle except the one
 * nobody was checking — which is precisely why a green run of this script is not
 * evidence that it would notice the defect coming back. Each case below plants one
 * and runs the script as a subprocess, with NO `--self-test` flag, against a
 * synthesized package with a real exports map and a real importable JS entry.
 *
 * Watched failing: making `tsResolves` always return `[]` turns the two reachability
 * cases red; dropping `--self-test` from the npm script, or the step from CI, turns
 * the wiring cases red.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiredGateBlock } from './lib/required-gate-block';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(pkgRoot, '../..');
const WORKFLOW = resolve(repoRoot, '.github/workflows/test.yml');
const SCRIPT = 'scripts/verify-schemas-exported.mjs';
const NPM_SCRIPT = 'verify:schemas';

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

const SCHEMA = { $id: 'confirm', type: 'object', properties: { ok: { type: 'boolean' } } };
const FULL_EXPORTS = {
  './schemas': { types: './dist/schemas/index.d.ts', default: './dist/schemas.js' },
  './schemas/*': './dist/schemas/*',
};

const entrySource = (cards: Record<string, unknown>) =>
  `export const cardSchemas = ${JSON.stringify(cards, null, 2)};\nexport const contractSchemas = {};\n`;

/** A throwaway package the guard can be pointed at with `--package-root`. */
function fixtureRoot(over: Record<string, string | null> = {}): string {
  const files: Record<string, string | null> = {
    'package.json': JSON.stringify({ name: '@kitn.ai/ui', type: 'module', exports: FULL_EXPORTS }, null, 2),
    'src/primitives/card-schemas/confirm.schema.json': JSON.stringify(SCHEMA, null, 2),
    'dist/schemas.js': entrySource({ confirm: SCHEMA }),
    'dist/schemas/index.d.ts': 'export declare const cardSchemas: Record<string, unknown>;\n',
    'dist/schemas/confirm.schema.json': JSON.stringify(SCHEMA, null, 2),
    ...over,
  };
  const root = mkdtempSync(join(tmpdir(), 'schemas-exported-guard-'));
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

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

describe('the schemas-exported guard detects, and CI runs it', () => {
  it('ships the guard', () => {
    expect(existsSync(resolve(pkgRoot, SCRIPT)), `${SCRIPT} is missing`).toBe(true);
  });

  it(`\`${NPM_SCRIPT}\` runs the self-test half as well as the check`, () => {
    const cmd = pkg.scripts[NPM_SCRIPT];
    expect(cmd, `no \`${NPM_SCRIPT}\` script in packages/ui/package.json`).toBeTruthy();
    expect(
      cmd,
      `\`${NPM_SCRIPT}\` no longer runs \`--self-test\`. Resolution succeeding on a healthy package ` +
        `says nothing about whether failure would be noticed, and the bug this guard exists for ` +
        `looked healthy from every angle nobody was checking.`,
    ).toContain('--self-test');
    expect(cmd, `\`${NPM_SCRIPT}\` no longer runs the check itself`).toContain(SCRIPT);
  });

  it('is invoked by the REQUIRED `test` job in CI', () => {
    const block = requiredGateBlock(readFileSync(WORKFLOW, 'utf-8'));
    // Two vacuity guards, and they answer different questions now that the gate
    // is a GRAPH. The empty check catches a renamed root job; the `--project=unit`
    // canary catches a graph that stopped reaching the leg that runs the suite,
    // which is what a dropped `needs:` edge looks like from in here.
    expect(block, `no \`test:\` job found in ${WORKFLOW}`).not.toBe('');
    expect(
      block,
      'the required gate graph no longer runs the unit project either -- read this guard',
    ).toContain('--project=unit');
    expect(
      block,
      `the \`test\` job does not run \`${NPM_SCRIPT}\`. Nothing else checks that the shipped schemas ` +
        `are addressable by anyone.`,
    ).toContain(NPM_SCRIPT);
  });

  it('passes on a synthesized package whose schemas are all reachable', () => {
    const { code, output } = runGuard(['--package-root', fixtureRoot()]);
    expect(code, `the guard failed a package with nothing wrong with it: ${output}`).toBe(0);
    expect(output).toContain('reachable from outside the package');
  });

  it('fires when the exports map has no ./schemas key — the bug that shipped', () => {
    const root = fixtureRoot({
      'package.json': JSON.stringify(
        { name: '@kitn.ai/ui', type: 'module', exports: { './schemas/*': './dist/schemas/*' } },
        null,
        2,
      ),
    });
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, `the guard exited ${code} on an entry no consumer can address`).not.toBe(0);
    expect(output).toContain('is not reachable');
    // BOTH implementations of the exports map must report it, and both are asserted
    // because either one alone keeps the exit code red. Checking only the verdict
    // let a mutation that disabled the whole tsc half pass this test while the
    // script's own self-test caught it — measured, not hypothesised.
    expect(output, 'tsc no longer reports this — the TypeScript half has stopped checking').toContain('TS2307');
    expect(output, "Node's own exports-map implementation no longer reports this").toContain('[node]');
  });

  it('fires when the raw-JSON family is undeclared, however present the files are', () => {
    const root = fixtureRoot({
      'package.json': JSON.stringify(
        { name: '@kitn.ai/ui', type: 'module', exports: { './schemas': FULL_EXPORTS['./schemas'] } },
        null,
        2,
      ),
    });
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, `the guard exited ${code} on unreachable raw JSON`).not.toBe(0);
    expect(output).toContain('ship in the tarball but are not');
    expect(output).toContain('confirm.schema.json');
  });

  it('fires when the JS entry resolves but carries a STALE copy of a schema', () => {
    // Reachable is not the same as correct: the entry must hand back the authored
    // bytes, not a copy a build step forgot to refresh.
    const root = fixtureRoot({
      'dist/schemas.js': entrySource({ confirm: { ...SCHEMA, properties: { ok: { type: 'string' } } } }),
    });
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, `the guard exited ${code} on a stale schema in the JS entry`).not.toBe(0);
    expect(output).toContain('stale copy, not the file');
  });

  it('treats "no schema files to derive a list from" as a failure, not a pass', () => {
    // The expected set is derived by reading the directory. An empty read would
    // make every assertion below it vacuous.
    const root = fixtureRoot({
      'src/primitives/card-schemas/confirm.schema.json': null,
      'src/primitives/card-schemas/.keep': '',
    });
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, 'a run with nothing to assert exited 0').not.toBe(0);
    expect(output).toContain('the guard would assert nothing');
  });
});
