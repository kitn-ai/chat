/**
 * GUARD — `verify:pack` still DETECTS.
 *
 * WHY THIS FILE EXISTS, stated plainly because it is an indictment of the change
 * that shipped without it. `verify-pack.mjs` was wired into the required CI job
 * and given a `prepublishOnly` hook, and at that moment its own rules had no
 * test at all. A verifier then neutered the script — forcing its findings array
 * to constant-empty — and the whole suite stayed green; run against a genuinely
 * broken tree, the neutered script printed `7 of 8 with a _gitignore` and exited
 * 0. `test/publish-shape.test.ts` grades that the hook is WIRED to call it and
 * that CI INVOKES it, both by string, and neither question is whether the thing
 * being invoked still works.
 *
 * That is the same failure this whole change is downstream of: a check that
 * cannot fire reads exactly like a clean tree. So nothing here trusts the
 * script's self-report. Each rule is watched REJECTING a planted defect in a
 * throwaway package root, and the exit code is what is asserted.
 *
 * THE FIXTURES ARE SYNTHETIC ON PURPOSE. Pointing these at the real `dist/`
 * would make them pass or fail on whether someone had run a build, and the one
 * case that matters most — a single template regressing — cannot be planted in
 * the real tree without breaking it for every other test in the suite.
 *
 * COST: each case shells out to `npm pack --dry-run --json` in a temp dir, which
 * is ~1s. That is the price of grading the packed listing rather than a model of
 * it, and the packed listing is the only place these defects are visible.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PKG_ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(PKG_ROOT, 'scripts/verify-pack.mjs');

/** The shape of a built tree, as `dist/` relative paths. `null` omits a file. */
type Tree = Record<string, string | null>;

/** A believable built package: a bundled CLI plus two templates. */
const tree = (over: Tree = {}): Tree => ({
  'index.js': '#!/usr/bin/env node\nconsole.log("kai");\n',
  'templates/react/package.json': '{"name":"react-app","private":true}\n',
  'templates/react/_gitignore': 'node_modules/\n.env.local\n',
  'templates/react/src/App.tsx': 'export default function App() { return null; }\n',
  'templates/vue/package.json': '{"name":"vue-app","private":true}\n',
  'templates/vue/_gitignore': 'node_modules/\n.env.local\n',
  'templates/vue/src/App.vue': '<template><div /></template>\n',
  ...over,
});

/**
 * A throwaway package root the script can be pointed at with `--package-root`.
 * `files`/`bin` mirror the real manifest, because those are what decide the
 * packed listing the script reads.
 */
function fixtureRoot(files: Tree, label = 'verify-pack-'): string {
  const root = mkdtempSync(path.join(tmpdir(), label));
  writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify(
      {
        name: 'create-kai-fixture',
        version: '0.0.0',
        type: 'module',
        bin: { 'create-kai-fixture': './dist/index.js' },
        files: ['dist'],
      },
      null,
      2,
    )}\n`,
  );
  for (const [relative, contents] of Object.entries(files)) {
    if (contents === null) continue;
    const abs = path.join(root, 'dist', relative);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, contents);
  }
  return root;
}

/** Runs the real script against a fixture and returns its exit code + output. */
function runVerifier(root: string, script = SCRIPT): { code: number; output: string } {
  try {
    const stdout = execFileSync('node', [script, '--package-root', root], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('verify:pack still detects', () => {
  it('accepts a well-formed tree', () => {
    // THE CONTROL. Without it every assertion below is satisfied by a script that
    // exits 1 unconditionally, which is the other way to be useless.
    const { code, output } = runVerifier(fixtureRoot(tree()));
    expect(code, `a clean tree was rejected: ${output}`).toBe(0);
    expect(output).toContain('2 of 2 with a _gitignore');
  });

  it('fires when a SINGLE template loses its _gitignore, and names it', () => {
    // THE REGRESSION THIS RULE WAS REWRITTEN FOR. The previous rule was
    // `underscored.length === 0`, so one template regressing left it silent —
    // and one is the shape the defect actually has.
    const root = fixtureRoot(tree({ 'templates/react/_gitignore': null }));
    const { code, output } = runVerifier(root);

    expect(code, 'a template with no _gitignore was accepted').toBe(1);
    expect(output).toContain('1 of 2 template(s)');
    // NAMING is the requirement, not just failing: a count sends a reviewer
    // hunting for which one.
    expect(output).toContain('react');
    expect(output).not.toContain('vue');
  });

  it('names every offender when more than one regresses', () => {
    const root = fixtureRoot(
      tree({ 'templates/react/_gitignore': null, 'templates/vue/_gitignore': null }),
    );
    const { code, output } = runVerifier(root);

    expect(code).toBe(1);
    expect(output).toContain('2 of 2 template(s)');
    expect(output).toContain('react');
    expect(output).toContain('vue');
  });

  it('fires on a literal .gitignore on disk — the check that used to be unfireable', () => {
    // The rule this replaced read the PACKED listing for a `.gitignore`, which npm
    // strips on the way in, so it could never match. This reads the built tree,
    // where the file demonstrably is. Both rules fire here: the file is present
    // under the wrong name, so the template also has no `_gitignore`.
    const root = fixtureRoot(
      tree({ 'templates/react/_gitignore': null, 'templates/react/.gitignore': 'node_modules/\n' }),
    );
    const { code, output } = runVerifier(root);

    expect(code).toBe(1);
    expect(output).toContain('literal .gitignore');
    expect(output).toContain('react/.gitignore');
  });

  it('fires when the bin target is missing from the tarball', () => {
    const { code, output } = runVerifier(fixtureRoot(tree({ 'index.js': null })));
    expect(code).toBe(1);
    expect(output).toContain('dist/index.js is missing');
  });

  it('fires when a template packs nothing at all', () => {
    // A template directory that exists but contributes no packed files is absent
    // from the listing, so a rule deriving its template set from the listing alone
    // would drop it — "no findings" and "nothing to find" looking identical again.
    const root = fixtureRoot(tree());
    mkdirSync(path.join(root, 'dist/templates/svelte'), { recursive: true });
    const { code, output } = runVerifier(root);

    expect(code).toBe(1);
    expect(output).toContain('svelte');
  });

  it('would catch the analyzer being neutered', () => {
    // THE CONTROL FOR THIS FILE. Every assertion above rests on the fixtures being
    // genuinely broken; if they were not, a do-nothing script would pass them all.
    // So run a copy of the real script with its findings forced constant-empty —
    // exactly what a verifier did to it — against the tree from the single-template
    // case, and require that it goes GREEN. That is what makes the red above
    // evidence about the script rather than about the fixture.
    const source = readFileSync(SCRIPT, 'utf8');
    // Every finding is swallowed instead of recorded — findings still computed,
    // never reported, which is the faithful version of what was done to it. The
    // sink is declared ON the findings-array line rather than prepended, because
    // prepending displaces the `#!` shebang off line 1 and the copy dies of a
    // SyntaxError — which looks like the control working while proving nothing.
    const disarmed = source
      .replace('const problems = [];', 'const problems = []; const _noop = () => {};')
      .replace(/problems\.push\(/g, '_noop(');
    expect(disarmed, 'no `problems.push(` in the script: this control is not disarming it').not.toBe(
      source,
    );
    expect(disarmed.startsWith('#!'), 'the shebang must stay on line 1 or the copy cannot run').toBe(
      true,
    );

    const root = mkdtempSync(path.join(tmpdir(), 'verify-pack-neutered-'));
    const copy = path.join(root, 'verify-pack.mjs');
    writeFileSync(copy, disarmed);

    const broken = fixtureRoot(tree({ 'templates/react/_gitignore': null }));
    const { code } = runVerifier(broken, copy);
    expect(
      code,
      'a neutered analyzer still failed the broken fixture, so the assertions above ' +
        'may be passing on something other than the rules they name',
    ).toBe(0);

    // And the real script on the SAME tree disagrees. That pair is the evidence.
    expect(runVerifier(broken).code).toBe(1);

    rmSync(root, { recursive: true, force: true });
  });
});
