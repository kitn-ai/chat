/**
 * GUARD - `verify:playwright-projects` still DETECTS, and CI still runs it.
 *
 * The guard itself asserts that every project of every config under
 * `config/playwright/` matches at least one spec file. It exists because of the
 * asymmetry measured in its own header: `--project=<broken>` fails loudly, but a
 * run of the whole config lists the other projects and exits 0, and most of the
 * fourteen projects are named by no CI step at all.
 *
 * This file exists because of HOW such a guard gets lost, not because anyone
 * would delete it: the `--self-test` half drops off the npm script, CI drops the
 * step, or the config directory moves and the scan quietly finds nothing. Each
 * makes CI faster and greener while covering less.
 *
 * The detection assertions do not trust the script's self-report. They RUN it
 * against a planted copy of a real config through the same CLI the npm script
 * uses, and require a non-zero exit.
 *
 * Watched failing, per assertion: pointing NPM_SCRIPT at a name that does not
 * exist turns the script assertions red naming it; removing the CI step turns
 * the workflow assertion red; and the planted-config case was run against an
 * UNPLANTED copy first, where it exits 0, so the fixture is discriminating
 * rather than failing for some unrelated reason.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiredGateBlock } from './lib/required-gate-block';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(pkgRoot, '../..');
const WORKFLOW = resolve(repoRoot, '.github/workflows/test.yml');
const SCRIPT = 'scripts/verify-playwright-projects.mjs';
const NPM_SCRIPT = 'verify:playwright-projects';
const CONFIG_DIR = resolve(pkgRoot, 'config/playwright');

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

/** Runs the check the way the npm script does, and reports exit code + output. */
function runCheck(args: string[]): { code: number; output: string } {
  try {
    const stdout = execFileSync('node', [resolve(pkgRoot, SCRIPT), ...args], {
      cwd: pkgRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return { code: 0, output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/**
 * A copy of a real config with `mutate` applied, written INSIDE
 * `config/playwright/` because these configs resolve `testDir` and `globalSetup`
 * against their own directory. A copy in os.tmpdir() would fail for the wrong
 * reason and this test would "detect" nothing. Dot-prefixed so the guard's own
 * scan skips it (and so does `tsconfig.tests.json`'s `config/**` include).
 */
const planted: string[] = [];
function plantConfig(source: string, mutate: (src: string) => string): string {
  const name = `.wiring-${process.pid}-${source}`;
  const path = join(CONFIG_DIR, name);
  const src = readFileSync(join(CONFIG_DIR, source), 'utf-8');
  const out = mutate(src);
  writeFileSync(path, out);
  planted.push(path);
  return `config/playwright/${name}`;
}

afterEach(() => {
  while (planted.length > 0) rmSync(planted.pop() as string, { force: true });
});

describe('the playwright project-coverage guard detects, and CI runs it', () => {
  it('ships the check', () => {
    expect(existsSync(resolve(pkgRoot, SCRIPT)), `${SCRIPT} is missing`).toBe(true);
  });

  it(`\`${NPM_SCRIPT}\` runs the self-test half as well as the real check`, () => {
    const script = pkg.scripts[NPM_SCRIPT];
    expect(script, `no \`${NPM_SCRIPT}\` script in packages/ui/package.json`).toBeTruthy();
    expect(
      script,
      `\`${NPM_SCRIPT}\` no longer runs \`--self-test\`. That half is what proves the check still ` +
        `DETECTS; the real run over a healthy tree is green whether the analyzer works or not.`,
    ).toContain('--self-test');
    expect(script, `\`${NPM_SCRIPT}\` no longer runs the check itself`).toContain(SCRIPT);
  });

  it('is invoked by the REQUIRED `test` job in CI', () => {
    const block = requiredGateBlock(readFileSync(WORKFLOW, 'utf-8'));
    // If the extraction ever returns nothing (job renamed, indentation changed),
    // everything below would pass vacuously. Fail here instead.
    expect(block, `no \`test:\` job found in ${WORKFLOW}`).not.toBe('');
    expect(
      block,
      `the \`test\` job does not run \`${NPM_SCRIPT}\`. It is the only check that a playwright ` +
        `project still matches any spec at all; without it a renamed spec silently empties a suite.`,
    ).toContain(NPM_SCRIPT);
  });

  it('its own --self-test passes (planted faults all fire, control passes)', () => {
    const { code, output } = runCheck(['--self-test']);
    expect(code, `the self-test did not pass:\n${output}`).toBe(0);
    expect(output).toContain('planted faults detected');
    expect(output).toContain('control');
  });

  it('the real tree is currently clean, and the run PRINTS the per-project counts', () => {
    const { code, output } = runCheck([]);
    expect(code, `a project matches no spec files:\n${output}`).toBe(0);
    // The counts are the useful output: "green" here means "every project has at
    // least one test", and a reader needs to see which projects those were.
    expect(output).toContain('config/playwright/storybook.config.ts');
    expect(output).toContain('config/playwright/bare.config.ts');
    expect(output).toContain('config/playwright/cross-origin.config.ts');
    expect(output).toMatch(/\btest\(s\)/);
  });

  it('the config directory is scanned, not hardcoded: every config on disk is reported', () => {
    const onDisk = readdirSync(CONFIG_DIR)
      .filter((n) => n.endsWith('.config.ts') && !n.startsWith('.'))
      .sort();
    // Anti-vacuity: an empty directory would make the loop below assert nothing.
    expect(onDisk.length, `no playwright configs found in ${CONFIG_DIR}`).toBeGreaterThan(0);
    const { output } = runCheck([]);
    for (const name of onDisk) {
      expect(output, `${name} is on disk but the guard did not report it`).toContain(
        `config/playwright/${name}`,
      );
    }
  });

  it('FIRES on a project that matches no spec files (the case playwright exits 0 on)', () => {
    // bare.config.ts has four projects, so the other three still match and
    // playwright's own run exits 0, which is the entire point of the guard.
    const rel = plantConfig('bare.config.ts', (src) => {
      const out = src.replace(
        'testMatch: /content-brand-bleed\\.spec\\.ts/',
        'testMatch: /no-such-spec-exists\\.spec\\.ts/',
      );
      expect(out, 'the plant did not apply: bare.config.ts changed shape').not.toBe(src);
      return out;
    });

    // The control that makes this discriminating: playwright itself is HAPPY.
    let pwCode = 0;
    try {
      execFileSync('npx', ['playwright', 'test', '--config', rel, '--list'], {
        cwd: pkgRoot,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      pwCode = (err as { status?: number }).status ?? -1;
    }
    expect(pwCode, 'playwright rejected the planted config, so this fixture proves nothing').toBe(0);

    const { code, output } = runCheck(['--config', rel]);
    expect(code, `the guard did not fire on an empty project:\n${output}`).not.toBe(0);
    expect(output).toContain('content-brand-bleed');
    expect(output).toContain('ZERO spec files');
  });

  it('PASSES over an unmodified copy of the same config (so the fixture is the fault, not the copy)', () => {
    const rel = plantConfig('bare.config.ts', (src) => src);
    const { code, output } = runCheck(['--config', rel]);
    expect(code, `an untouched copy was reported as broken:\n${output}`).toBe(0);
  });
});
