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
function plantConfig(
  source: string,
  mutate: (src: string) => string,
  opts: { visibleToScan?: boolean } = {},
): string {
  // `visibleToScan` drops the dot so the guard's own scan DOES see the copy.
  // Only the scan probe wants that; everything else must stay invisible.
  const name = opts.visibleToScan
    ? `zz-wiring-probe-${process.pid}-${source}`
    : `.wiring-${process.pid}-${source}`;
  const path = join(CONFIG_DIR, name);
  const src = readFileSync(join(CONFIG_DIR, source), 'utf-8');
  const out = mutate(src);
  writeFileSync(path, out);
  planted.push(path);
  return `config/playwright/${name}`;
}

afterEach(() => {
  while (planted.length > 0) rmSync(planted.pop() as string, { force: true });
  // Belt and braces: a copy left behind by a killed run would be picked up by
  // the real guard and by tsconfig.tests.json's `config/**` include.
  for (const n of readdirSync(CONFIG_DIR)) {
    if (n.startsWith('zz-wiring-probe-') || n.startsWith('.wiring-')) {
      rmSync(join(CONFIG_DIR, n), { force: true });
    }
  }
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

  // THE EXPENSIVE ONE, and the reason this file has a per-file entry in
  // `test-timeout-budgets.ts`. `--self-test` spawns three real
  // `playwright test --list` runs against planted config copies, and each of
  // those type-strips and loads every spec the config matches. Measured at
  // 4555ms on a 2-core GitHub runner, which is 91% of the strict 5000ms
  // default. It cannot be made cheaper without making it prove less: spawning
  // real playwright against a real planted fault IS the thing being checked.
  it('its own --self-test passes (planted faults all fire, control passes)', () => {
    const { code, output } = runCheck(['--self-test']);
    expect(code, `the self-test did not pass:\n${output}`).toBe(0);
    expect(output).toContain('planted faults detected');
    expect(output).toContain('control');
  });

  it('PRINTS a per-project count for the config it was pointed at', () => {
    // ONE config, not all three. Verifying that all fourteen projects are
    // currently healthy is the REQUIRED `dist-guards` step's job -- it runs the
    // same script with no arguments on every CI run, and it is where a broken
    // testMatch must go red. Re-running it here bought a duplicate verdict and
    // cost three playwright listings: 5503ms on a 2-core runner, over the
    // strict 5000ms default. What this test owes is narrower and is fully
    // covered by one config: the guard exits 0 on a healthy config and PRINTS
    // the counts rather than just saying "ok".
    //
    // cross-origin is the cheapest (one project, one spec file).
    const { code, output } = runCheck(['--config', 'config/playwright/cross-origin.config.ts']);
    expect(code, `a project matches no spec files:\n${output}`).toBe(0);
    expect(output).toContain('config/playwright/cross-origin.config.ts');
    // The count itself, not a pinned number: pinning one would rot the day
    // somebody adds a cross-origin test, and "prints a count" is the claim.
    expect(output, `no per-project count line in:\n${output}`).toMatch(
      /chromium\s+\d+ test\(s\)/,
    );
  });

  it('the config directory is SCANNED, not hardcoded: a new config on disk is picked up', () => {
    // `--list-configs` runs the real `scanConfigs` and stops, so this costs
    // milliseconds instead of three playwright listings (the previous shape ran
    // the full check and measured 4369ms on a 2-core runner, 87% of budget).
    // It is also STRONGER than what it replaces: comparing the scan against the
    // current directory would agree with a hardcoded list that happened to be
    // correct today, so a fourth config is planted and must show up.
    const onDisk = readdirSync(CONFIG_DIR)
      .filter((n) => n.endsWith('.config.ts') && !n.startsWith('.'))
      .sort();
    expect(onDisk.length, `no playwright configs found in ${CONFIG_DIR}`).toBeGreaterThan(0);

    const before = runCheck(['--list-configs']);
    expect(before.code, `--list-configs failed:\n${before.output}`).toBe(0);
    for (const name of onDisk) {
      expect(before.output, `${name} is on disk but the scan did not report it`).toContain(
        `config/playwright/${name}`,
      );
    }

    const extra = plantConfig('cross-origin.config.ts', (src) => src, { visibleToScan: true });
    const after = runCheck(['--list-configs']);
    expect(after.code, `--list-configs failed with a fourth config present:\n${after.output}`).toBe(0);
    expect(
      after.output,
      'a config added to the directory was not reported, so the list is not coming off disk',
    ).toContain(extra);
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

    const { code, output } = runCheck(['--config', rel]);
    expect(code, `the guard did not fire on an empty project:\n${output}`).not.toBe(0);
    expect(output).toContain('content-brand-bleed');
    expect(output).toContain('ZERO spec files');

    // The control that makes this discriminating: playwright ITSELF was happy
    // with the planted config, so the guard is reporting something playwright
    // would not have. Read off the guard's own message rather than from a
    // second `playwright --list` spawn, which cost another second and a half to
    // learn the same fact: the guard appends a `THE LISTING ITSELF EXITED n`
    // section if and only if the listing exited non-zero.
    expect(
      output,
      'playwright rejected the planted config, so this fixture proves nothing about the exit-0 case',
    ).not.toContain('THE LISTING ITSELF EXITED');
  });

  it('PASSES over an unmodified copy of the same config (so the fixture is the fault, not the copy)', () => {
    const rel = plantConfig('bare.config.ts', (src) => src);
    const { code, output } = runCheck(['--config', rel]);
    expect(code, `an untouched copy was reported as broken:\n${output}`).toBe(0);
  });
});
