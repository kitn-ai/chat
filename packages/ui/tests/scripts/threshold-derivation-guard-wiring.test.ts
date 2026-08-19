/**
 * GUARD — `lint:thresholds` still DETECTS, and CI still runs it.
 *
 * The guard itself requires a numeric threshold in a NEW plan or spec to name
 * where its number comes from. It exists because a `< 6000` byte budget was
 * invented while a plan was being drafted, read like a measurement because it
 * had a digit in it, survived into an implementer's brief, and was stopped only
 * because that implementer declined to weaken an assertion to meet it.
 *
 * This file matters more here than for its siblings, and for a reason peculiar
 * to this guard: ITS SCOPE IS EMPTY ON THE DAY IT LANDS. Scope is derived from
 * the `YYYY-MM-DD-` filename prefix against a cutoff, so until the next plan is
 * written the real run reads every document and checks none of them. "0
 * findings" and "0 files" are the same green from outside. Nothing about the
 * real tree can tell you the analyzer still works, so everything below is run
 * against synthesized repo roots that DO have documents in scope.
 *
 * Watched failing, per assertion: pointing NPM_SCRIPT at a name that does not
 * exist turns the second and third red naming it; removing the comparison
 * detector turns the bare-threshold test red; flipping the cutoff comparison to
 * strictly-greater turns the cutoff test red; and stubbing the undated/missing
 * reporting turns those two red. Each was watched before this file was trusted.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(pkgRoot, '../..');
const WORKFLOW = resolve(repoRoot, '.github/workflows/test.yml');
const SCRIPT = 'scripts/lint-threshold-derivation.mjs';
const NPM_SCRIPT = 'lint:thresholds';

// A date safely inside the guard's scope, and one safely outside it. Both are
// literals on purpose: the cutoff is a boundary this test is asserting, so
// deriving these from the script would make the assertion circular.
const IN_SCOPE = '2026-08-20';
const OUT_OF_SCOPE = '2026-08-18';

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

/**
 * The body of one top-level job in a GitHub workflow. Same crude extraction as
 * tests/scripts/cdn-pins-guard-wiring.test.ts, for the same reason -- the repo
 * carries no YAML parser and the question is answerable from the job's lines.
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

/**
 * A throwaway repo root the linter can be pointed at with `--repo-root`. Both
 * scan directories are created by default, because a missing one is a HARD
 * FAILURE and would otherwise mask every other assertion.
 */
function fixtureRoot(docs: Record<string, string>, opts: { specs?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'threshold-guard-'));
  mkdirSync(join(root, 'docs/superpowers/plans'), { recursive: true });
  if (opts.specs !== false) mkdirSync(join(root, 'docs/superpowers/specs'), { recursive: true });
  for (const [name, body] of Object.entries(docs)) {
    const full = join(root, 'docs/superpowers', name);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

/** Runs the linter and returns its exit code plus combined output. */
function runLinter(args: string[]): { code: number; output: string } {
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

/**
 * Marker the import probe prints AFTER the module has loaded. Its absence means
 * the module `process.exit()`ed out of its own importer.
 */
const IMPORT_MARKER = 'IMPORT-INERT-MARKER';

/**
 * Imports the guard from a CHILD PROCESS and reports what happened.
 *
 * `probe` is an expression evaluated against the imported namespace, so the same
 * run proves two things at once: that importing ran nothing, and that the
 * exports still answer. `scriptPath` is a parameter rather than a constant
 * because that is how this case was watched failing -- pointing it at a copy of
 * the guard with its IS_MAIN check stripped must turn these red.
 */
function runImporter(
  probe: string,
  args: string[] = [],
  scriptPath = resolve(pkgRoot, SCRIPT),
): { code: number; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'threshold-import-'));
  const importer = join(dir, 'importer.mjs');
  writeFileSync(
    importer,
    `const m = await import(${JSON.stringify(pathToFileURL(scriptPath).href)});\n` +
      `console.log(${JSON.stringify(IMPORT_MARKER)}, ${probe});\n`,
  );
  try {
    const stdout = execFileSync('node', [importer, ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** The exact shape of the defect: a byte budget nothing produced. */
const BARE = 'The generated file must stay under 6000 bytes, so the check is cheap.\n';

describe('the threshold derivation guard detects, and CI runs it', () => {
  it('ships the linter', () => {
    expect(existsSync(resolve(pkgRoot, SCRIPT)), `${SCRIPT} is missing`).toBe(true);
  });

  it(`\`${NPM_SCRIPT}\` runs the self-test half as well as the scan`, () => {
    const script = pkg.scripts[NPM_SCRIPT];
    expect(script, `no \`${NPM_SCRIPT}\` script in packages/ui/package.json`).toBeTruthy();
    expect(
      script,
      `\`${NPM_SCRIPT}\` no longer runs \`--self-test\`. For THIS guard that half is not a ` +
        `nicety: its scope is empty until the next dated plan is written, so the scan alone ` +
        `is green whether the analyzer works or not.`,
    ).toContain('--self-test');
    expect(script, `\`${NPM_SCRIPT}\` no longer runs the scan itself`).toContain(SCRIPT);
  });

  it('is invoked by the REQUIRED `test` job in CI', () => {
    const block = jobBlock(readFileSync(WORKFLOW, 'utf-8'), 'test');

    // If the extraction ever returns nothing (the job was renamed, the indentation
    // changed), everything below would pass vacuously. Fail here instead.
    expect(block, `no \`test:\` job found in ${WORKFLOW}`).not.toBe('');
    expect(
      block,
      'the `test` job no longer runs the unit project either — read this guard',
    ).toContain('--project=unit');
    expect(
      block,
      `the \`test\` job does not run \`${NPM_SCRIPT}\`. It is the only thing standing between ` +
        `a number somebody invented while drafting and a downstream reader treating it as a ` +
        `measurement.`,
    ).toContain(NPM_SCRIPT);
  });

  it('says how many files it checked, so an empty scope cannot read as a clean one', () => {
    // The real tree, where the scope is empty by construction today. The pass is
    // only honest because the run PRINTS the count and the cutoff -- otherwise
    // "0 findings" is indistinguishable from "the plans were checked".
    const { code, output } = runLinter(['--repo-root', repoRoot]);
    expect(code, `the real tree failed:\n${output}`).toBe(0);
    expect(output, 'the run no longer reports its scope; a silent pass here proves nothing').toMatch(
      /\d+ files in scope \(cutoff \d{4}-\d{2}-\d{2}\)/,
    );
  });

  it('fires on a threshold with nothing behind it', () => {
    const root = fixtureRoot({ [`plans/${IN_SCOPE}-planted.md`]: BARE });
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, 'an invented byte budget exited 0').not.toBe(0);
    expect(output).toContain('6000');
    expect(output).toContain(`${IN_SCOPE}-planted.md`);
  });

  it('accepts a backticked producing command on the same line', () => {
    const root = fixtureRoot({
      [`plans/${IN_SCOPE}-planted.md`]:
        'The generated file must stay under the size `verify:fresh` prints on every run.\n',
    });
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, `a threshold naming its producer was reported:\n${output}`).toBe(0);
  });

  it('accepts a number honestly labelled a ratchet', () => {
    // A number meaning "no worse than today" was never derived from anything, and
    // saying so is the correct answer rather than inventing a justification.
    const root = fixtureRoot({
      [`plans/${IN_SCOPE}-planted.md`]: 'Hold the count at >= 36 — a ratchet, not a target.\n',
    });
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, `a labelled ratchet was reported:\n${output}`).toBe(0);
  });

  it('accepts the parsed waiver, and refuses a reason too short to be one', () => {
    const waived = fixtureRoot({
      [`specs/${IN_SCOPE}-planted.md`]:
        'Budget 3 review rounds. lint-thresholds: waive -- a scheduling choice, not a measurement\n',
    });
    expect(runLinter(['--repo-root', waived]).code, 'a waived line was reported').toBe(0);

    const thin = fixtureRoot({
      [`specs/${IN_SCOPE}-planted.md`]: 'Budget 3 review rounds. lint-thresholds: waive -- small\n',
    });
    expect(
      runLinter(['--repo-root', thin]).code,
      'a waiver with no real reason was accepted, which makes the directive a mute button',
    ).not.toBe(0);
  });

  it('does not accept prose as a derivation, only one of the three markings', () => {
    // The defect this guard was built from was ALREADY surrounded by prose
    // justifying the number. A rule honouring explanation would have passed it.
    const root = fixtureRoot({
      [`plans/${IN_SCOPE}-planted.md`]:
        'Keeping it under 6000 bytes matters because the file is read on every run and ' +
        'a bigger one would slow the loop down measurably.\n',
    });
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, 'prose explaining the number was accepted as a derivation').not.toBe(0);
    expect(output).toContain('6000');
  });

  it('leaves documents older than the cutoff alone', () => {
    // The historical plans are a record. Rewriting them to satisfy a linter is
    // the failure mode `lint-cdn-pins` documents at length.
    const root = fixtureRoot({ [`plans/${OUT_OF_SCOPE}-historical.md`]: BARE });
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, `a pre-cutoff document was dragged into scope:\n${output}`).toBe(0);
    expect(output).toContain('0 files in scope');
  });

  it('reports a file it cannot date instead of silently skipping it', () => {
    // Scope derived from filenames means a file it cannot place is a HOLE in a
    // derived list, and a silent skip is this repo's most expensive defect.
    const root = fixtureRoot({ 'plans/README.md': BARE });
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, 'an undated file in the scan directory was silently skipped').not.toBe(0);
    expect(output).toContain('README.md');
    expect(output).toContain('YYYY-MM-DD');
  });

  it('hard-fails when a scan directory is gone, rather than scanning nothing', () => {
    // A missing directory silences this guard completely. Exiting 0 there would
    // mean the tree moving underneath it reads as every plan being clean.
    const root = fixtureRoot({ [`plans/${IN_SCOPE}-planted.md`]: BARE }, { specs: false });
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, 'a missing scan directory was treated as an empty one').not.toBe(0);
    expect(output).toContain('docs/superpowers/specs');
  });

  it('importing this module runs NOTHING, and its exports still answer', () => {
    // THIS FILE'S OWN RECORDED MISS. The guard shipped with no IS_MAIN check, so
    // `await import(...)` ran the whole lint and then `process.exit()`ed out of
    // the CALLER -- and none of the twelve cases above could see it, because
    // every one of them drives the script as a child process. A verifier found
    // it by hand. This is the case that would have caught it.
    const { code, output } = runImporter("m.analyze('must stay under 6000 bytes').length");
    expect(code, `importing the guard exited ${code} instead of returning`).toBe(0);
    expect(output, 'the importer never got past `await import(...)`').toContain(IMPORT_MARKER);
    expect(output, 'the exported analyzer no longer answers after import').toContain(
      `${IMPORT_MARKER} 1`,
    );
    expect(output, 'importing the module ran the real lint').not.toContain('files in scope');
  });

  it('importing it is inert even when the IMPORTER\'s argv carries --self-test', () => {
    // The worse half of the same defect, and the reason argv is checked rather
    // than trusted: the guard reads `--self-test` off `process.argv`, which
    // belongs to whoever is running. An importer carrying that flag ran the
    // guard's 22-case self-test and exited 0 from inside the caller — which
    // reads, from outside, exactly like the caller passing.
    const { code, output } = runImporter("m.analyze('must stay under 6000 bytes').length", [
      '--self-test',
    ]);
    expect(code, `importing under a stray --self-test exited ${code}`).toBe(0);
    expect(output, 'the importer never got past `await import(...)`').toContain(IMPORT_MARKER);
    expect(output, 'a stray --self-test in the importer ran the guard\'s self-test').not.toContain(
      'cases behave as specified',
    );
  });

  it('ignores numbers inside fenced blocks, which are commands and not claims', () => {
    // Stated cost, asserted so it stays a decision rather than drifting: ports,
    // versions and shard counts live in fences, and firing on those is the noise
    // that gets a guard disabled.
    const root = fixtureRoot({
      [`plans/${IN_SCOPE}-planted.md`]:
        '# planted\n\n```bash\nnx build ui --parallel=3 && node --max-old-space-size=4096 x.mjs\n```\n',
    });
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, `a command's numbers were read as a budget claim:\n${output}`).toBe(0);
  });
});
