/**
 * GUARD — `verify-generated-sync` still DETECTS DRIFT, and CI still runs it.
 *
 * The guard itself reruns the real generator and fails when a committed derived
 * artifact differs from what came out. fc40a10 is why: a new `::part(citations)`
 * went into src/elements/slots.ts, the artifacts derived from it were not
 * regenerated, and nothing went red — so a part that existed in the shipped element
 * was invisible to the `kai` MCP and the docs site, i.e. to every tool a developer
 * would use to find it.
 *
 * WHAT THIS FILE IS FOR, precisely. The guard has TWO halves and only one of them
 * was ever exercised. The random per-run SENTINEL proves the generator RE-RAN — it
 * is watched failing every time a generator is deleted or no-ops. Nothing proved the
 * COMPARATOR still notices drift. Those can fail independently: the sentinel could
 * keep working perfectly while `a.equals(b)` was deleted, inverted, or handed the
 * wrong buffers, and every run would stay green over exactly the defect this guard
 * exists to catch. So the cases below let the sentinel clear NORMALLY and plant a
 * DRIFTED artifact, leaving the comparator as the only thing that can produce red.
 *
 * NOTHING HERE RUNS THE REAL CONFIGURATION, and that is not squeamishness. The guard
 * rewrites the derived files in the source tree for the duration of a run; the unit
 * suite runs in parallel and reads those same files. Every case points the script at
 * a synthesized repo with a stub generator via `--fixture-config`.
 *
 * Watched failing, per assertion: making the comparator always agree
 * (`if (true || a.equals(b))`) turns the drift cases red while the sentinel cases stay
 * green — which is the whole point of them being separate; dropping `--self-test`
 * from the npm script or the step from CI turns the wiring cases red.
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
const SCRIPT = 'scripts/verify-generated-sync.mjs';
const NPM_SCRIPT = 'verify:generated';

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

const META = 'packages/ui/src/elements/element-meta.json';
const DOC = 'docs/web-components.md';
const META_CONTENT = `${JSON.stringify([{ tag: 'kai-chat', displayName: 'Chat' }], null, 2)}\n`;
const DOC_CONTENT = '# Web components\n\nProse.\n\n<!-- spec:kai-chat -->\nGENERATED BLOCK\n<!-- /spec:kai-chat -->\n';

/**
 * A stub generator that always emits the same bytes. Deliberately written here
 * rather than reused from the script's own self-test fixtures: a wiring test that
 * shared the thing under test's fixtures could agree with it about a shape that is
 * wrong.
 */
const GEN = `
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const repo = resolve(process.argv[2]);
const mode = readFileSync(resolve(repo, 'gen-mode'), 'utf8').trim();
if (mode === 'skip') process.exit(0);
writeFileSync(resolve(repo, ${JSON.stringify(META)}), ${JSON.stringify(META_CONTENT)});
writeFileSync(resolve(repo, ${JSON.stringify(DOC)}), ${JSON.stringify(DOC_CONTENT)});
`;

/** A throwaway git repo plus the JSON config that points the guard at it. */
function fixture(mode: string, tree: Record<string, string> = {}): { config: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), 'generated-sync-wiring-'));
  const files: Record<string, string> = {
    'gen-mode': `${mode}\n`,
    'gen.mjs': GEN,
    'pkg/.keep': '',
    [META]: META_CONTENT,
    [DOC]: DOC_CONTENT,
    ...tree,
  };
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  for (const args of [
    ['init', '-q'],
    ['config', 'user.email', 'guard@example.com'],
    ['config', 'user.name', 'guard'],
    ['add', '-A'],
  ]) {
    execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  }
  const config = join(root, 'guard-config.json');
  writeFileSync(
    config,
    JSON.stringify({
      repoRoot: root,
      pkgRoot: join(root, 'pkg'),
      generated: [
        { file: META, probe: 'overwrite' },
        { file: DOC, probe: 'in-block' },
      ],
      genCommand: { cmd: process.execPath, args: [join(root, 'gen.mjs'), root] },
      metaFile: META,
      fix: 'pnpm --filter @kitn.ai/ui run build:api',
    }),
  );
  return { config, root };
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

describe('the generated-sync guard detects drift, and CI runs it', () => {
  it('ships the guard', () => {
    expect(existsSync(resolve(pkgRoot, SCRIPT)), `${SCRIPT} is missing`).toBe(true);
  });

  it(`\`${NPM_SCRIPT}\` runs the self-test half as well as the check`, () => {
    const cmd = pkg.scripts[NPM_SCRIPT];
    expect(cmd, `no \`${NPM_SCRIPT}\` script in packages/ui/package.json`).toBeTruthy();
    expect(
      cmd,
      `\`${NPM_SCRIPT}\` no longer runs \`--self-test\`. The sentinel proves the generator RE-RAN; ` +
        `only the self-test proves the COMPARATOR still notices drift, and those two halves fail ` +
        `independently.`,
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
      `the \`test\` job does not run \`${NPM_SCRIPT}\`. Nothing else notices that a prop, event or ` +
        `::part added to the source never reached the artifacts the MCP and the docs read.`,
    ).toContain(NPM_SCRIPT);
  });

  it('passes on a synthesized repo that matches its generator', () => {
    const { config } = fixture('normal');
    const { code, output } = runGuard(['--fixture-config', config]);
    expect(code, `the guard failed a repo with nothing wrong with it: ${output}`).toBe(0);
    expect(output).toContain('match their source');
  });

  it('fires on a DRIFTED artifact — the half the sentinel does not cover', () => {
    // The generator runs and rewrites both files, so every sentinel clears. The
    // only thing that can produce red here is the comparison.
    const { config } = fixture('normal', {
      [META]: `${JSON.stringify([{ tag: 'kai-chat', displayName: 'Chat', parts: ['citaitons'] }], null, 2)}\n`,
    });
    const { code, output } = runGuard(['--fixture-config', config]);
    expect(code, `the guard exited ${code} on a stale committed artifact`).not.toBe(0);
    expect(output).toContain('are STALE');
    expect(output, 'the drifted file is not named, so nobody can act on this').toContain(META);
    expect(output, 'no diff location printed — the report cannot be acted on').toContain('first differs at line');
    expect(
      output,
      'reported as a missing rewrite, which would mean the sentinel fired instead of the comparator',
    ).not.toContain('did NOT write');
  });

  it('still fires when the generator no-ops (the sentinel half, kept honest)', () => {
    const { config } = fixture('skip');
    const { code, output } = runGuard(['--fixture-config', config]);
    expect(code, `the guard exited ${code} on a generator that wrote nothing`).not.toBe(0);
    expect(output).toContain('did NOT write');
    expect(output).not.toContain('are STALE');
  });

  it('restores every file it rewrote, even on the failing path', () => {
    // The guard seeds each artifact with a sentinel before running the generator.
    // An early return on the failure path that skipped the restore would leave a
    // developer's tree corrupted by a check that was only supposed to look.
    const { config, root } = fixture('skip');
    const before = readFileSync(join(root, META), 'utf-8');
    const { code } = runGuard(['--fixture-config', config]);
    expect(code).not.toBe(0);
    const after = readFileSync(join(root, META), 'utf-8');
    expect(after, 'the guard left its sentinel behind in the tree').not.toContain('SENTINEL');
    expect(after, 'the guard did not restore the file it rewrote').toBe(before);
  });
});
