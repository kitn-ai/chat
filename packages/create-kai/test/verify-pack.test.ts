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

import { gatewayPatchesFor, patchesFor } from '../src/patches';
import { STRIPPED_DOTFILES, travellingName } from '../src/template-dotfiles';

const PKG_ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(PKG_ROOT, 'scripts/verify-pack.mjs');

/** The shape of a built tree, as `dist/` relative paths. `null` omits a file. */
type Tree = Record<string, string | null>;

/**
 * Every file the real patch tables open for `templateDir`, under the name a
 * template packs it as.
 *
 * DERIVED, so the fixture cannot drift from the table. The script reads the same
 * two tables to decide what the tarball must carry, so a hand-written fixture
 * would have to be updated by hand every time a patch row was added — and the
 * "clean tree" control below would go red for a reason that is not a defect,
 * which is how a control gets deleted.
 */
const patchedFixtureFiles = (templateDir: string): Tree =>
  Object.fromEntries(
    [...patchesFor(templateDir), ...gatewayPatchesFor(templateDir)].map((patch) => {
      const base = path.posix.basename(patch.file);
      const dir = path.posix.dirname(patch.file);
      const packed = STRIPPED_DOTFILES.includes(base) ? travellingName(base) : base;
      return [`templates/${templateDir}/${dir === '.' ? packed : `${dir}/${packed}`}`, 'fixture\n'];
    }),
  );

/** A believable built package: a bundled CLI plus two templates. */
const tree = (over: Tree = {}): Tree => ({
  'index.js': '#!/usr/bin/env node\nconsole.log("kai");\n',
  'templates/react/package.json': '{"name":"react-app","private":true}\n',
  'templates/react/_gitignore': 'node_modules/\n.env.local\n',
  'templates/react/src/App.tsx': 'export default function App() { return null; }\n',
  'templates/vue/package.json': '{"name":"vue-app","private":true}\n',
  'templates/vue/_gitignore': 'node_modules/\n.env.local\n',
  'templates/vue/src/App.vue': '<template><div /></template>\n',
  // The files the CLI patches in these two templates, so a clean fixture is
  // clean by the completeness rule too.
  ...patchedFixtureFiles('react'),
  ...patchedFixtureFiles('vue'),
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

  /**
   * THE 0.1.0 DEFECT, planted in the shape it actually shipped in.
   *
   * `create-kai@0.1.0` published `nextjs` and `tanstack-start` templates with a
   * literal `.npmrc` — npm strips that name, so the tarball had neither `.npmrc`
   * nor `_npmrc` — while the bundled CLI still had a `PATCHES` row that opens
   * one. `npx create-kai myapp --framework nextjs -y` died with
   * `ENOENT: ... open '.../myapp/.npmrc'`, and the version of this script that
   * was in required CI printed `tarball OK — 176 files, 8 template(s), 8 of 8
   * with a _gitignore` over exactly that package.
   *
   * The fixture uses the REAL template directory names, so the rule's derivation
   * is what is being exercised: the script reads `src/patches.ts` from this
   * package (never from `--package-root`, which only swaps the tree being
   * packed), finds a `.npmrc` row for both, and looks for it under its packed
   * name. Rename the row's file in that table and this test follows.
   */
  it('fires on the 0.1.0 defect: a patched file npm stripped out of the tarball', () => {
    const root = fixtureRoot({
      'index.js': '#!/usr/bin/env node\n',
      // Both standalone templates, complete except for the one file npm eats.
      'templates/nextjs/package.json': '{"name":"next-app","private":true}\n',
      'templates/nextjs/_gitignore': 'node_modules/\n',
      ...patchedFixtureFiles('nextjs'),
      'templates/nextjs/_npmrc': null,
      'templates/tanstack-start/package.json': '{"name":"ts-app","private":true}\n',
      'templates/tanstack-start/_gitignore': 'node_modules/\n',
      ...patchedFixtureFiles('tanstack-start'),
      'templates/tanstack-start/_npmrc': null,
    });
    const { code, output } = runVerifier(root);

    expect(code, 'a tarball the CLI cannot scaffold from was accepted').toBe(1);
    // NAMED, both of them, with the file and the consequence.
    expect(output).toContain("template 'nextjs' is missing '.npmrc'");
    expect(output).toContain("template 'tanstack-start' is missing '.npmrc'");
    expect(output).toContain('ENOENT');
  });

  it('accepts the same two templates once the file travels as _npmrc', () => {
    // THE CONTROL FOR THE RULE ABOVE, and the thing the fix actually changed.
    // Without it the assertion above is satisfied by a rule that rejects every
    // standalone template, `.npmrc` or not.
    const root = fixtureRoot({
      'index.js': '#!/usr/bin/env node\n',
      'templates/nextjs/package.json': '{"name":"next-app","private":true}\n',
      'templates/nextjs/_gitignore': 'node_modules/\n',
      ...patchedFixtureFiles('nextjs'),
      'templates/tanstack-start/package.json': '{"name":"ts-app","private":true}\n',
      'templates/tanstack-start/_gitignore': 'node_modules/\n',
      ...patchedFixtureFiles('tanstack-start'),
    });
    const { code, output } = runVerifier(root);

    expect(code, `the fixed shape was rejected: ${output}`).toBe(0);
  });

  it('fires on a literal .npmrc on disk, the same way it does for .gitignore', () => {
    // The other half of the fix: the built tree is where a stripped file is
    // still observable. This rule read only `.gitignore` and looked straight
    // past `.npmrc` in 0.1.0; it now runs over STRIPPED_DOTFILES, so the list
    // and the rule cannot disagree.
    const root = fixtureRoot(
      tree({ 'templates/react/.npmrc': 'install-links=true\n' }),
    );
    const { code, output } = runVerifier(root);

    expect(code).toBe(1);
    expect(output).toContain('a literal .npmrc');
    expect(output).toContain('react/.npmrc');
    expect(output).toContain('_npmrc');
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

    // THE COPY LIVES IN THE REAL `scripts/`, not a temp directory, and that is
    // load-bearing rather than incidental. The script imports `./load-ts.mjs`
    // and locates this package from its own path, so a copy anywhere else dies
    // on an unresolvable import — which exits 1 and reads exactly like the
    // control working, while actually proving that a broken file fails. Watched:
    // from `os.tmpdir()` this case goes red with the neutered copy exiting 1.
    const copy = path.join(PKG_ROOT, 'scripts', `verify-pack.neutered-${process.pid}.mjs`);
    writeFileSync(copy, disarmed);

    try {
      const broken = fixtureRoot(tree({ 'templates/react/_gitignore': null }));
      const { code, output } = runVerifier(broken, copy);
      expect(
        code,
        'a neutered analyzer still failed the broken fixture, so the assertions above ' +
          `may be passing on something other than the rules they name: ${output}`,
      ).toBe(0);

      // And the real script on the SAME tree disagrees. That pair is the evidence.
      expect(runVerifier(broken).code).toBe(1);
    } finally {
      rmSync(copy, { force: true });
    }
  });
});
