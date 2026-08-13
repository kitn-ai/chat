/**
 * The structural rules `scripts/build.mjs` enforces, as functions a test can
 * call.
 *
 * WHY THIS IS `src/` AND NOT `scripts/build.mjs`, where these lived. Same reason
 * `src/template-guards.ts` exists, and this is the other half of that move.
 * `build.mjs` ends in `main().catch(...)`, so importing it RUNS the build — no
 * test imports it and none can. Every rule inside it was therefore reachable
 * only by running the whole build and reading stderr, which is how a guard once
 * shipped unable to match the one string it was pointed at. The repo's rule is
 * that a check is worth nothing until it has been watched failing; a check with
 * no seam to grab cannot be watched at all.
 *
 * `template-guards.ts` holds the CONTENT rules — what an emitted file is allowed
 * to say. These are the STRUCTURAL ones: does a patch still match, is the app
 * where the table claims, do the declared paths exist, do the shared dependency
 * ranges agree. Two files because the two answer different questions and fail
 * for different reasons, not because one grew too long.
 *
 * WHY EACH RULE RETURNS A MESSAGE INSTEAD OF THROWING. The message is the
 * guard's payload — it names the file, states why the rule exists and tells you
 * which table to edit — so it is the thing a test most needs to assert. Throwing
 * would put that text back where only a build run can see it, which is the
 * defect this module removes. `build.mjs` throws what these return, so the
 * output of a failing build is byte-identical to before.
 *
 * WHY THE FILESYSTEM ARRIVES AS AN ARGUMENT. A rule that can only run against a
 * real template tree is the problem, not the fix: it drags a template copy and a
 * bundle step into any test that wants to watch it fail. So the reads are the
 * caller's job — `build.mjs` passes a reader over the copied template, a test
 * passes one over a literal — and the rules stay pure functions over data.
 */
import type { FrameworkDef } from './frameworks';
import { applyPatch, countMatches } from './patches';
import type { Patch } from './patches';
import { PROBE_NAME, repoInternalProblems, titleProblems } from './template-guards';
import type { GuardProblem } from './template-guards';

/**
 * Read one file out of a copied template, by its path relative to the template
 * root. `null` means the template does not have that file — the distinction
 * several of these rules exist to report.
 */
export type TemplateReader = (relativePath: string) => string | null;

/**
 * Every patch matches its file, and matches it the number of times it claims to.
 *
 * Zero matches is fatal for every patch, opted-in or not. More than one is fatal
 * only WITHOUT `multiple`, which is the entirety of the opt-in; why that hole is
 * the right shape lives on the flag in src/patches.ts rather than being
 * half-stated in both places.
 */
export function patchMatchProblem(
  templateDir: string,
  patches: readonly Patch[],
  read: TemplateReader,
): string | null {
  for (const patch of patches) {
    const source = read(patch.file);
    if (source === null) {
      return (
        `create-kai build: patch targets ${patch.file}, which template '${templateDir}' does not have`
      );
    }
    const count = countMatches(patch, source);
    if (count === 0) {
      return (
        `create-kai build: patch for ${templateDir}/${patch.file} no longer matches.\n` +
        `  why it exists: ${patch.why}\n` +
        (patch.multiple
          ? '  it is a `multiple` patch, so this is a rename that would now rename nothing\n'
          : '') +
        '  the starter changed — update PATCHES in src/patches.ts'
      );
    }
    if (count > 1 && !patch.multiple) {
      return (
        `create-kai build: patch for ${templateDir}/${patch.file} matches ${count} times; ` +
        'it must be unambiguous.\n' +
        '  A non-global replace rewrites only the first, so the rest would ship unpatched.\n' +
        '  Narrow the `find`, or set `multiple: true` if every occurrence should change.'
      );
    }
  }
  return null;
}

/**
 * Apply this template's patches in memory and check what survives them.
 *
 * The patches go through the CLI's own `applyPatch` rather than a
 * reimplementation of it. This function used to rebuild the regex by hand, which
 * meant it could not see a `multiple` patch: it would check a half-patched file
 * no user would ever receive, and report on bytes that do not exist.
 *
 * Two families of rule run over the result, kept apart because their fixes
 * differ — a repo-internal instruction wants a new patch, a wrong title wants
 * that patch to name the project. Both live in `src/template-guards.ts`.
 *
 * THROWS, rather than returning, when a patch does not match at all: that is
 * `applyPatch`'s own error, and `build.mjs` runs `patchMatchProblem` first
 * precisely so the specific "this patch went stale" message wins the race.
 *
 * `files` is every file in the template as `[path relative to the root,
 * contents]`. Reading them is the caller's job; deciding which ones can carry an
 * instruction is this rule's.
 */
export function emittedContentProblem(
  templateDir: string,
  patches: readonly Patch[],
  files: Iterable<readonly [string, string]>,
): string | null {
  const internals: GuardProblem[] = [];
  const titles: GuardProblem[] = [];

  for (const [rel, contents] of files) {
    if (contents.includes('\u0000')) continue; // binary; nothing to instruct a user with

    let source = contents;
    for (const patch of patches) {
      // PROBE_NAME, not a plausible stand-in: the title rule asserts a patched
      // title EQUALS it, which only proves anything if the string could not have
      // arrived by any route other than this substitution.
      if (patch.file === rel) source = applyPatch(patch, source, PROBE_NAME);
    }

    internals.push(...repoInternalProblems(rel, source));
    titles.push(...titleProblems(rel, source, PROBE_NAME));
  }

  const render = (problems: GuardProblem[]) =>
    problems.map((p) => `  · ${templateDir}/${p.file}: ${p.detail}\n      ${p.why}`).join('\n');

  if (internals.length > 0) {
    return (
      `create-kai build: template '${templateDir}' would ship repo-internal instructions ` +
      `to a user.\nAdd a patch in src/patches.ts for each of these:\n${render(internals)}`
    );
  }
  if (titles.length > 0) {
    return (
      `create-kai build: template '${templateDir}' would ship a browser tab that does not name ` +
      `the user's project.\n${render(titles)}`
    );
  }
  return null;
}

/**
 * Assert the template's app file is where `paths.app` says and carries the
 * expression the emitted README quotes.
 *
 * `paths.app` is written into `kai.json` for a v2 `add` to read, and the README
 * tells the user "one expression in <paths.app> changes" — so a wrong path is
 * two lies at once, and nothing else in the build would notice, because the path
 * is never opened at build time. Vue's is `src/App.vue` where React's is
 * `src/App.tsx`, which is exactly the kind of per-framework value that gets
 * copied from the row above.
 *
 * `goLive` is `generate.ts`'s `goLiveThread`, PASSED IN rather than imported:
 * `generate.ts` pulls in the catalog, which reaches into the kit's source, and
 * `build.mjs` bundles this module through `loadTs()` to run it. Injecting keeps
 * that bundle to the two standalone tables it actually needs. It throws its own
 * explanation when the expression is missing, so this returns only the
 * wrong-path message — see `frameworks.ts` on Solid for why that throw is the
 * guard working rather than a bug in it.
 */
export function appPathProblem(
  framework: FrameworkDef,
  read: TemplateReader,
  goLive: (appSource: string, framework: FrameworkDef) => string,
): string | null {
  const source = read(framework.paths.app);
  if (source === null) {
    return (
      `create-kai build: framework '${framework.id}' declares paths.app='${framework.paths.app}', ` +
      `which template '${framework.templateDir}' does not have.\n` +
      '  kai.json records that path and the emitted README points the user at it.'
    );
  }
  // Throws with its own explanation if the go-live expression is missing.
  goLive(source, framework);
  return null;
}

/**
 * Assert every OTHER path the framework declares exists in its template too.
 *
 * `appPathProblem` covers `paths.app` because the README quotes it. The rest of
 * the block is written verbatim into the emitted `kai.json`, where a v2 `add`
 * reads it to decide where to put a generated component or which stylesheet to
 * append an `@import` to — so a wrong entry here is a v2 command that writes to
 * a file that is not there, reported against the user's project rather than
 * against this table.
 *
 * Nothing else in the build opens these. They are strings that get copied down
 * from the row above and then diverge silently: `solid` declared
 * `css: 'src/index.css'` while its starter's stylesheet has always been
 * `src/styles.css`, and it was wrong for as long as the row had existed
 * because a `planned` framework is never checked against its template at all.
 *
 * `env` is exempt — `.env.local` is the file the user is told to CREATE for a
 * keyed gateway, so a template carrying one would be the bug.
 */
export function declaredPathsProblem(
  framework: FrameworkDef,
  exists: (relativePath: string) => boolean,
): string | null {
  const missing = Object.entries(framework.paths)
    .filter(([key]) => key !== 'env' && key !== 'app')
    .filter(([, rel]) => !exists(rel))
    .map(([key, rel]) => `  · paths.${key} = '${rel}'`);

  if (missing.length === 0) return null;
  return (
    `create-kai build: framework '${framework.id}' declares paths that template ` +
    `'${framework.templateDir}' does not have:\n${missing.join('\n')}\n` +
    '  These are copied verbatim into the emitted kai.json for a v2 `add` to read.'
  );
}

/** Only the fields these rules read. Both real manifests have far more. */
export interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Refuse to build if this package's shared devDependency ranges disagree with
 * the kit's.
 *
 * `.npmrc` sets `node-linker=hoisted`, so ONE version of each package wins for
 * the whole workspace. Declaring `@types/node: ^22` here — copied thoughtlessly
 * out of a starter's package.json — silently downgraded the hoisted
 * `@types/node` from 26 to 22 for `packages/ui` too, and its emitted-code suite
 * started timing out. Nothing in that failure pointed back here.
 *
 * So the ranges are checked rather than commented. Anything both packages
 * declare has to agree.
 */
export function sharedDevDepsProblem(mine: Manifest, kit: Manifest): string | null {
  const kitDev = { ...kit.dependencies, ...kit.devDependencies };
  const clashes: string[] = [];
  for (const [name, range] of Object.entries(mine.devDependencies ?? {})) {
    if (kitDev[name] && kitDev[name] !== range) {
      clashes.push(`  · ${name}: create-kai wants ${range}, packages/ui wants ${kitDev[name]}`);
    }
  }
  if (clashes.length === 0) return null;
  return (
    'create-kai build: devDependency ranges disagree with packages/ui.\n' +
    'node-linker=hoisted means one version wins for the whole workspace, so a\n' +
    'mismatch here changes what the KIT compiles against.\n' +
    clashes.join('\n')
  );
}
