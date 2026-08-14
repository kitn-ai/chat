/**
 * GUARD — `verify-quarantine` still DETECTS, and the typecheck chain still runs it.
 *
 * The guard itself proves every file excluded from the fifth typecheck pass is still
 * excluded for the reason written next to it. `exclude` is a list of files the pass
 * does not read, so the pass is green whether they are broken or perfect: only this
 * can tell you when an entry's reason has expired.
 *
 * WHY IT NEEDS A TEST MORE THAN MOST. The quarantine list is EMPTY today. On an empty
 * list the entire re-inclusion half — the part that catches an expired IOU, which is
 * the reason the script exists — never executes at all. Running it proves only that
 * the empty-list branch works. So every interesting case below is one the repo does
 * not currently have, driven through a synthesized package with a real
 * tsconfig.tests.json and real TypeScript files.
 *
 * Watched failing: inverting the expired-IOU check (`if (got.length !== 0)`) turns the
 * expired case red; dropping `--self-test` from `verify:quarantine`, or the step from
 * the `typecheck` chain, turns the wiring cases red.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = 'scripts/verify-quarantine.mjs';
const NPM_SCRIPT = 'verify:quarantine';

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

const BROKEN = 'export const n: number = "not a number";\n';
const CLEAN = 'export const ok: number = 1;\n';

/** A throwaway package the guard can be pointed at with `--package-root`. */
function fixtureRoot(tsconfig: unknown, files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'quarantine-guard-'));
  for (const [rel, content] of Object.entries({ 'clean.ts': CLEAN, ...files })) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  writeFileSync(join(root, 'tsconfig.tests.json'), JSON.stringify(tsconfig, null, 2));
  return root;
}

const tsconfig = (over: Record<string, unknown> = {}) => ({
  compilerOptions: {
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: 'ESNext',
    module: 'ESNext',
    moduleResolution: 'Bundler',
  },
  include: ['*.ts'],
  exclude: [],
  ...over,
});

const entry = (over: Record<string, unknown> = {}) => ({
  since: '2026-01-01',
  reason: 'a real reason, written down',
  expect: { count: 1, codes: ['TS2322'] },
  ...over,
});

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

describe('the quarantine guard detects, and typecheck runs it', () => {
  it('ships the guard', () => {
    expect(existsSync(resolve(pkgRoot, SCRIPT)), `${SCRIPT} is missing`).toBe(true);
  });

  it(`\`${NPM_SCRIPT}\` runs the self-test half as well as the check`, () => {
    const cmd = pkg.scripts[NPM_SCRIPT];
    expect(cmd, `no \`${NPM_SCRIPT}\` script in packages/ui/package.json`).toBeTruthy();
    expect(
      cmd,
      `\`${NPM_SCRIPT}\` no longer runs \`--self-test\`. With an empty quarantine list — the state ` +
        `the repo is in — the re-inclusion half never executes, so without the self-test nothing ` +
        `exercises the part of this script that catches an expired reason.`,
    ).toContain('--self-test');
    expect(cmd, `\`${NPM_SCRIPT}\` no longer runs the check itself`).toContain(SCRIPT);
  });

  it('runs FIRST in the typecheck chain, ahead of the tsc passes', () => {
    const chain = pkg.scripts.typecheck;
    expect(chain, `\`typecheck\` no longer runs \`${NPM_SCRIPT}\``).toContain(NPM_SCRIPT);
    // The chain is `&&`-joined and the MCP pass is red on any unbuilt tree, so
    // anywhere else in the order this gets skipped on exactly the fresh clones
    // where rot hides. Its own header explains the ordering; this pins it.
    expect(
      chain.indexOf(NPM_SCRIPT),
      'the quarantine check is no longer first in the `typecheck` chain — behind the MCP pass it ' +
        'is skipped on any unbuilt tree, which is where rot hides',
    ).toBeLessThan(chain.indexOf('tsc --noEmit'));
  });

  it('passes on a synthesized package with a clean pass', () => {
    const { code, output } = runGuard(['--package-root', fixtureRoot(tsconfig())]);
    expect(code, `the guard failed a package with nothing wrong with it: ${output}`).toBe(0);
  });

  it('fires on an EXPIRED IOU — a quarantined file that now compiles clean', () => {
    // The case the re-inclusion half exists for, and the one that never runs on the
    // repo as it stands, because the list is empty.
    const root = fixtureRoot(
      tsconfig({ exclude: ['fixed.ts'], quarantine: { entries: { 'fixed.ts': entry() } } }),
      { 'fixed.ts': CLEAN },
    );
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, `the guard exited ${code} on a quarantined file that compiles clean`).not.toBe(0);
    expect(output).toContain('compiles CLEAN');
    expect(output).toContain('Its reason has expired');
  });

  it('fires when the errors no longer match what the entry was quarantined for', () => {
    const root = fixtureRoot(
      tsconfig({
        exclude: ['broken.ts'],
        quarantine: { entries: { 'broken.ts': entry({ expect: { count: 2, codes: ['TS2322'] } }) } },
      }),
      { 'broken.ts': BROKEN },
    );
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, `the guard exited ${code} on an entry whose error signature changed`).not.toBe(0);
    expect(output).toContain('no longer produces the errors it was quarantined for');
  });

  it('stays silent on an entry that still earns its place', () => {
    // Discrimination in the other direction: a live quarantine entry, matching its
    // expectation exactly, must not be reported.
    const root = fixtureRoot(
      tsconfig({ exclude: ['broken.ts'], quarantine: { entries: { 'broken.ts': entry() } } }),
      { 'broken.ts': BROKEN },
    );
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, `the guard failed a healthy quarantine entry: ${output}`).toBe(0);
    expect(output).toContain('still earning its place');
  });

  it('fires on an exclusion with no reason recorded anywhere', () => {
    const { code, output } = runGuard(['--package-root', fixtureRoot(tsconfig({ exclude: ['clean.ts'] }))]);
    expect(code, `the guard exited ${code} on a silent addition to \`exclude\``).not.toBe(0);
    expect(output).toContain('with no reason');
  });

  it('reports a malformed entry instead of crashing on it', () => {
    // Reading `meta.expect.codes` off an entry that has none used to throw a
    // TypeError, which took the run down and printed a stack trace INSTEAD of the
    // four bookkeeping failures it had already collected.
    const root = fixtureRoot(
      tsconfig({ exclude: ['broken.ts'], quarantine: { entries: { 'broken.ts': {} } } }),
      { 'broken.ts': BROKEN },
    );
    const { code, output } = runGuard(['--package-root', root]);
    expect(code, `the guard exited ${code} on a metadata-less entry`).not.toBe(0);
    expect(output, 'the run crashed instead of reporting').not.toContain('TypeError');
    expect(output).toContain('needs a "since" date');
    expect(output).toContain('needs "expect.codes"');
  });
});
