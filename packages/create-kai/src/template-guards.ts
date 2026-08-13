/**
 * What a template is allowed to still contain AFTER its patches have run.
 *
 * `verifyPatches` in `scripts/build.mjs` proves the patches you WROTE still
 * match. It says nothing about the patches you did not write, so a framework
 * flipped to `ready` with an empty patch list passes it vacuously. These rules
 * check the OUTPUT instead — the bytes an emitted project would actually carry —
 * which is the only version that a new framework cannot walk past.
 *
 * WHY THIS IS `src/` AND NOT `scripts/build.mjs`, where it lived. Because it was
 * unreachable from a test there: `build.mjs` runs `main()` on import, so the
 * only way to exercise a rule was to run the whole build and read the failure.
 * That is how the title rule below shipped unable to see the string it was
 * pointed at — nothing could assert it against a title without also copying
 * templates and bundling a CLI. The build already loads `src/frameworks.ts`,
 * `src/patches.ts` and `src/generate.ts` through `loadTs()` rather than
 * restating them; this is the same move for the same reason, and it puts the
 * rules where `test/template-guards.test.ts` can watch each one fail.
 */

/**
 * The project name the build substitutes when it checks a template.
 *
 * DELIBERATELY NOT a plausible name. `verifyTitles` asserts a patched title is
 * EXACTLY this string, and that assertion only means something if the string
 * could not have arrived any other way. With a name like `my-app` a starter that
 * happened to hard-code `<title>my-app</title>` would satisfy the rule without a
 * patch having run at all — the check would pass by coincidence, which is the
 * thing it exists to rule out.
 */
export const PROBE_NAME = 'create-kai-probe-app';

export interface GuardProblem {
  /** path relative to the template root */
  file: string;
  /** what is wrong, one line */
  detail: string;
  /** why it matters, printed under the detail */
  why: string;
}

/**
 * Instructions that make sense inside this monorepo and are unfollowable in a
 * user's project.
 *
 * Checking the OUTPUT rather than the patch list is what makes it a real gate:
 * a new framework cannot go `ready` without either patching these out or
 * explaining itself here. Vue is the case in point — the build printed
 * `2 patches verified`, both of them React's, and emitted a Vue project whose
 * browser tab read "@kitn.ai/ui Vue example" and whose vite.config told the user
 * to run `nx build ui`. Every remaining starter carried the same two lines, so
 * the same silent pass was waiting for svelte, angular and html.
 */
export const REPO_INTERNAL: readonly { pattern: RegExp; why: string }[] = [
  {
    pattern: /workspace:\*/,
    why: 'a `workspace:*` spec is a pnpm-only instruction; a user cannot install it',
  },
  {
    pattern: /nx build ui/,
    why: 'an emitted project is not a workspace member and has no `nx build ui` to run',
  },
  {
    pattern: /pnpm --filter/,
    why: 'a repo-internal command, unrunnable from a scaffolded project',
  },
  {
    /**
     * A monorepo-relative path to the kit.
     *
     * `workspace:*` is how the six LINKED starters name the kit; the two
     * STANDALONE ones (nextjs, tanstack-start) instead say
     * `file:../../../packages/ui`, which climbs out of the project and resolves
     * to nothing once that project is somewhere else on disk. It is the same
     * defect as `workspace:*` wearing different clothes, and the pattern above
     * does not match it.
     *
     * `rewritePackageJson` already replaces this spec in package.json — which is
     * why package.json is exempt from this whole check — but it is the ONLY file
     * rewritten, and the standalone starters carry the same path in two others:
     * their package-lock.json and their .npmrc comment. A lockfile pinning the
     * kit to a path that does not exist is not a cosmetic leak; it is an
     * `npm install` that resolves the wrong thing and an `npm ci` that refuses
     * outright.
     */
    pattern: /file:(?:\.\.\/)+packages\/ui/,
    why: "a monorepo-relative path to the kit; from a user's project it resolves to nothing",
  },
  {
    /**
     * The kit's own example title, in any of the shapes the starters write it.
     *
     * KEPT, BUT NO LONGER LOAD-BEARING FOR TITLES — `verifyTitles` below is what
     * covers those now. This pattern still earns its place because it reaches
     * PROSE a title rule cannot: a comment or a doc line that describes the kit's
     * examples rather than the user's app, anywhere in the tree.
     *
     * The first version of this was `\s+\S+\s+example`, which reads "the kit
     * name, ONE token, then `example`". That is the shape the five Vite starters
     * happen to use ("@kitn.ai/ui Vue example"), and it silently missed every
     * longer one: both SSR starters title themselves
     * "@kitn.ai/ui — Next.js App Router example" and
     * "@kitn.ai/ui — TanStack Start example", and neither tripped the guard.
     *
     * So it now spans the whole title rather than a fixed token count, and it
     * anchors on the SPACE after the kit name, which is what makes it a title
     * rather than any other mention. Three real strings in the tree are excluded
     * by that one character, and all three would otherwise be false reds:
     *
     *   `@kitn.ai/ui` is linked into this example ...  a backtick — vite.config
     *        prose, repo-internal for a DIFFERENT reason, already caught and
     *        patched out as `workspace:*`. Matching it here would report one
     *        defect twice and pin this pattern to a line another patch owns.
     *   @kitn.ai/ui-example-nextjs                    a hyphen — the starter's
     *        own package NAME. package.json is exempt from this check, but that
     *        name also appears in the standalone starters' package-lock.json.
     *   @kitn.ai/ui/react                             a slash — a subpath
     *        import, which can sit on a line whose comment says "example".
     */
    pattern: /@kitn\.ai\/ui[ \t]+[^\n`]{0,40}?\bexamples?\b/i,
    why: "the kit's own example title — the user's app should be named after the user's app",
  },
];

/**
 * `package.json` is exempt: it is not patched at all. `rewritePackageJson`
 * replaces the `workspace:*` kit spec and the starter's own name wholesale at
 * scaffold time, and generate.test.ts asserts no local spec reaches the emitted
 * file.
 */
const REPO_INTERNAL_EXEMPT = new Set(['package.json']);

/** Repo-internal instructions surviving in one already-patched file. */
export function repoInternalProblems(file: string, patched: string): GuardProblem[] {
  if (REPO_INTERNAL_EXEMPT.has(file)) return [];
  return REPO_INTERNAL.filter(({ pattern }) => pattern.test(patched)).map(({ pattern, why }) => ({
    file,
    detail: pattern.source,
    why,
  }));
}

const HEAD = /<head[^>]*>([\s\S]*?)<\/head>/i;
const TITLE = /<title[^>]*>([\s\S]*?)<\/title>/gi;

/**
 * The document titles an HTML file would give a user's browser tab.
 *
 * SCOPED TO `<head>`, and to `.html` files, on purpose. `<title>` is also a real
 * SVG element — it is how an inline icon gets its accessible name — and an icon
 * titled "Moon" is the user's app content, not a description of our repo. No
 * starter inlines one today, so this costs nothing now and is much cheaper than
 * diagnosing the false red the first time someone does. A head-less HTML file
 * falls back to the whole source, because over-reporting a title beats missing
 * one.
 */
export function documentTitles(file: string, source: string): string[] {
  if (!file.endsWith('.html')) return [];
  const head = HEAD.exec(source);
  const scope = head ? head[1] : source;
  return [...scope.matchAll(TITLE)].map((match) => match[1].trim());
}

/**
 * Every document title in an emitted project must BE the project's name.
 *
 * WHY THIS IS A WHITELIST AND THE `REPO_INTERNAL` ROW ABOVE IS NOT ENOUGH.
 * That row matches `@kitn.ai/ui`, whitespace, then `example` — it enumerates a
 * spelling of OUR name. The Solid starter titles itself
 *
 *     kai-chat — SolidJS Primitives Example
 *
 * which contains no `@kitn.ai/ui` anywhere, so the pattern cannot match it and
 * that title would ship into a user's app the day Solid flips to `ready`. Two
 * separate things went stale to produce it: `kai-chat` is an element name being
 * used as a product name, and the product it stood for has since been renamed to
 * `@kitn.ai/ui`. Both are exactly the kind of drift a name-anchored pattern is
 * blind to, and widening the pattern to also spell `kai-chat` would only move
 * the blind spot to whatever the next starter calls itself.
 *
 * So this asks for the RIGHT outcome instead of enumerating wrong ones. The
 * build applies the patches with `PROBE_NAME` and then requires every title to
 * equal it. Nothing that describes our repo — in any spelling, in any language,
 * under any future rename — can satisfy that, and neither can a template whose
 * title simply was never patched. The rule has no list to keep up to date.
 *
 * KNOWN LIMIT, stated rather than papered over: this sees HTML documents, which
 * is every `ready` framework. The two SSR starters set their title in JS
 * (`export const metadata` for Next, a `head()` meta array for TanStack), and
 * both are `planned`. Reaching those means telling a document title apart from
 * an object field that happens to be called `title` — `InteractiveIsland.tsx`
 * has three of the latter as card data — which needs a parser, not a regex. Both
 * of their current titles say "@kitn.ai/ui … example" and are caught by the
 * `REPO_INTERNAL` row above; a future one that does not would be missed, and
 * that gap belongs to whoever makes an SSR row `ready`.
 */
export function titleProblems(
  file: string,
  patched: string,
  projectName: string = PROBE_NAME,
): GuardProblem[] {
  return documentTitles(file, patched)
    .filter((title) => title !== projectName)
    .map((title) => ({
      file,
      detail: `<title>${title}</title>`,
      why:
        `a browser tab must read '${projectName}' — the name the user chose. Add a patch in ` +
        'src/patches.ts that rewrites this title to the project name.',
    }));
}
