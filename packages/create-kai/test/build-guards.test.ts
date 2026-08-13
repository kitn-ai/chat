/**
 * The build's structural guards, exercised directly.
 *
 * These rules used to live inside `scripts/build.mjs`, which runs `main()` on
 * import and so could not be tested at all — the only way to see one fire was to
 * run the whole build and read stderr. That is the structural reason a guard
 * once shipped unable to match the one string it was pointed at: this repo's
 * discipline is to watch a check go red before trusting it, and that is
 * physically impossible against a check with no seam to grab.
 *
 * So the point of this file is not coverage. It is that each rule is watched
 * REJECTING a real defect — most of them defects this repo actually shipped —
 * next to a control showing it accepting the tree as it stands today.
 */
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  GITIGNORE_SOURCE_NAME,
  appPathProblem,
  declaredPathsProblem,
  emittedContentProblem,
  gitignoreProblem,
  patchMatchProblem,
  sharedDevDepsProblem,
} from '../src/build-guards';
import type { TemplateReader } from '../src/build-guards';
import { FRAMEWORKS, getFramework } from '../src/frameworks';
import { GITIGNORE_TEMPLATE_NAME, goLiveThread } from '../src/generate';
import { patchesFor } from '../src/patches';

const PKG_ROOT = path.resolve(__dirname, '..');
const STARTERS = path.resolve(PKG_ROOT, '../../examples/starters');
const READY = FRAMEWORKS.filter((f) => f.status === 'ready');

/** The seam itself: a reader over literals, no template tree required. */
const reader =
  (files: Record<string, string>): TemplateReader =>
  (relative) =>
    files[relative] ?? null;

/** A reader over a real starter, which is the shape `build.mjs` passes. */
const starterReader =
  (dir: string): TemplateReader =>
  (relative) => {
    const abs = path.join(STARTERS, dir, relative);
    return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  };

const starterExists = (dir: string) => (relative: string) =>
  existsSync(path.join(STARTERS, dir, relative));

const starterFile = (dir: string, relative: string) =>
  readFileSync(path.join(STARTERS, dir, relative), 'utf8');

/**
 * Assert a rule rejected, and that its message says the things that help.
 *
 * The null check is separate and comes first on purpose. `expect(null).toContain`
 * reports "the given combination of arguments (null and string) is invalid",
 * which is what a reader would see the day one of these rules quietly stops
 * rejecting — the exact moment the message needs to name the problem instead.
 */
function expectRejected(problem: string | null, ...fragments: string[]): void {
  expect(problem, 'the rule returned null: it accepted a defect it exists to reject').not.toBeNull();
  for (const fragment of fragments) expect(problem).toContain(fragment);
}

describe('the patch-match guard', () => {
  it('rejects a patch whose starter has been reworded under it', () => {
    // The real patch and the real file it targets, read from the tree rather
    // than restated here — a copy of either would keep agreeing with itself
    // after someone edited the starter, which is the failure this guards.
    const [title] = patchesFor('vue');
    const source = starterFile('vue', 'index.html');

    // THE CONTROL: they agree today.
    expect(patchMatchProblem('vue', [title], reader({ 'index.html': source }))).toBeNull();

    // Reword the title the way a starter edit would, and the patch is now a
    // string that agrees with nothing. Without this rule it applies silently to
    // nothing and every emitted Vue project keeps the kit's own browser tab.
    const reworded = source.replace('@kitn.ai/ui Vue example', '@kitn.ai/ui Vue starter');
    expect(reworded).not.toBe(source);

    expectRejected(
      patchMatchProblem('vue', [title], reader({ 'index.html': reworded })),
      'no longer matches',
      title.why,
      'update PATCHES in src/patches.ts',
    );
  });

  it('rejects a patch aimed at a file the template does not have', () => {
    const [title] = patchesFor('vue');
    // An empty template: the patch names `index.html` and nothing answers.
    expectRejected(
      patchMatchProblem('vue', [title], reader({})),
      "patch targets index.html, which template 'vue' does not have",
    );
  });

  it('refuses an ambiguous patch, and lets a rename opt in', () => {
    // `angular.json` names the project four times. That is the one patch in the
    // table that opts into `multiple`, and it is the reason the opt-in exists.
    const rename = patchesFor('angular').find((p) => p.file === 'angular.json')!;
    const angularJson = starterFile('angular', 'angular.json');
    const files = reader({ 'angular.json': angularJson });

    // THE CONTROL: four matches are fine BECAUSE it opted in.
    expect(rename.multiple).toBe(true);
    expect(patchMatchProblem('angular', [rename], files)).toBeNull();

    // The same patch without the opt-in is exactly the bug the rule is for: a
    // non-global replace would rewrite the first of four and ship three
    // references to our example name into the user's project.
    const withoutOptIn = { ...rename, multiple: undefined };
    expectRejected(
      patchMatchProblem('angular', [withoutOptIn], files),
      'matches 4 times',
      'it must be unambiguous',
    );
  });

  it('holds the live patch table against the live starters', () => {
    // The build's own check, now runnable without running the build.
    for (const framework of READY) {
      const problem = patchMatchProblem(
        framework.templateDir,
        patchesFor(framework.templateDir),
        starterReader(framework.templateDir),
      );
      expect(problem, framework.id).toBeNull();
    }
  });
});

describe('the emitted-content guard', () => {
  it('rejects the Vue incident: a ready framework with no patches behind it', () => {
    // What actually shipped. The build printed `2 patches verified`, both of
    // them React's, and emitted a Vue project whose browser tab read
    // "@kitn.ai/ui Vue example" and whose vite.config told the user to run
    // `nx build ui`. An empty patch list is how that passed.
    const html = starterFile('vue', 'index.html');
    const viteConfig = starterFile('vue', 'vite.config.ts');

    expectRejected(
      emittedContentProblem('vue', [], [['index.html', html]]),
      'would ship repo-internal instructions',
    );
    expectRejected(
      emittedContentProblem('vue', [], [['vite.config.ts', viteConfig]]),
      'would ship repo-internal instructions',
    );
  });

  it('reports the title family for a name no pattern lists', () => {
    // The Solid starter titles itself "kai-chat — SolidJS Primitives Example":
    // an element name standing in for a product that has since been renamed. It
    // contains no `@kitn.ai/ui`, so the repo-internal patterns are blind to it
    // and the OTHER family is what catches it. Two families, two fixes — a
    // repo-internal instruction wants a new patch, a wrong title wants that
    // patch to name the project.
    expectRejected(
      emittedContentProblem('solid', [], [['index.html', starterFile('solid', 'index.html')]]),
      'would ship a browser tab that does not name',
      'kai-chat — SolidJS Primitives Example',
    );
  });

  it('accepts the same files once their real patches have run', () => {
    // THE CONTROL for the test above, and the reason this rule grades the
    // OUTPUT: identical bytes, opposite verdict, and the only difference is the
    // patch list the framework actually carries.
    for (const framework of READY) {
      const dir = framework.templateDir;
      const files = patchesFor(dir).map(
        (patch) => [patch.file, starterFile(dir, patch.file)] as const,
      );
      expect(files.length, dir).toBeGreaterThan(0);
      expect(emittedContentProblem(dir, patchesFor(dir), files), dir).toBeNull();
    }
  });

  it('does not grade a binary file', () => {
    // Built with fromCharCode so the NUL cannot be mangled into a literal by an
    // editor. A .ico or .png can hold any byte sequence; instructions to a user
    // are not among them, and decoding one as utf8 produces noise that would
    // report a defect nobody can act on.
    const NUL = String.fromCharCode(0);
    const binary = `${NUL}<html><head><title>Vite + Vue</title></head></html>${NUL}`;

    expect(emittedContentProblem('vue', [], [['favicon.html', binary]])).toBeNull();
    // The same bytes without the NUL are a defect, so the skip is what decided
    // it — not the filename, and not an accident of the content.
    expectRejected(
      emittedContentProblem('vue', [], [['favicon.html', binary.split(NUL).join('')]]),
      'would ship a browser tab that does not name',
    );
  });

  it('grades the fully patched file, not a half-patched one', () => {
    // This rule used to rebuild the patch regex by hand and so could not see a
    // `multiple` patch: it graded a file no user would ever receive. Four
    // occurrences, one opted-in rename, and every one of them has to be gone
    // before the content is judged.
    const rename = patchesFor('angular').find((p) => p.file === 'angular.json')!;
    const patched = emittedContentProblem(
      'angular',
      [rename],
      [['angular.json', starterFile('angular', 'angular.json')]],
    );
    expect(patched).toBeNull();
  });
});

describe('the app-path guard', () => {
  it('rejects a declared app the template does not have', () => {
    const vue = getFramework('vue')!;
    expectRejected(
      appPathProblem(vue, reader({}), goLiveThread),
      "declares paths.app='src/App.vue'",
      'kai.json records that path',
    );
  });

  it('holds every ready framework against its real app file', () => {
    // A path nothing else in the build ever opens. Vue's is `src/App.vue` where
    // React's is `src/App.tsx` — exactly the value that gets copied down from
    // the row above and then quietly points at nothing.
    for (const framework of READY) {
      expect(
        appPathProblem(framework, starterReader(framework.templateDir), goLiveThread),
        framework.id,
      ).toBeNull();
    }
  });

  it('lets goLiveThread throw its own explanation through', () => {
    // The Solid and SSR case, stated rather than swallowed: the app file is
    // where it should be, but carries no `toOpenAIMessages(...)` for the emitted
    // README to quote. That throw is the guard working — see frameworks.ts.
    const vue = getFramework('vue')!;
    expect(() =>
      appPathProblem(vue, reader({ 'src/App.vue': 'const x = 1;' }), goLiveThread),
    ).toThrow(/balanced/);
  });
});

describe('the declared-paths guard', () => {
  it('rejects the Solid-shaped drift: a stylesheet named from the row above', () => {
    const solid = getFramework('solid')!;

    // THE CONTROL: the row as it stands is true of its starter.
    expect(declaredPathsProblem(solid, starterExists('solid'))).toBeNull();

    // What the row said until it was fixed: `src/index.css`, copied down from
    // every other framework, where the Solid starter's stylesheet has always
    // been `src/styles.css`. Nothing caught it because `planned` frameworks are
    // never checked against their templates at all.
    const drifted = { ...solid, paths: { ...solid.paths, css: 'src/index.css' } };
    expectRejected(
      declaredPathsProblem(drifted, starterExists('solid')),
      "paths.css = 'src/index.css'",
      'copied verbatim into the emitted kai.json',
    );
  });

  it('exempts env and app, and nothing else', () => {
    const react = getFramework('react')!;
    const exists = starterExists('react');

    // `.env.local` is the file the user is told to CREATE for a keyed gateway,
    // so a template carrying one would be the bug.
    expect(declaredPathsProblem({ ...react, paths: { ...react.paths, env: 'nope' } }, exists)).toBeNull();
    // `app` belongs to appPathProblem, which also checks its contents.
    expect(declaredPathsProblem({ ...react, paths: { ...react.paths, app: 'nope' } }, exists)).toBeNull();
    // Everything else is graded.
    expectRejected(
      declaredPathsProblem({ ...react, paths: { ...react.paths, entry: 'nope' } }, exists),
      "paths.entry = 'nope'",
    );
    expectRejected(
      declaredPathsProblem({ ...react, paths: { ...react.paths, components: 'nope' } }, exists),
      "paths.components = 'nope'",
    );
  });

  it('holds every ready framework against its real template', () => {
    for (const framework of READY) {
      expect(
        declaredPathsProblem(framework, starterExists(framework.templateDir)),
        framework.id,
      ).toBeNull();
    }
  });
});

describe('the shared-devDeps guard', () => {
  it('rejects the range that silently downgraded the kit', () => {
    // The incident: `@types/node: ^22` copied out of a starter's package.json.
    // `.npmrc` sets node-linker=hoisted, so one version wins for the whole
    // workspace — the kit's own suite started timing out, and nothing in that
    // failure pointed back at this package.
    expectRejected(
      sharedDevDepsProblem(
        { devDependencies: { '@types/node': '^22' } },
        { devDependencies: { '@types/node': '^26.0.0' } },
      ),
      '@types/node: create-kai wants ^22, packages/ui wants ^26.0.0',
      'node-linker=hoisted',
    );
  });

  it('reads the kit’s dependencies, not only its devDependencies', () => {
    // A runtime dependency of the kit hoists exactly the same way. Comparing
    // only the dev block would miss half the packages that can clash.
    expectRejected(
      sharedDevDepsProblem({ devDependencies: { zod: '^3' } }, { dependencies: { zod: '^4' } }),
      'zod: create-kai wants ^3, packages/ui wants ^4',
    );
  });

  it('says nothing about a package only one side declares', () => {
    expect(sharedDevDepsProblem({ devDependencies: { esbuild: '^0.28.1' } }, {})).toBeNull();
    expect(sharedDevDepsProblem({}, { devDependencies: { vite: '^7' } })).toBeNull();
    expect(
      sharedDevDepsProblem({ devDependencies: { vitest: '^4.1.0' } }, { devDependencies: { vitest: '^4.1.0' } }),
    ).toBeNull();
  });

  it('holds the two live manifests against each other', () => {
    const read = (rel: string) => JSON.parse(readFileSync(path.join(PKG_ROOT, rel), 'utf8'));
    expect(sharedDevDepsProblem(read('package.json'), read('../ui/package.json'))).toBeNull();
  });
});

describe('the gitignore guard', () => {
  it('rejects a starter with no .gitignore', () => {
    // The tree a `create-vite`-derived starter has when someone forgets the
    // file, or when a copy filter starts eating it: everything else present.
    const files = new Set(['package.json', 'index.html', 'src/App.tsx']);

    expectRejected(
      gitignoreProblem('react', (rel) => files.has(rel)),
      "starter 'react' has no .gitignore",
      'an emitted project needs one',
    );
  });

  it('accepts one that has it, under the name a starter uses', () => {
    // THE CONTROL. Note which name satisfies it: the guard runs against the
    // COPIED tree before the build renames the file, so `.gitignore` is what
    // must be there. A template already carrying the underscored name has not
    // satisfied this rule — it is what the rule's output becomes.
    expect(gitignoreProblem('react', (rel) => rel === GITIGNORE_SOURCE_NAME)).toBeNull();
    expectRejected(
      gitignoreProblem('react', (rel) => rel === GITIGNORE_TEMPLATE_NAME),
      'has no .gitignore',
    );
  });

  it('holds every ready framework against its real starter', () => {
    // The live check, and the reason this rule is worth its own seam: these are
    // the five trees a published `npx create-kai` actually copies.
    for (const framework of READY) {
      expect(
        gitignoreProblem(framework.templateDir, starterExists(framework.templateDir)),
        `${framework.id}: its starter must carry a ${GITIGNORE_SOURCE_NAME}`,
      ).toBeNull();
    }
  });

  it('names the file the same way generate() does, so the rename round-trips', () => {
    // The drift this pair exists to prevent: `build.mjs` renames
    // GITIGNORE_SOURCE_NAME -> GITIGNORE_TEMPLATE_NAME, `generate()` renames it
    // back. They are declared once each and must not converge or collide.
    expect(GITIGNORE_SOURCE_NAME).toBe('.gitignore');
    expect(GITIGNORE_TEMPLATE_NAME).toBe('_gitignore');
    expect(GITIGNORE_TEMPLATE_NAME).not.toBe(GITIGNORE_SOURCE_NAME);
    // npm strips a packed `.gitignore`; the travelling name must not be one.
    expect(GITIGNORE_TEMPLATE_NAME.startsWith('.')).toBe(false);
  });
});

describe('the seam these rules were moved to have', () => {
  /**
   * Assert the move cannot rot back.
   *
   * `scripts/build.mjs` ends in `main().catch(...)`, so importing it runs a
   * build: anything defined there is unreachable from a test by construction,
   * and a rule nobody can watch fail is a rule nobody should trust. That is not
   * a style preference, it is the property this refactor bought, and the next
   * person to add a guard will reach for the file that already does the reading.
   *
   * So this greps for a guard-shaped declaration rather than for any function —
   * `copyTemplate`, `walk` and `readTemplateFiles` are filesystem plumbing and
   * belong there. What must not reappear is a RULE.
   *
   * KNOWN LIMIT, unchanged and stated rather than papered over: this reads NAMES
   * at the top level, so it catches a guard someone declares and misses one they
   * inline into a function that already does the reading. Catching that shape
   * needs a parser rather than a regex, and a check that overstates its reach is
   * the thing this file exists to argue against.
   *
   * `copyTemplate` used to hold exactly one of those — the `.gitignore`
   * requirement, named here when this check was written because it was the one
   * rule the regex provably could not see. It now lives in
   * `gitignoreProblem`, so the blind spot is real but currently empty; the
   * paragraph above stays because the NEXT inlined rule will be just as
   * invisible.
   */
  it('has no guard left in build.mjs, where nothing could reach it', () => {
    const source = readFileSync(path.join(PKG_ROOT, 'scripts/build.mjs'), 'utf8');
    const GUARD_SHAPED = /^(?:(?:async\s+)?function|const)\s+((?:verify|check|assert|guard)\w*)/gm;
    const declarations = [...source.matchAll(GUARD_SHAPED)].map((m) => m[1]);

    expect(
      declarations,
      'A guard in build.mjs can only be exercised by running the whole build, so it can never ' +
        'be watched failing. Move the rule into src/build-guards.ts as a function over data and ' +
        'test it there; leave build.mjs the reading of files.',
    ).toEqual([]);
  });
});
