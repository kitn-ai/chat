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
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type * as TSApi from 'typescript';

import * as esbuild from 'esbuild';

import {
  GITIGNORE_SOURCE_NAME,
  appPathProblem,
  bundleGraphProblem,
  declaredPathsProblem,
  emittedContentProblem,
  gitignoreProblem,
  missingStarterProblem,
  patchMatchProblem,
  readyFrameworksProblem,
  sharedDevDepsProblem,
  templateIgnoreProblem,
  templateSkips,
} from '../src/build-guards';
import type { TemplateReader } from '../src/build-guards';
import { FRAMEWORKS, getFramework } from '../src/frameworks';
import type { FrameworkDef } from '../src/frameworks';
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
    // The Solid starter titled itself "kai-chat — SolidJS Primitives Example"
    // until it became a `ready` chat app: an element name standing in for a
    // product that has since been renamed. It contains no `@kitn.ai/ui`, so the
    // repo-internal patterns are blind to it and the OTHER family is what
    // catches it. Two families, two fixes — a repo-internal instruction wants a
    // new patch, a wrong title wants that patch to name the project.
    //
    // A LITERAL, NOT THE LIVE FILE, and the distinction is the whole test. Every
    // starter's title now matches the `@kitn.ai/ui … example` shape, so the
    // repo-internal family fires on all of them and would win this race — read
    // live, this would assert the title rule while actually exercising the one
    // above it. The fixture has to be a title NO pattern lists or the test does
    // not test what it is named for. `test/template-guards.test.ts` keeps the
    // live sweep over every starter's real title.
    const source =
      '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n' +
      '    <title>kai-chat — SolidJS Primitives Example</title>\n  </head>\n' +
      '  <body><div id="root"></div></body>\n</html>\n';

    expectRejected(
      emittedContentProblem('solid', [], [['index.html', source]]),
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

/**
 * The bundle-graph guard, against the regression it was written for.
 *
 * This one is not hypothetical and the numbers below are measured, not
 * illustrative: exporting `chatRoutePreamble` + `CLIENT_MODEL_IDS` +
 * `defaultModelFor` from `agent-tooling/mcp/tools/scaffold.ts` and importing
 * them here took `dist/index.js` from 203 kB to 904 kB, 505 kB of it zod the CLI
 * never executes. Every seam that was being watched stayed green — the emitted
 * scaffold output was byte-identical, `verify:scaffold` was 616/616 and 99/99,
 * the unit suites passed — because none of them ask what the bundle DRAGS. The
 * build printed the new size as an informational line and nobody read it.
 */
describe('the bundle-graph guard', () => {
  /** The real graph, minus the two entries under test. */
  const legitimateGraph = [
    'src/index.ts',
    'src/catalog.ts',
    'src/routes.ts',
    '../ui/src/agent-tooling/registry.ts',
    '../ui/src/agent-tooling/types.ts',
    '../ui/src/agent-tooling/route-emit.ts',
    '../ui/src/agent-tooling/integrations/anthropic.ts',
    '../../node_modules/.pnpm/@clack+prompts@0.11.0/node_modules/@clack/prompts/dist/index.mjs',
  ];

  it('rejects the graph that shipped 505 kB of zod to every npx user', () => {
    expectRejected(
      bundleGraphProblem([
        ...legitimateGraph,
        '../../node_modules/.pnpm/zod@4.1.13/node_modules/zod/v4/classic/schemas.js',
        '../../node_modules/.pnpm/zod@4.1.13/node_modules/zod/v4/core/parse.js',
      ]),
      'zod',
      'npx create-kai',
    );
  });

  /**
   * THE HALF THAT MATTERS MORE. zod is the cost; the import is the cause, and
   * the cause is a property of the module rather than of what you took from it —
   * `tools/scaffold.ts` builds its MCP input schema at module scope, so esbuild
   * has to keep all 5,300 lines of it. Grading only the zod half would go green
   * on the day that file's own dependencies happen to shake clean, and the CLI
   * would still be carrying a whole MCP tool it does not run.
   */
  it('rejects reaching into the MCP even when zod itself shook clean', () => {
    expectRejected(
      bundleGraphProblem([...legitimateGraph, '../ui/src/agent-tooling/mcp/tools/scaffold.ts']),
      'agent-tooling/mcp/tools/scaffold.ts',
      'move it to a leaf',
    );
    // …and it must not be satisfied by the leaf that replaced it. `route-emit.ts`
    // sits at the root of agent-tooling/ precisely so this rule can tell the two
    // apart; a rule keyed on `agent-tooling/` would reject the fix along with the
    // defect.
    expect(bundleGraphProblem(legitimateGraph)).toBeNull();
  });

  /**
   * THE LIVE ONE. The three above grade the rule against a written-out graph,
   * which cannot notice a real import landing in this package tomorrow. This
   * bundles the actual CLI entry point and asks esbuild what it reached — the
   * same question `scripts/build.mjs` asks, from the same metafile, so a
   * regression fails here in the fast suite and not only in a build log.
   */
  it('holds the real CLI entry point', async () => {
    const built = await esbuild.build({
      entryPoints: [path.join(PKG_ROOT, 'src/index.ts')],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'esm',
      metafile: true,
    });
    const inputs = Object.keys(built.metafile.inputs);
    // A guard over an empty graph would pass for the wrong reason; the bundle is
    // ~90 modules, so anything near zero means the bundle step, not the rule.
    expect(inputs.length).toBeGreaterThan(20);
    expect(bundleGraphProblem(inputs)).toBeNull();
  });
});

describe('the ready-framework guard', () => {
  it('rejects a table where the last ready row has been flipped to planned', () => {
    // The real table, with the one field that decides this flipped on every row
    // — the drift that actually happens, rather than a hand-written empty array.
    // Typed as the table it stands in for, so the filter below is the build's.
    const allPlanned: FrameworkDef[] = FRAMEWORKS.map((f) => ({ ...f, status: 'planned' }));

    expectRejected(
      readyFrameworksProblem(allPlanned.filter((f) => f.status === 'ready')),
      'no framework is marked ready',
    );
  });

  it('accepts the table as it stands', () => {
    // THE CONTROL, and the reason this rule is not ceremony: an empty set builds
    // an empty dist/templates and exits 0, while `generate.test.ts` loops over
    // this same list — so the suite that should catch it goes to zero tests.
    expect(readyFrameworksProblem(READY)).toBeNull();
  });
});

describe('the missing-starter guard', () => {
  it('rejects a templateDir that names no starter', () => {
    const absent = path.join(STARTERS, 'framework-someone-renamed');

    expectRejected(missingStarterProblem(absent, existsSync), `no starter at ${absent}`);
  });

  it('holds every ready framework against the tree', () => {
    // THE CONTROL and the live check at once: these are the five directories a
    // published `npx create-kai` copies, named by `templateDir` in frameworks.ts.
    for (const framework of READY) {
      expect(
        missingStarterProblem(path.join(STARTERS, framework.templateDir), existsSync),
        `${framework.id}: templateDir must name a real starter`,
      ).toBeNull();
    }
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

/**
 * What the template copy is allowed to carry.
 *
 * The filter this replaces was a flat set of BASENAMES, and the defect was the
 * shape rather than a missing row: `src/routeTree.gen.ts` is a path, so no
 * basename could express it, and it landed in `dist/templates` if and only if a
 * build had run first — `verify:starters` builds the starters before packaging,
 * so CI and a clean checkout produced different template contents.
 */
describe('the template copy filter', () => {
  /** The real thing, so these assertions cannot drift from the starter. */
  const TANSTACK_IGNORE = readFileSync(
    path.join(STARTERS, 'tanstack-start', GITIGNORE_SOURCE_NAME),
    'utf8',
  );

  it('excludes the generated artifacts the basename set could not', () => {
    const skip = templateSkips(TANSTACK_IGNORE);

    // THE SPECIMEN. A path, not a basename — the reason the old filter's shape
    // could not be patched with one more row.
    expect(skip('src/routeTree.gen.ts')).toBe(true);

    // And the four build trees that were missing outright. These are directories,
    // so each one leaking is a whole subtree, not a file. Watched: with the old
    // filter and these planted, the build copied all of them.
    for (const rel of ['.output', '.output/server/index.mjs', '.nitro', '.tanstack', '.vinxi']) {
      expect(skip(rel), rel).toBe(true);
    }

    // Globs and vendored archives, also absent before.
    for (const rel of ['build.log', 'vendor', 'vendor/lib.tgz', '.DS_Store', '.env.local']) {
      expect(skip(rel), rel).toBe(true);
    }
  });

  it('still copies every file the template actually needs', () => {
    const skip = templateSkips(TANSTACK_IGNORE);
    // The control. A filter that returned true for everything would pass the
    // test above having broken the product completely.
    for (const rel of [
      'package.json',
      'src/routes/__root.tsx',
      'src/routes/index.tsx',
      'src/components/Sidebar.tsx',
      'src/styles.css',
      'vite.config.ts',
      '.npmrc',
      GITIGNORE_SOURCE_NAME,
      // `src/router.tsx` sits next to the generated route tree and must survive.
      'src/router.tsx',
    ]) {
      expect(skip(rel), rel).toBe(false);
    }
  });

  it('keeps out the tracked files no .gitignore would name', () => {
    // The floor: a README and a lockfile are COMMITTED, so deriving from
    // .gitignore alone would ship both. A copied lockfile makes `npm ci` refuse
    // the emitted project outright.
    const skip = templateSkips(TANSTACK_IGNORE);
    for (const rel of ['README.md', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']) {
      expect(skip(rel), rel).toBe(true);
    }
  });

  it('reads git’s anchoring rule, not just the name', () => {
    // A pattern WITH a slash is relative to the ignore file; one without matches
    // at any depth. Getting this backwards is how `src/routeTree.gen.ts` would
    // either miss the file or take an unrelated `routeTree.gen.ts` elsewhere.
    const skip = templateSkips('src/routeTree.gen.ts\ndist/\n*.log\n');
    expect(skip('src/routeTree.gen.ts')).toBe(true);
    expect(skip('app/src/routeTree.gen.ts')).toBe(false); // anchored: not this one
    expect(skip('dist')).toBe(true);
    expect(skip('packages/dist')).toBe(true); // no slash in pattern: any depth
    expect(skip('src/nested/debug.log')).toBe(true);

    // A pattern matches a WHOLE segment, never a prefix of one. Watched: with
    // the segment regex relaxed from `^x$` to `^x`, these three go red and
    // everything else in this file stays green — so without them a filter that
    // ate `dist-config.ts` alongside `dist/` would ship unnoticed.
    expect(skip('distances.ts')).toBe(false);
    expect(skip('src/dist-config.ts')).toBe(false);
    expect(skip('src/routeTree.gen.ts.bak')).toBe(false);
  });

  it('ignores comments and blank lines rather than matching them', () => {
    const skip = templateSkips('\n# Auto-generated on first run.\n\n  \nsrc/routeTree.gen.ts\n');
    expect(skip('src/routeTree.gen.ts')).toBe(true);
    // A comment taken as a pattern would match a file named after it, and an
    // empty line taken as a pattern matches EVERYTHING.
    expect(skip('src/App.tsx')).toBe(false);
    expect(skip('package.json')).toBe(false);
  });

  it('every ready starter keeps its own source files', () => {
    // Live over the tree: whatever each starter ignores, its package.json and
    // its declared app file must still travel. VACUITY GUARD on the count.
    const ready = FRAMEWORKS.filter((f) => f.status === 'ready');
    expect(ready.length, 'no ready frameworks — this asserted nothing').toBeGreaterThanOrEqual(7);
    for (const framework of ready) {
      const source = readFileSync(
        path.join(STARTERS, framework.templateDir, GITIGNORE_SOURCE_NAME),
        'utf8',
      );
      const skip = templateSkips(source);
      expect(skip('package.json'), framework.id).toBe(false);
      expect(skip(framework.paths.app), framework.id).toBe(false);
      expect(skip(framework.paths.css), framework.id).toBe(false);
    }
  });

  it('refuses a negation rather than silently dropping a source file', () => {
    // `!keep.ts` means "actually DO track this". A filter that read the `!` as
    // part of a name would drop the file, and the emitted project would be
    // missing a source file with nothing to explain it.
    const problem = templateIgnoreProblem('tanstack-start', 'dist/\n!src/keep.ts\n');
    expect(problem).toContain('negated .gitignore rule');
    expect(problem).toContain('!src/keep.ts');
    // And the control: every real starter passes, so this is not just always-red.
    for (const framework of FRAMEWORKS) {
      const source = readFileSync(
        path.join(STARTERS, framework.templateDir, GITIGNORE_SOURCE_NAME),
        'utf8',
      );
      expect(templateIgnoreProblem(framework.id, source), framework.id).toBeNull();
    }
  });
});

/**
 * Assert the move cannot rot back.
 *
 * `scripts/build.mjs` ends in `main().catch(...)`, so importing it runs a build:
 * anything defined there is unreachable from a test by construction, and a rule
 * nobody can watch fail is a rule nobody should trust. That is not a style
 * preference, it is the property the move bought, and the next person to add a
 * guard will reach for the file that already does the reading.
 *
 * WHY THIS IS A PARSE AND NOT A GREP, which is a correction rather than a
 * polish. It was a regex over line-anchored declarations named
 * `verify|check|assert|guard`, and it had TWO holes — both demonstrated against
 * this tree by planting the shape and watching the suite stay green:
 *
 *   - A rule nested inside a function was invisible, because `^` cannot match an
 *     indented declaration. That hole was disclosed in the note this replaces.
 *   - A rule at the TOP LEVEL was invisible too, if it was named the way every
 *     rule in `src/build-guards.ts` is named. `patchMatchProblem`,
 *     `gitignoreProblem`, `sharedDevDepsProblem`: none of the four prefixes that
 *     regex looked for is the convention this repo actually uses, so the one
 *     name a next author would copy off the neighbours was the one name that
 *     slipped through. That hole was INSIDE the check's stated reach and was not
 *     disclosed — which makes it the worse of the two.
 *
 * AND THE BLIND SPOT WAS NOT EMPTY. The first thing the parse found was two
 * rules still living in `build.mjs`: `no framework is marked ready`, inlined in
 * `main()`, and `no starter at ...`, inlined in `copyTemplate` beside the `cp`
 * it explains — the same function #205 pulled the `.gitignore` rule out of. Both
 * are now in `src/build-guards.ts` with the tests above.
 *
 * So the check asks two questions of the parsed file, because a rule can hide
 * from either one alone:
 *
 *   1. Is there a guard-shaped FUNCTION at any depth? `copyTemplate`, `walk` and
 *      `readTemplateFiles` are filesystem plumbing and belong there. What must
 *      not reappear is a rule.
 *   2. Does the file write a MESSAGE of its own? A rule's payload is its message,
 *      and `build.mjs` throws what a rule returned — so an authored message is a
 *      rule, whatever it is called and even if it is called nothing. That is the
 *      only one of the two that could have seen the anonymous `.gitignore`
 *      requirement #205 had to extract.
 *
 * KNOWN LIMIT, stated at the size it is now rather than papered over: a rule
 * that declares no guard-shaped name AND writes no message of its own is still
 * invisible — one that reuses another rule's text, or one that silently drops
 * something instead of failing. `SKIP` is that shape deliberately: it is a copy
 * filter, not a check, and nothing it does can fail a build.
 */
describe('the seam these rules were moved to have', () => {
  const BUILD_MJS = path.join(PKG_ROOT, 'scripts/build.mjs');

  // `createRequire` rather than `import ts from 'typescript'`: the package is
  // 8MB of CJS, and putting it through vite's transform pipeline costs a second
  // and prints a sourcemap warning on every run. Nothing here needs a program or
  // a type checker — just the syntax tree of one file. The types come from the
  // type-only import at the top, which erases.
  const ts = createRequire(import.meta.url)('typescript') as typeof TSApi;

  /**
   * Every node in `source`, at any depth. Comments are trivia rather than nodes,
   * so nothing built on this can be tripped by prose — which is half of why a
   * parse replaced the regex in a file that explains itself at this length.
   */
  function walkSource(source: string, visit: (node: TSApi.Node) => void): void {
    const file = ts.createSourceFile(
      'build.mjs',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    const step = (node: TSApi.Node): void => {
      visit(node);
      ts.forEachChild(node, step);
    };
    ts.forEachChild(file, step);
  }

  /**
   * Guard-shaped by the two conventions this repo actually uses for a rule: the
   * imperative prefixes, and the `Problem` suffix every rule in
   * `src/build-guards.ts` carries. The prefix needs an uppercase letter after it
   * so that `guards`, the local holding the loaded module, is not a false
   * positive — a plural noun is a handle, not a rule.
   */
  const guardShaped = (name: string) =>
    /^(?:verify|check|assert|guard|ensure|validate)[A-Z_]/.test(name) || /Problems?$/.test(name);

  /**
   * Every named FUNCTION in `source`, at any depth.
   *
   * Functions rather than any binding, on purpose. `const guards = await
   * loadTs(...)` is a module handle and `const { gitignoreProblem } = guards`
   * would be a rule being USED, which is what this file wants build.mjs to do.
   * Neither declares a rule, and flagging them would make the check noise.
   */
  function declaredFunctions(source: string): string[] {
    const names: string[] = [];
    walkSource(source, (node) => {
      if (ts.isFunctionDeclaration(node) && node.name) names.push(node.name.text);
      else if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      ) {
        names.push(node.name.text);
      }
    });
    return names;
  }

  /**
   * The prefix a rule's message carries, read off a real rule rather than
   * restated here — a copy would keep agreeing with itself after the convention
   * moved.
   */
  const RULE_PREFIX = `${gitignoreProblem('probe', () => false)!.split(':')[0]}:`;

  /**
   * Every message `source` writes ITSELF, by either of the two routes a rule
   * inlined here would take.
   *
   * Comments are not literals, so the prose in `build.mjs` — which quotes rule
   * names and explains why they left — cannot trip this. That is the other half
   * of why a parse replaced the regex.
   */
  function authoredRuleText(source: string): string[] {
    const found = new Set<string>();
    const literal = (node: TSApi.Node): string | null => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
      if (ts.isTemplateExpression(node)) {
        return node.head.text + node.templateSpans.map((s) => s.literal.text).join('');
      }
      return null;
    };
    walkSource(source, (node) => {
      // (a) A message this file THROWS. `failIf` throws an identifier — the thing
      //     a rule returned. A rule inlined here throws its own words instead.
      if (ts.isThrowStatement(node) && node.expression && ts.isNewExpression(node.expression)) {
        for (const argument of node.expression.arguments ?? []) {
          const text = literal(argument);
          if (text !== null) found.add(text);
        }
      }
      // (b) Rule payload text anywhere, thrown or not: `failIf(cond ? '...' :
      //     null)` states a rule without ever throwing.
      const text = literal(node);
      if (text !== null && text.startsWith(RULE_PREFIX)) found.add(text);
    });
    return [...found];
  }

  it('has no guard-shaped function left in build.mjs, at any depth', () => {
    const declarations = declaredFunctions(readFileSync(BUILD_MJS, 'utf8')).filter(guardShaped);

    expect(
      declarations,
      'A guard in build.mjs can only be exercised by running the whole build, so it can never ' +
        'be watched failing. Move the rule into src/build-guards.ts as a function over data and ' +
        'test it there; leave build.mjs the reading of files.',
    ).toEqual([]);
  });

  it('states no rule of its own: build.mjs throws what a rule returned', () => {
    const authored = authoredRuleText(readFileSync(BUILD_MJS, 'utf8'));

    expect(
      authored,
      'build.mjs wrote this message, so the rule behind it lives in build.mjs — reachable only ' +
        'by running the whole build. A rule returns its message from src/build-guards.ts and ' +
        '`failIf` throws it; the payload is the thing a test most needs to assert.',
    ).toEqual([]);
  });

  it('sees the shapes the regex it replaced could not', () => {
    // THE CONTROL FOR THE CHECK ITSELF. Both collectors above return [] against
    // build.mjs today, and [] is exactly what a broken walker returns too. So
    // plant every shape that has actually hidden here and watch them come back.
    const planted = [
      'async function copyTemplate(templateDir) {',
      '  function checkGitignore(dir) {',
      "    if (!exists(dir)) throw new Error('create-kai build: no .gitignore');",
      '  }',
      '  checkGitignore(templateDir);',
      '}',
      'function readyFrameworksProblem(ready) { return ready.length ? null : MESSAGE; }',
      "if (!ok) throw new Error(`create-kai build: no starter at ${from}`);",
    ].join('\n');

    // Nested (indentation beat the old `^`) and top-level-but-conventionally-named
    // (no prefix the old regex knew) — the two holes, in one snippet.
    expect(declaredFunctions(planted).filter(guardShaped)).toEqual([
      'checkGitignore',
      'readyFrameworksProblem',
    ]);
    // And the anonymous throw, which no name-based check can ever see. This is
    // the shape the `.gitignore` requirement had while it lived in copyTemplate.
    expect(authoredRuleText(planted)).toEqual([
      'create-kai build: no .gitignore',
      'create-kai build: no starter at ',
    ]);
  });

  it('does not flag build.mjs for USING a rule, or for its prose', () => {
    // The other way this check could be wrong: over-broad, so the next author
    // works around it instead of with it.
    const legitimate = [
      '/** copyTemplate once held checkGitignore, which threw create-kai build: ... */',
      "const guards = await loadTs('src/build-guards.ts');",
      'const { gitignoreProblem } = guards;',
      'failIf(gitignoreProblem(dir, exists));',
      'function failIf(problem) { if (problem !== null) throw new Error(problem); }',
    ].join('\n');

    expect(declaredFunctions(legitimate).filter(guardShaped)).toEqual([]);
    expect(authoredRuleText(legitimate)).toEqual([]);
  });
});
