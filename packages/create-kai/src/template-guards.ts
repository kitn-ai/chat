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

import { createRequire } from 'node:module';

import type * as TSApi from 'typescript';

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
 * SCOPED TO `<head>` on purpose. `<title>` is also a real SVG element — it is
 * how an inline icon gets its accessible name — and an icon titled "Moon" is the
 * user's app content, not a description of our repo. No starter inlines one
 * today, so this costs nothing now and is much cheaper than diagnosing the false
 * red the first time someone does. A head-less HTML file falls back to the whole
 * source, because over-reporting a title beats missing one.
 */
function htmlDocumentTitles(source: string): string[] {
  const head = HEAD.exec(source);
  const scope = head ? head[1] : source;
  return [...scope.matchAll(TITLE)].map((match) => match[1].trim());
}

/**
 * `createRequire` rather than `import ts from 'typescript'`, for the reason
 * `test/build-guards.test.ts` already gives at its own copy of this line: the
 * package is 8MB of CJS, nothing here needs a `Program` or a checker, and the
 * types come from the type-only import above, which erases.
 *
 * IT ALSO HAS TO BE A RUNTIME REQUIRE FOR THIS MODULE TO LOAD AT ALL under
 * `scripts/build.mjs`. That script reaches these rules through `loadTs()`, which
 * esbuild-bundles them and imports the result; a static `import` of `typescript`
 * cannot survive that trip either way round. Bundled, esbuild inlines 9.5MB of
 * CJS whose dynamic `require("fs")` throws on first call; external, the bare
 * specifier has nothing to resolve against. `loadTs` now writes its bundle to a
 * real file under `node_modules/.cache/` precisely so this line has a directory
 * to resolve from — see the note there.
 */
const ts = createRequire(import.meta.url)('typescript') as typeof TSApi;

/**
 * How to parse one file, or `null` when it is not a script at all.
 *
 * The kind matters rather than being a formality: parsing a `.ts` file as TSX
 * turns a `<T>value` cast into an unclosed JSX element and loses the rest of the
 * file, and parsing a `.tsx` file as TS does the reverse. Anything not listed —
 * `.css`, `.json`, `.npmrc`, an image — is not a script and yields no titles.
 * `.vue` and `.svelte` are deliberately absent: their `<script>` block would need
 * unwrapping first, and both of those starters set their title in `index.html`,
 * which the HTML half above already grades.
 */
function scriptKindFor(file: string): TSApi.ScriptKind | null {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.[cm]?ts$/.test(file)) return ts.ScriptKind.TS;
  if (/\.[cm]?js$/.test(file)) return ts.ScriptKind.JS;
  return null;
}

/** The value of a statically-known string expression, or null if it is computed. */
function staticString(node: TSApi.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

/** Strip `satisfies Metadata` / `as const` so the object literal underneath is reachable. */
function unwrap(node: TSApi.Expression): TSApi.Expression {
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    return unwrap(node.expression);
  }
  return node;
}

/** The `name:` property of an object literal, unwrapped. */
function propertyOf(object: TSApi.ObjectLiteralExpression, name: string): TSApi.Expression | null {
  for (const member of object.properties) {
    if (
      ts.isPropertyAssignment(member) &&
      (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) &&
      member.name.text === name
    ) {
      return unwrap(member.initializer);
    }
  }
  return null;
}

/**
 * The titles a `title:` property holds.
 *
 * Next.js allows an object here — `{ default, template, absolute }` — and two of
 * the three are literal tab text. `template` is NOT read: it is a pattern like
 * `'%s | Acme'` that is only ever combined with a child title, so it can never
 * equal the project name and grading it would fail every starter that uses one
 * legitimately. A repo name reaching a user through a template would be caught as
 * prose by the `REPO_INTERNAL` row instead.
 */
function titlesInTitleValue(value: TSApi.Expression): string[] {
  const direct = staticString(value);
  if (direct !== null) return [direct];
  if (!ts.isObjectLiteralExpression(value)) return [];
  const out: string[] = [];
  for (const key of ['default', 'absolute']) {
    const nested = propertyOf(value, key);
    const text = nested && staticString(nested);
    if (text != null) out.push(text);
  }
  return out;
}

/**
 * The document titles a JS/TS module would give a user's browser tab.
 *
 * WHY THIS IS A PARSE AND NOT A REGEX, which the note this replaces stated as a
 * reason to leave the gap open. An object field named `title` is app data far
 * more often than it is a document title: the two SSR starters carry a pile of
 * them — conversation names in `chat-data.ts` and `useConversations.ts`, and a
 * JSX `title={…}` attribute on `HydrationBadge.tsx` — against exactly one real
 * document title each. A pattern that reached the real ones would report all of
 * them, and one that did not report them would not reach the real ones either.
 * (The count was EIGHT when this was written, three of which were card headings
 * in the Next starter's `InteractiveIsland.tsx`. That file went away when the
 * starter became a composed chat app; the ratio is the point, and a literal
 * census here would just go stale again — `test/template-guards.test.ts` drives
 * every shape against literals instead.) So the rule anchors on STRUCTURE, and
 * takes three shapes, each of which is a framework's own contract for the
 * document title rather than a guess:
 *
 *   · `export const metadata = { title }`, and the object returned from
 *     `generateMetadata()`. This is Next.js's documented API, and it is how the
 *     `nextjs` starter titles itself today.
 *   · `{ title }` inside an array assigned to `meta:`. This is the TanStack Start
 *     `head: () => ({ meta: [ … ] })` shape the `tanstack-start` starter uses,
 *     and the same array unhead/Nuxt take. A `title` key in a meta-descriptor
 *     array is unambiguous: the HTML meta element has no such attribute, so
 *     nothing else would be written there.
 *   · `document.title = '…'`, which is framework-independent and needs no anchor
 *     beyond itself.
 *
 * None of the eight false positives above sits in any of those positions, and a
 * JSX attribute is not an object property at all, so none is reachable from here.
 *
 * A file that does not parse yields no titles rather than throwing. `createSourceFile`
 * does not throw on malformed input — it recovers and carries on — so this is
 * about the shape of the answer, not error handling: a template that cannot be
 * parsed is a problem for the build's other rules, not this one's to report.
 */
export function jsDocumentTitles(file: string, source: string): string[] {
  const kind = scriptKindFor(file);
  if (kind === null) return [];

  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const titles: string[] = [];

  /** A metadata-shaped object: take its `title`, in either of Next's two forms. */
  const readMetadataObject = (node: TSApi.Expression): void => {
    const object = unwrap(node);
    if (!ts.isObjectLiteralExpression(object)) return;
    const title = propertyOf(object, 'title');
    if (title) titles.push(...titlesInTitleValue(title));
  };

  const isExported = (node: TSApi.Node): boolean =>
    (ts.getCombinedModifierFlags(node as TSApi.Declaration) & ts.ModifierFlags.Export) !== 0;

  const visit = (node: TSApi.Node): void => {
    // (1) Next.js: `export const metadata = { title: '…' }`.
    if (ts.isVariableStatement(node) && isExported(node.declarationList.declarations[0])) {
      for (const declaration of node.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === 'metadata' &&
          declaration.initializer
        ) {
          readMetadataObject(declaration.initializer);
        }
      }
    }

    // (1b) Next.js: `export function generateMetadata() { return { title: '…' } }`.
    // Every object literal it returns, at any depth, so a branch per locale still
    // gets graded.
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'generateMetadata'
    ) {
      const returns = (inner: TSApi.Node): void => {
        if (ts.isReturnStatement(inner) && inner.expression) readMetadataObject(inner.expression);
        ts.forEachChild(inner, returns);
      };
      ts.forEachChild(node, returns);
    }

    // (2) TanStack Start / unhead: a `{ title }` entry in a `meta: [ … ]` array.
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      node.name.text === 'meta'
    ) {
      const array = unwrap(node.initializer);
      if (ts.isArrayLiteralExpression(array)) {
        for (const element of array.elements) {
          const entry = unwrap(element);
          if (!ts.isObjectLiteralExpression(entry)) continue;
          const title = propertyOf(entry, 'title');
          const text = title && staticString(title);
          if (text != null) titles.push(text);
        }
      }
    }

    // (3) `document.title = '…'`, in any framework.
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.name.text === 'title' &&
      ts.isIdentifier(node.left.expression) &&
      node.left.expression.text === 'document'
    ) {
      const text = staticString(unwrap(node.right));
      if (text !== null) titles.push(text);
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(parsed, visit);
  return titles;
}

/**
 * Every document title an emitted file would give a user's browser tab, whether
 * it is written in HTML or declared in JavaScript.
 */
export function documentTitles(file: string, source: string): string[] {
  if (file.endsWith('.html')) return htmlDocumentTitles(source);
  return jsDocumentTitles(file, source);
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
 * READS JS-DECLARED TITLES TOO, which is what the note here used to hand to
 * "whoever makes an SSR row `ready`". That was already overdue when TanStack
 * Start went `ready` with its title in a `head()` meta array: #216 covered that
 * ONE string with a patch-match plus a bespoke assertion in generate.test.ts, so
 * the string was held but the CLASS was not, and Next.js — the next row in the
 * queue — declares titles the same way. `documentTitles` now parses the three
 * structural shapes a framework uses to set a document title; see it for which
 * and why a parse rather than a regex.
 *
 * WHAT IS STILL NOT GRADED, stated at its real size rather than papered over:
 *
 *   · A title that is not a static string. `` `${x} — App` ``, a variable, a
 *     function call, an imported constant. There is nothing to compare against
 *     the project name, and reporting them would red-flag the legitimate case a
 *     real app is most likely to write. The bytes are still read as PROSE by the
 *     `REPO_INTERNAL` row above, so a computed title built from our name is
 *     caught there rather than here.
 *   · Next's `title.template` (`'%s | Acme'`), for the same reason — see
 *     `titlesInTitleValue`.
 *   · A title inside a `.vue` or `.svelte` `<script>` block, which would need the
 *     SFC unwrapped first. Neither starter does that; both title themselves in
 *     `index.html`, which is graded.
 *   · A title set through an indirection this cannot see structurally — a helper
 *     the app calls, a config object built elsewhere and spread in.
 */
export function titleProblems(
  file: string,
  patched: string,
  projectName: string = PROBE_NAME,
): GuardProblem[] {
  // Quoted the way the offending file actually spells it, so the message points
  // at something greppable rather than at HTML the file may not contain.
  const spell = (title: string) =>
    file.endsWith('.html') ? `<title>${title}</title>` : `title: '${title}'`;

  return documentTitles(file, patched)
    .filter((title) => title !== projectName)
    .map((title) => ({
      file,
      detail: spell(title),
      why:
        `a browser tab must read '${projectName}' — the name the user chose. Add a patch in ` +
        'src/patches.ts that rewrites this title to the project name.',
    }));
}
