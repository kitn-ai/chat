#!/usr/bin/env node
/**
 * GUARD - every Playwright project still matches at least one spec file.
 *
 * WHY THIS EXISTS
 * The 2026-09-01 consolidation turned 14 root `playwright*.config.ts` files into
 * three configs under `config/playwright/`, one PROJECT per old config. A
 * project is a `testMatch` regex plus a name, and both are one line long. Rename
 * a spec, tighten a regex, or fix a typo in the wrong direction and that project
 * matches nothing.
 *
 * WHAT PLAYWRIGHT ALREADY TELLS YOU, AND WHAT IT DOES NOT. Measured on a config
 * with a deliberately unmatchable `testMatch` on one of four projects, rather
 * than assumed:
 *
 *   - `--project=<the broken one>`  -> `Error: No tests found`, **exit 1**. LOUD.
 *     So the eight playwright gates that name a project are already covered for
 *     this one fault, and this guard is not what catches them.
 *   - the same config with NO `--project` -> `Total: 15 tests in 3 files`,
 *     **exit 0**. The fourth project is simply absent, and nothing says so.
 *
 * The second shape is the hole, and it is wider than it looks, because being
 * named by a `--project` gate is what makes the first shape loud, and most of
 * these projects are not named by one. `shot`, `promptinput`, `composer`,
 * `slots`, `input-mask` and the two audio suites each have an npm script that no
 * CI step invokes - run `node scripts/lint-gate-parity.mjs --list` for the wired
 * set, and this guard's own output for the full project list. For the unwired
 * ones, a `testMatch` that stopped matching is noticed by nothing at all until a
 * human runs the suite and reads the count. That is the repo's most expensive
 * recurring defect shape: a check that keeps passing over a changed fact.
 *
 * So what this adds is that per-project coverage becomes an ASSERTED fact in one
 * cheap place, rather than an incidental consequence of the wired steps each
 * happening to name a project. It also names the project and the reason before a
 * browser is installed or a server booted, in a leg that needs neither.
 *
 * WHAT IT DOES NOT CATCH, stated so nobody reads more into a green run: it
 * asserts >= 1 test per project, not the RIGHT tests. A project that used to
 * match five specs and now matches two passes here.
 *
 * WHAT IT CHECKS
 *   1. Every `*.config.ts` under `config/playwright/` is readable by Playwright,
 *      declares at least one project, and every one of those projects lists at
 *      least one test.
 *   2. Every `test:*` npm script that names one of those configs names a
 *      `--project=` that the config actually declares. (Playwright does fail on
 *      an unknown project, but only when the script is RUN; this catches the
 *      typo without booting a browser.)
 *
 * The config list is SCANNED, never typed, so a fourth config is covered the day
 * it lands. The scan carries a floor (see MIN_CONFIGS) so a scan that stopped
 * finding files fails instead of passing over an empty list.
 *
 * COST: `playwright test --list` only. No browser, no `webServer`, no
 * `globalSetup` - Playwright runs none of those for `--list`, measured (the
 * reported `webServer` and `globalSetup` are null in the listing's own config
 * echo). Under a second per config, so this belongs in a build-free CI leg.
 *
 * SELF-TEST (`--self-test`): plants faults in a temp copy of a REAL config and
 * requires the check to fire on each. The important one is the unmatchable
 * `testMatch` on ONE project of a multi-project config, because that is the case
 * Playwright itself exits 0 on. A control run over the unmodified copy must pass,
 * so a check that had degraded into always-failing cannot self-test green either.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_DIR = resolve(PKG, 'config/playwright');
const CONFIG_REL = 'config/playwright';

/**
 * The vacuity floor. NOT a count of anything and not a target: it is the
 * tripwire that fires when the scan stops finding files (directory renamed,
 * suffix changed, a glob that silently matches nothing). The design draws
 * exactly three config boundaries and draws them on PORT CONFLICT
 * (`docs/superpowers/specs/2026-09-01-ui-config-consolidation-design.md`, part
 * 2), so three is the floor. Merging two configs is legitimate only if the ports
 * stop colliding - read that section, then move this number in the same commit.
 */
const MIN_CONFIGS = 3;

class GuardError extends Error {}

/** Playwright's output, indented so it reads as quoted rather than as ours. */
function indent(text) {
  return (text ?? '')
    .trimEnd()
    .split('\n')
    .map((l) => `    | ${l}`)
    .join('\n');
}

/**
 * Every playwright config in a directory, scanned rather than listed.
 *
 * Takes the directory as a parameter so the self-test can point it at an EMPTY
 * one and exercise the floor for real. An earlier version of the self-test built
 * an empty array inline and threw its own GuardError, which detected nothing and
 * made "4/4 planted faults detected" an overclaim.
 */
function scanConfigs(dir = CONFIG_DIR) {
  const rel = dir === CONFIG_DIR ? CONFIG_REL : dir;
  if (!existsSync(dir)) {
    throw new GuardError(
      `${rel}/ does not exist. The playwright configs live there since the ` +
        `2026-09-01 consolidation; if they moved again, move this guard's CONFIG_DIR with them.`,
    );
  }
  const names = readdirSync(dir)
    .filter((n) => n.endsWith('.config.ts') && !n.startsWith('.'))
    .sort();
  if (names.length < MIN_CONFIGS) {
    throw new GuardError(
      `scanned ${rel}/ and found ${names.length} config(s) (${names.join(', ') || 'none'}), ` +
        `under this guard's floor of ${MIN_CONFIGS}. Either a config was deleted without its ` +
        `projects going anywhere, or this scan has stopped seeing files - which would make every ` +
        `assertion below pass over nothing.`,
    );
  }
  return names;
}

/**
 * `playwright test --list --reporter=json` for one config, as
 * `{ declared: string[], counts: Map<string, number> }`.
 *
 * The report goes to a FILE via PLAYWRIGHT_JSON_OUTPUT_NAME rather than being
 * scraped off stdout: a warning printed ahead of the JSON would otherwise turn a
 * real answer into a parse error.
 */
function listProjects(configRel) {
  const dir = mkdtempSync(join(tmpdir(), 'pw-projects-'));
  const out = join(dir, 'list.json');
  let listExit = 0;
  let listOutput = '';
  try {
    try {
      execFileSync(
        'npx',
        ['playwright', 'test', '--config', configRel, '--list', '--reporter=json'],
        {
          cwd: PKG,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 256 * 1024 * 1024,
          env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: out },
        },
      );
    } catch (err) {
      // A config whose projects ALL match nothing exits non-zero ("no tests
      // found"), which is the loud half of this hazard, so keep going if a
      // report was still written. But CARRY THE OUTPUT: the first real CI
      // failure of this guard was a spec throwing EACCES at module load, which
      // aborts collection for the entire config, and discarding this text made
      // the guard report "nine projects match ZERO spec files" while the actual
      // `mkdir` error sat in a variable nobody read. The symptom is not the
      // cause; print both.
      listExit = err?.status ?? -1;
      listOutput = `${err?.stdout ?? ''}${err?.stderr ?? ''}`;
    }
    if (!existsSync(out)) {
      throw new GuardError(
        `\`playwright test --config ${configRel} --list\` produced no report ` +
          `(exit ${listExit}).\n${indent(listOutput)}`,
      );
    }
    const data = JSON.parse(readFileSync(out, 'utf-8'));
    const declared = (data?.config?.projects ?? []).map((p) => p.name);
    const counts = new Map(declared.map((n) => [n, 0]));
    const walk = (suite) => {
      for (const spec of suite.specs ?? []) {
        for (const t of spec.tests ?? []) {
          counts.set(t.projectName, (counts.get(t.projectName) ?? 0) + 1);
        }
      }
      for (const sub of suite.suites ?? []) walk(sub);
    };
    for (const suite of data?.suites ?? []) walk(suite);
    return { declared, counts, listExit, listOutput };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Checks one config. Returns its per-project counts; throws GuardError on a
 * project that declares itself and then matches nothing.
 */
function checkConfig(configRel) {
  const { declared, counts, listExit, listOutput } = listProjects(configRel);

  /**
   * Whatever playwright itself said when the listing exited non-zero. This is
   * appended to EVERY failure below rather than to one of them, because the
   * guard cannot tell from the counts alone whether a project matches nothing
   * or the whole collection aborted: both arrive as zeros.
   */
  const listing =
    listExit === 0
      ? ''
      : `\n\n  THE LISTING ITSELF EXITED ${listExit}. That is very likely the real cause and the ` +
        `zeros above are the symptom: one spec that THROWS at module load aborts collection for ` +
        `the whole config, so every project in it reports zero. Playwright's own output:\n` +
        indent(listOutput);

  if (declared.length === 0) {
    throw new GuardError(
      `${configRel} declares NO projects. Every suite in it is unreachable, and Playwright ` +
        `will not say so - a config with no projects has nothing to report as missing.${listing}`,
    );
  }
  const empty = declared.filter((n) => (counts.get(n) ?? 0) === 0);
  if (empty.length > 0) {
    throw new GuardError(
      `${configRel}: project(s) ${empty.map((n) => `"${n}"`).join(', ')} match ZERO spec files.\n` +
        `  A run that names the project with --project fails loudly ("No tests found"); a run of ` +
        `the whole config does NOT - it lists the other projects and exits 0. And most of these ` +
        `projects are invoked by no CI step at all, so for those nothing notices ever.\n` +
        `  Check the project's \`testMatch\` against the filenames in tests/e2e/. This usually ` +
        `means a spec was renamed, or a regex was edited on one side of the pair only.\n` +
        `  Counts in this config: ${declared.map((n) => `${n}=${counts.get(n) ?? 0}`).join(' ')}` +
        listing,
    );
  }
  if (listExit !== 0) {
    // Every project has tests and the command still failed. Nothing above would
    // have fired, and exiting 0 here would swallow a real error.
    throw new GuardError(`${configRel}: every project matched specs, but the listing failed.${listing}`);
  }
  return counts;
}

/**
 * Every `test:*` npm script naming one of these configs must name a project the
 * config declares.
 */
function checkScripts(scripts, projectsByConfig) {
  const problems = [];
  for (const [name, body] of Object.entries(scripts)) {
    const cfg = new RegExp(`--config\\s+(${CONFIG_REL.replace('/', '\\/')}\\/\\S+)`).exec(body);
    if (!cfg) continue;
    const configRel = cfg[1];
    const known = projectsByConfig.get(configRel);
    if (!known) {
      problems.push(`\`${name}\` names ${configRel}, which is not a config in ${CONFIG_REL}/`);
      continue;
    }
    const proj = /--project=(\S+)/.exec(body);
    if (!proj) continue; // running every project of a config is legitimate
    if (!known.includes(proj[1])) {
      problems.push(
        `\`${name}\` runs --project=${proj[1]}, which ${configRel} does not declare ` +
          `(it declares: ${known.join(', ')})`,
      );
    }
  }
  if (problems.length > 0) {
    throw new GuardError(`npm script(s) name a project that does not exist:\n  ${problems.join('\n  ')}`);
  }
}

/**
 * `--list-configs`: print the scanned config paths, one per line, and stop.
 *
 * No playwright is spawned, so this costs milliseconds where a full run costs
 * seconds per config. It exists so the wiring test can assert the SCAN (that the
 * config list comes off disk rather than out of a hardcoded array) without
 * paying for three listings to learn something the listings do not tell it. The
 * floor still applies, so this is also the cheapest way to see the scan is alive.
 */
function runListConfigs() {
  for (const name of scanConfigs()) console.log(`${CONFIG_REL}/${name}`);
}

/**
 * `--config <path>`: check exactly one config and nothing else. The scan, its
 * floor and the npm-script cross-check are all skipped, because none of them is
 * meaningful for a single file. This exists for the wiring test, which plants a
 * fault in a COPY of a real config and needs to point the check at that copy
 * without the copy being visible to the scan.
 */
function runOne(configRel) {
  const counts = checkConfig(configRel);
  console.log(`  ${configRel}`);
  for (const [project, n] of counts) {
    console.log(`    ${project.padEnd(28)} ${String(n).padStart(4)} test(s)`);
  }
  console.log(
    `verify-playwright-projects: ${counts.size} project(s) in ${configRel}; ` +
      `every project matches at least one spec.`,
  );
}

function run() {
  const names = scanConfigs();
  const projectsByConfig = new Map();
  const lines = [];
  let total = 0;
  for (const name of names) {
    const configRel = `${CONFIG_REL}/${name}`;
    const counts = checkConfig(configRel);
    projectsByConfig.set(configRel, [...counts.keys()]);
    lines.push(`  ${configRel}`);
    for (const [project, n] of counts) {
      lines.push(`    ${project.padEnd(28)} ${String(n).padStart(4)} test(s)`);
      total += n;
    }
  }
  const pkg = JSON.parse(readFileSync(resolve(PKG, 'package.json'), 'utf-8'));
  checkScripts(pkg.scripts ?? {}, projectsByConfig);
  console.log(lines.join('\n'));
  console.log(
    `verify-playwright-projects: ${names.length} config(s), ` +
      `${[...projectsByConfig.values()].reduce((a, v) => a + v.length, 0)} project(s), ` +
      `${total} test(s); every project matches at least one spec.`,
  );
}

// ---------------------------------------------------------------------------
// Self-test: plant each fault in a temp copy of a real config and watch it fire.
// ---------------------------------------------------------------------------

/**
 * The copy lives INSIDE config/playwright/ and not in os.tmpdir(), because these
 * configs resolve `testDir` and `globalSetup` relative to their own directory.
 * A copy anywhere else would fail for the wrong reason and the self-test would
 * "pass" without ever exercising the check. The name is dot-prefixed so the scan
 * above skips it (and so `tsconfig.tests.json`'s `config/**` include does too,
 * since TypeScript ignores dot-prefixed files), and it is removed in a finally.
 */
function withPlantedCopy(sourceName, mutate, fn) {
  const copyName = `.selftest-${process.pid}-${sourceName}`;
  const copyPath = join(CONFIG_DIR, copyName);
  writeFileSync(copyPath, mutate(readFileSync(join(CONFIG_DIR, sourceName), 'utf-8')));
  try {
    return fn(`${CONFIG_REL}/${copyName}`);
  } finally {
    rmSync(copyPath, { force: true });
  }
}

function expectFires(label, fn) {
  let fired = false;
  let message = '';
  try {
    fn();
  } catch (err) {
    fired = err instanceof GuardError;
    message = err.message;
    if (!fired) throw err;
  }
  if (!fired) {
    console.error(`self-test FAILED: ${label} - the check did NOT fire.`);
    process.exit(1);
  }
  console.log(`  detected: ${label}\n    -> ${message.split('\n')[0]}`);
}

function selfTest() {
  // Stale copies from a killed run would be invisible to the scan (dot-prefixed)
  // but confusing on disk. Clear them first.
  for (const n of readdirSync(CONFIG_DIR)) {
    if (n.startsWith('.selftest-')) rmSync(join(CONFIG_DIR, n), { force: true });
  }

  // THE case this guard exists for: one project of a MULTI-project config
  // matches nothing. Playwright exits 0 here, because the other three projects
  // still match. bare.config.ts is used because it has four projects.
  expectFires('one project of a multi-project config matches no spec files', () =>
    withPlantedCopy(
      'bare.config.ts',
      (src) => {
        const out = src.replace(
          'testMatch: /content-brand-bleed\\.spec\\.ts/',
          'testMatch: /this-spec-does-not-exist\\.spec\\.ts/',
        );
        if (out === src) throw new Error('self-test plant did not apply: bare.config.ts changed shape');
        return out;
      },
      (rel) => checkConfig(rel),
    ),
  );

  // A config that declares no projects at all: nothing to report as missing, so
  // a check that only looked at reported tests would pass over it.
  expectFires('a config that declares no projects', () =>
    withPlantedCopy(
      'cross-origin.config.ts',
      (src) => {
        const out = src.replace(
          "projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],",
          'projects: [],',
        );
        if (out === src)
          throw new Error('self-test plant did not apply: cross-origin.config.ts changed shape');
        return out;
      },
      (rel) => checkConfig(rel),
    ),
  );

  // An npm script pointing at a project the config does not declare.
  expectFires('an npm script naming a project the config does not declare', () =>
    checkScripts(
      { 'test:typo': 'playwright test --config config/playwright/bare.config.ts --project=focusring' },
      new Map([['config/playwright/bare.config.ts', ['focus-ring', 'hovercard']]]),
    ),
  );

  // The scan's own vacuity floor, exercised through the REAL scanConfigs against
  // a real empty directory. An earlier version of this case built an empty array
  // inline and threw its own GuardError, which tested nothing at all and made the
  // "faults detected" line an overclaim.
  const emptyDir = mkdtempSync(join(tmpdir(), 'pw-projects-empty-'));
  try {
    expectFires('a scan that finds fewer configs than the floor', () => scanConfigs(emptyDir));
    expectFires('a scan pointed at a directory that does not exist', () =>
      scanConfigs(join(emptyDir, 'gone')),
    );
  } finally {
    rmSync(emptyDir, { recursive: true, force: true });
  }

  // CONTROL. An unmodified copy must PASS, so a check that had degraded into
  // always-throwing cannot report a green self-test.
  withPlantedCopy('bare.config.ts', (s) => s, (rel) => {
    const counts = checkConfig(rel);
    console.log(
      `  control: an unmodified copy passes (${[...counts].map(([k, v]) => `${k}=${v}`).join(' ')})`,
    );
  });

  console.log('verify-playwright-projects self-test: 5/5 planted faults detected, control passed.');
}

const args = process.argv.slice(2);
const one = args.indexOf('--config');
try {
  if (args.includes('--self-test')) selfTest();
  else if (args.includes('--list-configs')) runListConfigs();
  else if (one !== -1) {
    if (!args[one + 1]) throw new GuardError('--config needs a path');
    runOne(args[one + 1]);
  } else run();
} catch (err) {
  if (err instanceof GuardError) {
    console.error(`verify-playwright-projects: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
