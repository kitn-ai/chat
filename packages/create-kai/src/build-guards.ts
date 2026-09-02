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
 * to say. These are the STRUCTURAL ones: is there anything to build, is there a
 * starter behind the row, does a patch still match, is the app where the table
 * claims, do the declared paths exist, do the shared dependency ranges agree.
 * Two files because the two answer different questions and fail for different
 * reasons, not because one grew too long.
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
import type { Matchable, Patch } from './patches';
import { GITIGNORE_SOURCE_NAME } from './template-dotfiles';
import { PROBE_NAME, repoInternalProblems, titleProblems } from './template-guards';
import type { GuardProblem } from './template-guards';

/**
 * Read one file out of a copied template, by its path relative to the template
 * root. `null` means the template does not have that file — the distinction
 * several of these rules exist to report.
 */
export type TemplateReader = (relativePath: string) => string | null;

/**
 * What this rule needs of a patch, which is less than either patch table is.
 *
 * Typed structurally so `PATCHES` and `GATEWAY_PATCHES` are graded by the SAME
 * function. They differ only in what their `replace` takes, which is nothing
 * this rule looks at — and a second near-identical copy of the checks below is
 * how one table ends up with a fix the other does not.
 */
export type CheckablePatch = Matchable & { file: string; why: string };

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
  patches: readonly CheckablePatch[],
  read: TemplateReader,
  /**
   * Which table to send the reader to. Two tables go through this rule now, and
   * a message naming the wrong one sends someone to a file where the string they
   * are hunting does not appear — measured, not hypothetical: the first run of
   * this guard against a broken gateway patch said "update PATCHES".
   */
  tableName = 'PATCHES',
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
        `  the starter changed — update ${tableName} in src/patches.ts`
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

/**
 * The emitted route file declares everything the kit said that fragment needs.
 *
 * WHAT THIS STILL CATCHES NOW THAT THE PREAMBLE IS EXPORTED, because the earlier
 * version of this rule no longer has a job. It used to compare the fragment
 * against a HAND-COPIED preamble in this package, and its purpose was to notice
 * when that copy drifted from the kit's private original. The copy is gone;
 * `chatRoutePreamble` is one function with one answer, so "does this package's
 * preamble match the kit's" is not a question that can be wrong any more, and a
 * guard over it would be machinery over nothing.
 *
 * What CAN still be wrong is one step later: `emitRoute` assembles a file, and
 * it is the assembly — not the kit — that decides whether those declarations
 * actually reach the page. So this now grades the EMITTED TEXT. Drop the
 * `preamble.decl` spread out of `emitRoute`, reorder it below the handler in a
 * way the type alias cannot survive, or add a host whose `before` lines shadow
 * it, and every one of those ships a route that does not compile while the kit's
 * own tests stay green — because the kit never sees this file.
 *
 * WHAT IT DELIBERATELY DOES NOT COVER: whether the kit's answer was complete.
 * `chatRoutePreamble` tests for a CALL, so a fragment that only ANNOTATES with
 * `WirePart` and never calls a helper would be told it needs nothing. That gap
 * is the kit's, it is documented at that function, and `scaffold.test.ts` grades
 * it. Re-checking it here would be a second copy of someone else's check — the
 * exact thing this rule was just rewritten to stop doing.
 */
export function routeSymbolsProblem(
  gatewayId: string,
  webRoute: string | undefined,
  emitted: string,
  required: readonly string[],
): string | null {
  if (webRoute === undefined) {
    return (
      `create-kai build: gateway '${gatewayId}' is wired but its integration declares no webRoute.\n` +
      '  A keyed gateway needs a server route, and there is no portable handler to emit.\n' +
      '  Remove it from WIRED_GATEWAYS in src/catalog.ts, or give the integration a webRoute.'
    );
  }

  if (required.length === 0) {
    return (
      `create-kai build: the kit's chatRoutePreamble says gateway '${gatewayId}'s route needs no ` +
      'declarations.\n' +
      '  Every webRoute in the catalog narrows its body through readChatRequest, so a preamble with\n' +
      '  nothing in it means the contract moved. Re-read chatRoutePreamble in\n' +
      '  mcp/route-emit.ts before trusting this emit.'
    );
  }

  // Declared, not merely mentioned: the fragment itself CALLS these names, so a
  // substring test would pass on a file that dropped the declarations entirely.
  const declared = (symbol: string) =>
    new RegExp(`(?:^|\\n)(?:export\\s+)?(?:async\\s+)?(?:function|type|interface|const|class)\\s+${symbol}\\b`).test(
      emitted,
    );

  const missing = required.filter((symbol) => !declared(symbol));
  if (missing.length > 0) {
    return (
      `create-kai build: the emitted route for '${gatewayId}' does not declare ${missing.join(', ')}, ` +
      "which the kit's chatRoutePreamble says that handler needs.\n" +
      '  The fragment CALLS those names, so this route will not compile in a user\'s project.\n' +
      '  emitRoute in src/routes.ts is dropping or misplacing the preamble it was handed.'
    );
  }

  return null;
}

/**
 * What the BROWSER receives, which is not what `streamFormat` describes.
 *
 * THE FAILURE THIS EXISTS FOR IS SILENT, and the kit's own catalog says so in as
 * many words: feeding a non-OpenAI SSE dialect to `readOpenAIStream` "does not
 * throw — it parses to nothing and the turn ends silently empty". So a gateway
 * wired without checking this emits a project that installs, builds, typechecks,
 * passes the smoke test, and answers every message with an empty bubble. There
 * is no other check in this package or the kit that would notice.
 *
 * IT CANNOT BE DERIVED FROM `streamFormat`, which is the trap. That field
 * describes what the PROVIDER emits, not what the route hands the browser, and
 * the two differ for the most important case: `anthropic` is `streamFormat:
 * 'native'` and is nonetheless correct here, because its route re-frames every
 * frame to OpenAI form (`reframeToOpenAISse`) before returning it. Gating on
 * `streamFormat === 'openai-sse'` would have refused a gateway that works and
 * accepted `vercel-ai-sdk`, whose route returns an AI-SDK stream that
 * `readOpenAIStream` cannot read.
 *
 * So it is a DECLARATION rather than a derivation, and it belongs to this
 * package rather than the kit: it is a fact about the reader the go-live patch
 * emits, and the go-live patch is ours. `GATEWAY_PATCHES` writes
 * `readOpenAIStream`, so a gateway may be wired only if its route delivers
 * OpenAI-format SSE. Wiring one forces someone to answer the question.
 */
export function routeWireProblem(
  gatewayId: string,
  browserWire: Readonly<Record<string, string>>,
  readerFormat: string,
): string | null {
  const declared = browserWire[gatewayId];
  if (declared === undefined) {
    return (
      `create-kai build: gateway '${gatewayId}' is wired but BROWSER_WIRE in src/catalog.ts does not ` +
      'say what its route hands the browser.\n' +
      `  The emitted front end reads the response with a ${readerFormat} parser, and a mismatch is\n` +
      '  SILENT — the stream parses to nothing and every turn ends as an empty bubble.\n' +
      "  Do not copy the integration's `streamFormat`: that describes the PROVIDER. anthropic is\n" +
      "  'native' and still correct here because its route re-frames to OpenAI form. Read the route."
    );
  }
  if (declared !== readerFormat) {
    return (
      `create-kai build: gateway '${gatewayId}'s route hands the browser '${declared}', but the ` +
      `emitted front end reads '${readerFormat}'.\n` +
      '  readOpenAIStream does not throw on a dialect it cannot read — it yields nothing, and the\n' +
      '  turn ends silently empty.\n' +
      '  Either the route must re-frame, or the go-live patch needs a reader axis before this\n' +
      '  gateway can be wired.'
    );
  }
  return null;
}

/**
 * Refuse to build when the framework table marks nothing `ready`.
 *
 * `status: 'ready'` is what decides which starters get copied, so an empty set
 * builds a CLI with an EMPTY `dist/templates` and exits 0. The reason that is
 * worth a rule is that most of what would catch it reads the same table:
 * `test/generate.test.ts` loops `FRAMEWORKS.filter(status === 'ready')` to
 * generate and grade a project per framework, and a zero-length list makes those
 * `describe`s VANISH rather than fail.
 *
 * Two things do notice, and neither names the cause: `kit-contract`'s "templates
 * import nothing from @kitn.ai/ui" assertion, and `verify:pack`'s "no
 * dist/templates/** in the tarball". Both report a symptom several steps from
 * the row somebody flipped to `planned`.
 *
 * It was written inline in `main()` — no name, no seam, and invisible to the
 * anti-rot check in `test/build-guards.test.ts` twice over: nested, and unnamed.
 */
export function readyFrameworksProblem(ready: readonly FrameworkDef[]): string | null {
  if (ready.length > 0) return null;
  return 'create-kai build: no framework is marked ready';
}

/**
 * Refuse to build a `ready` framework whose `templateDir` names no starter.
 *
 * HONEST ABOUT ITS OWN WEIGHT, because the repo's rule is that a check which
 * overstates its reach is worse than none: without this the build still fails.
 * `cp` throws ENOENT on a source that is not there. What the rule buys is the
 * message — `templateDir` is a string in `frameworks.ts`, and an ENOENT on an
 * absolute path under `examples/starters/` does not say that a table is wrong.
 * It is the claim `declaredPathsProblem` makes about the rest of the block, one
 * level up: the paths in that table are never opened until something opens them.
 *
 * It lived inside `copyTemplate`, beside the `cp` it explains. That is the shape
 * #205 pulled the `.gitignore` rule out of; this one stayed because the anti-rot
 * check read top-level names and could not see either.
 *
 * Takes the absolute path rather than building it, for the same reason the rest
 * of this module takes a reader: joining paths is the caller's filesystem job.
 */
export function missingStarterProblem(
  starterPath: string,
  exists: (absolutePath: string) => boolean,
): string | null {
  if (exists(starterPath)) return null;
  return `create-kai build: no starter at ${starterPath}`;
}

/**
 * The name a starter carries its ignore file under.
 *
 * Re-exported rather than declared: it is one row of `STRIPPED_DOTFILES`
 * (src/template-dotfiles.ts), the list `build.mjs` renames on the way into a
 * template and `generate()` renames back on the way out. It keeps a name of its
 * own because `gitignoreProblem` below asserts something the list does not — that
 * a starter HAS this file, where the rest of the list is optional per starter.
 *
 * That leaf module has no imports, which is what lets both ends of the rename
 * share it: this one is bundled by `build.mjs` through `loadTs()`, `generate.ts`
 * is bundled into the CLI, and importing either from the other would drag the
 * catalog or the TypeScript-parsing guards along — the same reason
 * `appPathProblem` takes `goLiveThread` as an argument instead of importing it.
 */
export { GITIGNORE_SOURCE_NAME };

/**
 * Never copied into a template, whatever the starter's `.gitignore` says.
 *
 * These are TRACKED files that still must not travel, so the derived half below
 * cannot cover them. The README because `generate()` writes the emitted project
 * its own, and lockfiles because A LOCKFILE IS STALE THE MOMENT IT IS COPIED:
 * the emitted project's dependency set is not the starter's — `rewritePackageJson`
 * replaces the `@kitn.ai/ui` spec and adds the chosen gateway's deps — so a
 * copied lock still pins the old one. `npm ci` then refuses the
 * package.json/lock mismatch outright and `npm install` resolves the kit from a
 * path that climbed out of the user's project. create-vite ships no lockfile for
 * the same reason: the first `npm install` is what should write it.
 */
export const TEMPLATE_SKIP_FLOOR: readonly string[] = [
  'README.md',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
];

/**
 * Refuse a `.gitignore` this filter would silently mis-read.
 *
 * Only negations, and only because getting one wrong fails in the DANGEROUS
 * direction: `!keep.ts` means "actually do track this", so a filter that ignored
 * the `!` would drop a file the template needs and the emitted project would be
 * missing a source file with nothing to explain it. No starter has one; if one
 * ever does, this asks for a decision rather than guessing.
 */
export function templateIgnoreProblem(templateDir: string, gitignore: string): string | null {
  const negations = gitignore
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('!'));
  if (negations.length === 0) return null;
  return (
    `create-kai build: starter '${templateDir}' has a negated .gitignore rule, which the ` +
    `template copy filter does not implement:\n${negations.map((n) => `  · ${n}`).join('\n')}\n` +
    '  A negation re-includes a file, so ignoring it here would DROP a source file from the\n' +
    '  emitted project. Implement it in templateSkips (src/build-guards.ts) or drop the rule.'
  );
}

/** One `.gitignore` pattern, as a predicate over a path relative to the starter root. */
function patternMatcher(raw: string): ((relativePath: string) => boolean) | null {
  let pattern = raw.trim();
  if (pattern === '' || pattern.startsWith('#')) return null;
  // A trailing slash means "directory". The filter sees directories too, and
  // refusing one prunes its whole subtree, so the marker carries no extra work.
  if (pattern.endsWith('/')) pattern = pattern.slice(0, -1);
  // A LEADING slash anchors to the root and is not itself a path separator, so
  // it is stripped before deciding whether this pattern is anchored.
  const rooted = pattern.startsWith('/');
  if (rooted) pattern = pattern.slice(1);
  if (pattern === '') return null;

  // `*` is the only wildcard these starters use, and it does not cross a `/`.
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*');

  // git's rule: a pattern containing a slash is relative to the ignore file;
  // one without matches at ANY depth. `src/routeTree.gen.ts` is the first kind,
  // `.DS_Store` and `*.log` the second.
  if (rooted || pattern.includes('/')) {
    const re = new RegExp(`^${source}(?:/|$)`);
    return (relativePath) => re.test(relativePath);
  }
  const re = new RegExp(`^${source}$`);
  return (relativePath) => relativePath.split('/').some((segment) => re.test(segment));
}

/**
 * What `scripts/build.mjs` must not copy out of a starter, DERIVED from the
 * starter's own `.gitignore` rather than restated as a list of basenames.
 *
 * THE LIST WAS THE BUG. It was a flat set of basenames, and it could not express
 * either half of what it was for. `src/routeTree.gen.ts` — generated by the
 * TanStack Router plugin on first run — was not in it, so whether that file
 * landed in `dist/templates` depended on whether a build had run first:
 * `verify:starters` builds the starters before packaging, so CI and a clean
 * checkout produced DIFFERENT template contents. Four more of the same class
 * were missing outright (`.output/`, `.nitro/`, `.tanstack/`, `.vinxi/`), and
 * those are build trees, not one file.
 *
 * A starter already declares exactly this, in the one file whose job it is.
 * `.gitignore` is required to exist (`gitignoreProblem`), it is maintained by
 * whoever adds the tool that generates the artifact, and it moves when the
 * starter's toolchain does — so the next generated artifact is skipped without
 * anybody remembering this function exists. Every tracked file in all eight
 * starters survives its own ignore rules today, checked with
 * `git ls-files | git check-ignore --stdin`, so nothing a template needs is
 * reachable from here.
 *
 * "Do not commit this" and "do not ship this in a template" are not the same
 * question in general; they coincide for everything a starter actually ignores,
 * which is build output, generated sources and `.env` files. The one place they
 * diverge is tracked-but-unwanted files, and that is what `TEMPLATE_SKIP_FLOOR`
 * is for.
 */
export function templateSkips(gitignore: string): (relativePath: string) => boolean {
  const matchers = gitignore.split('\n').map(patternMatcher).filter((m) => m !== null);
  const floor = new Set(TEMPLATE_SKIP_FLOOR);
  return (relativePath) => {
    if (relativePath === '') return false; // the template root itself
    // Separators normalized here so this stays a pure function over strings and
    // its test does not have to care which OS it runs on.
    const normalized = relativePath.split('\\').join('/');
    if (normalized.split('/').some((segment) => floor.has(segment))) return true;
    return matchers.some((match) => match(normalized));
  };
}

/**
 * Refuse to build a template whose starter has no `.gitignore`.
 *
 * NOT COSMETIC, and the one guard here whose absence is a security bug rather
 * than a broken scaffold. Without it the emitted project ignores nothing, so
 * `node_modules/` is untracked-but-not-ignored and — for a keyed gateway —
 * so is `.env.local`. A scaffold whose first `git add .` stages the user's API
 * key is the worst version of this, and the user never sees a warning: the
 * missing file is the failure.
 *
 * This rule was written inside `copyTemplate` in `scripts/build.mjs`, a function
 * whose other job is `cp`. That is the shape the rest of this module exists to
 * undo — a rule reachable only by running the whole build is a rule nobody has
 * watched fail, and the anti-rot check in `test/build-guards.test.ts` reads
 * top-level names, so it could not see this one at all. Out here it is a
 * predicate over a filename, and the test drives it directly.
 *
 * Checked BEFORE the rename, on the name the starter uses. Afterwards the file
 * is `_gitignore` and the question no longer has the same answer.
 *
 * The message is byte-identical to the one this threw inside `copyTemplate`; the
 * reasoning above is a comment rather than payload because that is where it was.
 */
export function gitignoreProblem(
  templateDir: string,
  exists: (relativePath: string) => boolean,
): string | null {
  if (exists(GITIGNORE_SOURCE_NAME)) return null;
  return `create-kai build: starter '${templateDir}' has no ${GITIGNORE_SOURCE_NAME} — an emitted project needs one`;
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

/**
 * What the CLI bundle is allowed to REACH.
 *
 * THE FAILURE THIS EXISTS FOR HAS ALREADY HAPPENED, and it was invisible at
 * every seam that was being watched. One import — three symbols out of
 * `mcp/mcp/tools/scaffold.ts` — took `dist/index.js` from 203 kB to
 * 904 kB, of which 505 kB was zod this CLI never executes, and pushed `npx` cold
 * start from 30 ms to 45 ms. Nothing failed. Every test passed, the emitted
 * output was byte-identical, and the build printed the new size as a fact rather
 * than a problem. The only reason it was caught is that somebody read the
 * number.
 *
 * The cause is not zod and not a size: it is that `tools/scaffold.ts` builds its
 * MCP input schema at MODULE SCOPE, and a module-scope side effect is not
 * tree-shakeable, so asking esbuild for one symbol out of that file obliges it
 * to keep all 5,300 lines and everything they import. That is a property of the
 * MODULE, not of what you took from it — which is why this rule is about the
 * import graph and not about a byte ceiling. A ceiling would have to be raised
 * every time the templates grow, and raising it is exactly the moment nobody
 * looks.
 *
 * So two things are banned, and the second is the real one:
 *
 *   · `zod` — the 505 kB. Named directly because it is the cost, and because a
 *     future route into it that does not pass through `mcp/` would still be a
 *     bug this CLI should not pay for.
 *   · anything under `mcp/mcp/` — the CAUSE. `create-kai` is not the
 *     `kai` MCP; the reuse boundary `src/catalog.ts` describes is the catalog,
 *     and the three modules that serve it (`registry.ts`, `types.ts`,
 *     `route-emit.ts`) all sit at the root of `mcp/`. This half fires
 *     even in the case where the offending module happens to shake clean today,
 *     which is the version of this bug that comes back.
 *
 * ONE KNOWN FUTURE COLLISION, stated so it is not a surprise: `renderSurface`
 * lives in `tools/scaffold.ts`, and `generate()` will need it the day the
 * `generated` surface path is wired (it throws today rather than emit an unrun
 * surface). This rule WILL refuse that import, and refusing is the right answer
 * — the fix is to move `renderSurface` to a leaf the same way these three moved,
 * not to add an exception here. An exception is how the 700 kB comes back.
 *
 * Takes the esbuild METAFILE's input keys rather than the output text: that is
 * the real module graph, so a grep-proof rename or a comment mentioning zod
 * cannot move it in either direction.
 */
export function bundleGraphProblem(inputs: readonly string[]): string | null {
  const normalized = inputs.map((input) => input.replaceAll('\\', '/'));
  const banned: { what: RegExp; why: string }[] = [
    {
      what: /(?:^|\/)node_modules\/zod\//,
      why: 'zod — 505 kB the CLI never executes, on every `npx create-kai`',
    },
    {
      what: /(?:^|\/)mcp\/mcp\//,
      why: "the kai MCP's own modules — they build zod schemas at module scope, which esbuild cannot shake past",
    },
  ];

  const hits = banned
    .map((rule) => ({ ...rule, files: normalized.filter((input) => rule.what.test(input)) }))
    .filter((rule) => rule.files.length > 0);
  if (hits.length === 0) return null;

  return (
    'create-kai build: the CLI bundle reaches modules it must not.\n' +
    hits
      .map(
        (hit) =>
          `  · ${hit.why}\n` +
          hit.files
            .slice(0, 5)
            .map((file) => `      ${file}`)
            .join('\n') +
          (hit.files.length > 5 ? `\n      … and ${hit.files.length - 5} more` : ''),
      )
      .join('\n') +
    '\n  The CLI is one bundled zero-dependency file so `npx` cold start is fast, and\n' +
    '  every user downloads all of it. Read what you need from the LEAF modules at the\n' +
    '  root of mcp/ — registry.ts, types.ts, route-emit.ts. If the fact you\n' +
    '  need only exists inside mcp/, move it to a leaf rather than importing the tool.'
  );
}
