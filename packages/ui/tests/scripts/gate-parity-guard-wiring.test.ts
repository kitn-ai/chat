/**
 * GUARD — `lint:gate-parity` still DETECTS, and CI still runs it.
 *
 * The guard itself keeps a documented gate list equal to the required `test`
 * job. It exists because a handoff said "every gate is green" over a
 * five-command list while that job was red on `verify:pack`, which was not one
 * of the five: `derived.json` had grown past that check's per-file ceiling and
 * was shipping to every consumer. A list somebody typed once is not the job.
 *
 * This file exists because of HOW that guard would be lost. Not by someone
 * deleting it: by the `--self-test` half dropping off the npm script, by CI
 * dropping the step, or -- the one specific to this guard -- by the workflow
 * being restructured until the scoped extractor parses almost nothing. A
 * near-empty gate set is a set that EVERY documented list matches, so the guard
 * would go green forever while comparing nothing at all.
 *
 * So the assertions below do not trust the script's own self-report. They RUN it
 * against synthesized repo roots -- an unmarked gate list, the same block
 * labelled `partial`, a `complete` claim missing a gate, a workflow the
 * extractor cannot parse, and a step shape nobody taught it -- and require the
 * right exit code and the right words from each.
 *
 * Watched failing, per assertion: pointing NPM_SCRIPT at a name that does not
 * exist turns the second and third red naming that name; raising the suspect
 * threshold in the analyzer turns the unmarked-block test red; stubbing the
 * missing-gate computation turns the `complete` test red; and disabling the step
 * floor turns the vacuity test red. Each was watched before this file was
 * trusted.
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { requiredGateBlock } from './lib/required-gate-block';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(pkgRoot, '../..');
const WORKFLOW = resolve(repoRoot, '.github/workflows/test.yml');
const SCRIPT = 'scripts/lint-gate-parity.mjs';
const NPM_SCRIPT = 'lint:gate-parity';

const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

/**
 * A throwaway repo root the linter can be pointed at with `--repo-root`.
 *
 * The workflow defaults to the REAL one, on purpose: this guard refuses to run
 * against an implausibly small step list, so a hand-written toy workflow would
 * only ever exercise the vacuity floor. Passing a different one is how that
 * floor gets its own test.
 */
function fixtureRoot(docs: Record<string, string>, workflow?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'gate-parity-guard-'));
  mkdirSync(join(root, '.github/workflows'), { recursive: true });
  writeFileSync(
    join(root, '.github/workflows/test.yml'),
    workflow ?? readFileSync(WORKFLOW, 'utf-8'),
  );
  mkdirSync(join(root, 'docs/superpowers'), { recursive: true });
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
  const dir = mkdtempSync(join(tmpdir(), 'gate-parity-import-'));
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

const GATE_LIST = [
  'pnpm --filter @kitn.ai/ui run verify:pack',
  'pnpm --filter @kitn.ai/ui run verify:generated',
  'pnpm --filter @kitn.ai/ui exec vitest run --project=unit',
];
const fence = (lines: string[]) => `\`\`\`bash\n${lines.join('\n')}\n\`\`\`\n`;

describe('the documented-gate parity guard detects, and CI runs it', () => {
  it('ships the linter', () => {
    expect(existsSync(resolve(pkgRoot, SCRIPT)), `${SCRIPT} is missing`).toBe(true);
  });

  it(`\`${NPM_SCRIPT}\` runs the self-test half as well as the scan`, () => {
    const script = pkg.scripts[NPM_SCRIPT];
    expect(script, `no \`${NPM_SCRIPT}\` script in packages/ui/package.json`).toBeTruthy();
    expect(
      script,
      `\`${NPM_SCRIPT}\` no longer runs \`--self-test\`. That half is what proves the ` +
        `analyzer still DETECTS; without it a scan whose extractor silently stopped ` +
        `matching exits 0 and reads as a tree with no drifted gate lists.`,
    ).toContain('--self-test');
    expect(script, `\`${NPM_SCRIPT}\` no longer runs the scan itself`).toContain(SCRIPT);
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
      `the \`test\` job does not run \`${NPM_SCRIPT}\`. It is the only check that a document ` +
        `claiming to enumerate the merge gate still matches the job; without it "every gate ` +
        `is green" goes back to meaning "every gate on a list somebody typed once".`,
    ).toContain(NPM_SCRIPT);
  });

  it('the extractor sees every `run:` step the required gate graph declares', () => {
    // The failure this guard cannot survive is its own parse degrading: a smaller
    // gate set is a set more documented lists match, silently. So the step count
    // the linter REPORTS is compared against an independent count taken here, by
    // different means -- `run:` keys at the step-key column of every job in the
    // graph. Both sides are the GRAPH now, not the `test` job alone: the linter
    // scopes itself to `test` union its transitive `needs:`, and so does the
    // extraction here, so a leg the linter stops reading turns this red.
    const block = requiredGateBlock(readFileSync(WORKFLOW, 'utf-8'));
    const independent = block.split('\n').filter((line) => /^ {8}run:/.test(line)).length;
    expect(independent, 'the independent count found no run steps; this test is broken').toBeGreaterThan(30);

    const { code, output } = runLinter(['--repo-root', repoRoot]);
    expect(code, `the linter failed on the real tree:\n${output}`).toBe(0);
    const reported = /\((\d+) run steps\)/.exec(output);
    expect(reported, `the linter no longer reports its step count:\n${output}`).not.toBeNull();
    expect(
      Number(reported?.[1]),
      `the linter parsed ${reported?.[1]} run steps where an independent count over the same ` +
        `required gate graph found ${independent}. The extractor is dropping steps, which ` +
        `shrinks the gate set and makes every documented list easier to match.`,
    ).toBe(independent);
  });

  it('the shared gate-block helper refuses a graph it can barely parse', () => {
    // One helper feeds thirteen guard-wiring tests, so its own failure would be
    // thirteen silent greens. Point it at a workflow whose `test` names no legs
    // and runs almost nothing: it must throw rather than hand back a thin block
    // that a future `not.toContain` would sail through.
    expect(() =>
      requiredGateBlock(
        'jobs:\n  test:\n    steps:\n      - name: Only one\n        run: pnpm --filter @kitn.ai/ui run lint:gate-parity\n',
      ),
    ).toThrow(/under this helper's floor/);
  });

  it('the shared helper reports a `needs:` that names nothing', () => {
    // A `needs:` edge pointing at a job that does not exist means the gate does
    // not include what it thinks it does. Silently skipping it would shrink the
    // union back towards the root job without anybody noticing.
    const yaml = readFileSync(WORKFLOW, 'utf-8').replace('  test:\n', '  test:\n    needs: [ghost]\n');
    expect(() => requiredGateBlock(yaml)).toThrow(/not in the workflow/);
  });

  it('the real tree has no gate list contradicting the job', () => {
    // Not a fixture: the real docs. Historical lists carry a `partial` label; a
    // NEW unmarked one turns this red on the PR that adds it.
    const { code, output } = runLinter(['--repo-root', repoRoot]);
    expect(code, `a documented gate list contradicts the \`test\` job:\n${output}`).toBe(0);
  });

  it('fires on an UNMARKED block that looks like a gate list', () => {
    // The teeth. The historical failure was an unmarked partial list read as
    // complete, and no marking convention catches that on its own -- somebody has
    // to be forced to choose.
    const root = fixtureRoot({ 'plans/planted.md': `# planted\n\n${fence(GATE_LIST)}` });
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, 'an unmarked three-command gate list exited 0').not.toBe(0);
    expect(output).toContain('looks like a gate list');
    expect(output).toContain('plans/planted.md');
  });

  it('passes once that same block is labelled `partial`', () => {
    // Historical records get labelled, never rewritten -- the `lint:cdn-pins`
    // precedent. If the label did not actually silence the finding, every
    // historical document would have to be falsified to get CI green.
    const root = fixtureRoot({
      'plans/planted.md':
        `# planted\n\n<!-- gate-list: partial -- a subset used while iterating -->\n${fence(GATE_LIST)}`,
    });
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, `a labelled partial list was still reported:\n${output}`).toBe(0);
  });

  it('does not accept a `partial` label with no reason', () => {
    // A bare `partial` is a mute button. The reason is what makes the label a
    // claim somebody can disagree with later.
    const root = fixtureRoot({
      'plans/planted.md': `# planted\n\n<!-- gate-list: partial -->\n${fence(GATE_LIST)}`,
    });
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, 'a reasonless `partial` label was accepted').not.toBe(0);
    expect(output).toContain('no reason');
  });

  it('fires on a `complete` claim that omits gates, and NAMES them', () => {
    // The original defect, mechanized: a list asserting completeness while the
    // job runs checks it never mentions. A finding that did not name the missing
    // gate would be indistinguishable from noise and get labelled `partial`.
    const root = fixtureRoot({
      'plans/planted.md': `# planted\n\n<!-- gate-list: complete -->\n${fence(GATE_LIST)}`,
    });
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, 'a `complete` block missing most of the job exited 0').not.toBe(0);
    expect(output).toContain('MISSING from the block');
    expect(output).toContain('lint:cdn-pins');
  });

  it('prose naming gates is not a list claim', () => {
    // The scope has to stay small or the guard becomes noise, and a noisy guard
    // gets disabled. A sentence mentioning three scripts is not an enumeration.
    const root = fixtureRoot({
      'plans/planted.md':
        '# planted\n\nRun `verify:pack`, `verify:generated` and `lint:cdn-pins` before you push.\n',
    });
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, `prose was treated as a gate list:\n${output}`).toBe(0);
  });

  it('refuses a workflow it can barely parse, instead of reporting a tiny gate set', () => {
    // THE failure mode specific to this guard. An extractor that stops extracting
    // yields a near-empty gate set, which every documented list matches -- green
    // forever, comparing nothing. It must refuse to run rather than pass.
    const root = fixtureRoot(
      { 'plans/planted.md': `# planted\n\n${fence(GATE_LIST)}` },
      'jobs:\n  test:\n    steps:\n      - name: Only one\n        run: pnpm --filter @kitn.ai/ui run lint:gate-parity\n',
    );
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, 'a workflow with one step produced a gate set instead of a failure').not.toBe(0);
    expect(output).toContain('extractor found almost nothing');
  });

  it('hard-fails on a step shape nobody taught it, naming the step', () => {
    // An unrecognised step must not be silently omitted from the gate set: that
    // is how a NEW kind of check falls outside every documented list while every
    // list keeps claiming completeness.
    const workflow = readFileSync(WORKFLOW, 'utf-8').replace(
      'run: pnpm exec nx build ui',
      'run: make -j4 everything',
    );
    expect(workflow, 'the anchor this fixture rewrites is gone').toContain('make -j4 everything');
    const root = fixtureRoot({}, workflow);
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, 'an unrecognised step shape was silently dropped from the gate set').not.toBe(0);
    expect(output).toContain('unrecognised step shape');
    expect(output).toContain('make -j4 everything');
  });

  it('importing this module runs NOTHING, and its exports still answer', () => {
    // The module's top level would otherwise BE the program: `await import(...)`
    // would run the whole lint and then `process.exit()` out of the CALLER, so a
    // test or probe reaching for the analyzer would silently never get past the
    // import. This exact defect shipped in the sibling guard
    // (lint-threshold-derivation.mjs) and no test here could see it.
    const { code, output } = runImporter(
      "m.classifyCommand('pnpm --filter @kitn.ai/ui run verify:pack').id",
    );
    expect(code, `importing the guard exited ${code} instead of returning`).toBe(0);
    expect(output, 'the importer never got past `await import(...)`').toContain(IMPORT_MARKER);
    expect(output, 'the exported analyzer no longer answers after import').toContain(
      '@kitn.ai/ui run verify:pack',
    );
    expect(output, 'importing the module ran the real lint').not.toContain('lint-gate-parity:');
  });

  it('importing it is inert even when the IMPORTER\'s argv carries --self-test', () => {
    // The worse half, and the reason argv is checked rather than trusted: the
    // guard reads `--self-test` off `process.argv`, which belongs to whoever is
    // running -- so an importer that happens to carry that flag (a vitest
    // invocation, a wrapper script) would run the guard's self-test and exit 0
    // from inside the caller, and the caller would look like it passed.
    const { code, output } = runImporter(
      "m.classifyCommand('pnpm --filter @kitn.ai/ui run verify:pack').id",
      ['--self-test'],
    );
    expect(code, `importing under a stray --self-test exited ${code}`).toBe(0);
    expect(output, 'the importer never got past `await import(...)`').toContain(IMPORT_MARKER);
    expect(output, 'a stray --self-test in the importer ran the guard\'s self-test').not.toContain(
      'cases behave as specified',
    );
  });

  it('reports a misrooted run rather than a clean one', () => {
    // No workflow means nothing to compare against. Exiting 0 there would make
    // every misinvocation read as "no documented list is wrong".
    const root = mkdtempSync(join(tmpdir(), 'gate-parity-empty-'));
    const { code, output } = runLinter(['--repo-root', root]);
    expect(code, 'a root with no workflow exited 0').not.toBe(0);
    expect(output).toContain('.github/workflows/test.yml');
  });
});
