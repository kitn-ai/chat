/**
 * Template patches — the small, named edits that turn a reviewed starter into a
 * user's own project.
 *
 * Everything not listed here is a straight file copy, which is what keeps an
 * emitted project byte-identical to the CI-built starter and is the whole
 * anti-drift argument for sourcing templates from `examples/starters/*`.
 *
 * WHY EACH PATCH IS A `find` THAT MUST MATCH. `scripts/build.mjs` runs every
 * patch against the copied template at BUILD time and fails if one does not
 * match. A patch is a string that has to keep agreeing with a file nobody
 * editing that file will think about, so the alternative — apply it at scaffold
 * time and shrug when it misses — degrades silently: the starter's comment gets
 * reworded, the patch stops matching, and every emitted project quietly ships a
 * `workspace:*` instruction its user cannot follow. Failing the build is the
 * only version of this that stays true.
 */

export interface Patch {
  /** path relative to the template root */
  file: string;
  /** must match exactly once in the template, unless `multiple` opts out */
  find: RegExp;
  /** replacement, given the project name */
  replace: (projectName: string) => string;
  /** why this patch exists, printed when it stops matching */
  why: string;
  /**
   * Replace EVERY occurrence instead of requiring exactly one.
   *
   * WHAT THE UNAMBIGUITY GUARD IS ACTUALLY FOR, because this flag is a hole in
   * it and the hole has to be the right shape. `String.replace` with a
   * non-global regex rewrites the FIRST match and silently leaves the rest, so a
   * `find` that matches twice is usually a `find` written too loosely: the
   * author meant one site, hit two, and shipped a half-applied edit. Refusing
   * that is worth a build failure.
   *
   * It is the wrong answer for a RENAME. `angular.json` names the project four
   * times — the `projects` key, `outputPath`, and both `serve` buildTargets —
   * and those four are not an ambiguity to resolve. They are one fact stated
   * four times, and the count belongs to Angular's config schema rather than to
   * anything we decided.
   *
   * The alternative was four context-pinned patches, one per site. That is
   * WORSE, not merely more typing: four patches that each match once satisfy the
   * guard completely, so the build stays green while covering a fixed four of an
   * unbounded set. Add a `test` or `extract-i18n` target — an Angular CLI
   * upgrade does this on its own — and the fifth reference to the old name
   * ships into a user's project with every check passing. A guard that reports
   * success over the occurrence it cannot see is the failure this repo keeps
   * paying for; encoding an unbounded fact at fixed arity is how you build one.
   *
   * SO THE HOLE IS NARROW. Only a patch that opts in may match more than once —
   * every other patch is held to exactly one, unchanged. And an opted-in patch
   * that matches ZERO times is still a hard failure in both `applyPatch` and the
   * build's `verifyPatches`, because "replace every occurrence" that replaces
   * nothing is a rename that silently did not happen, which is the same vacuous
   * pass wearing the opposite disguise.
   */
  multiple?: true;
}

/**
 * The regex `applyPatch` will actually run: global only when a patch opted into
 * `multiple`, so a single-site patch still rewrites exactly one occurrence.
 *
 * Flags are normalised rather than concatenated. `new RegExp(src, flags + 'g')`
 * — which is what the build did — throws `SyntaxError: Invalid flags` the day
 * someone writes `/…/g` in the table above. And a global regex reused across
 * calls carries its `lastIndex`, so a second scaffold in the same process would
 * start searching where the first stopped. Built fresh every call for both
 * reasons.
 */
/**
 * The part of a patch the matching helpers need.
 *
 * Narrowed to this rather than taking a `Patch`, so the gateway table below —
 * whose `replace` takes a context object rather than a project name — goes
 * through the SAME matching and counting code instead of a second copy of it.
 * The alternative was two near-identical helpers, which is how one of them gets
 * a fix the other does not.
 */
export type Matchable = Pick<Patch, 'find'> & { multiple?: true };

function baseFlags(patch: Matchable): string {
  return patch.find.flags.replace(/g/g, '');
}

export function patchRegExp(patch: Matchable): RegExp {
  const flags = baseFlags(patch);
  return new RegExp(patch.find.source, patch.multiple === true ? `${flags}g` : flags);
}

/**
 * How many times a patch matches — every occurrence, whether or not it opted
 * into `multiple`. This is what `scripts/build.mjs` counts to decide between
 * "does not match at all" (always fatal) and "matches more than once" (fatal
 * only without the opt-in).
 */
export function countMatches(patch: Matchable, source: string): number {
  return [...source.matchAll(new RegExp(patch.find.source, `${baseFlags(patch)}g`))].length;
}

export const PATCHES: Record<string, readonly Patch[]> = {
  react: [
    {
      file: 'index.html',
      find: /<title>@kitn\.ai\/ui React example<\/title>/,
      replace: (name) => `<title>${name}</title>`,
      why: 'the browser tab should name the user\'s app, not the kit\'s example',
    },
    {
      file: 'vite.config.ts',
      find: /\/\/ `@kitn\.ai\/ui` is linked into this example via `workspace:\*`[\s\S]*?\n(?=\/\/ https:\/\/vite\.dev\/config\/)/,
      replace: () =>
        '// `@kitn.ai/ui` ships compiled entry points and resolves through its own\n' +
        '// `exports` map — no aliases, no transpile step needed.\n',
      why: 'a scaffolded project is not a workspace member and has no `nx build ui` to run',
    },
  ],
  vue: [
    {
      file: 'index.html',
      find: /<title>@kitn\.ai\/ui Vue example<\/title>/,
      replace: (name) => `<title>${name}</title>`,
      why: 'the browser tab should name the user\'s app, not the kit\'s example',
    },
    {
      /**
       * Vue's config carries TWO comment paragraphs where React's carries one:
       * the `workspace:*` note, then the `isCustomElement` note explaining why
       * every `kai-*` tag is passed through to the DOM instead of resolved as a
       * Vue component. Only the first is repo-internal, and the second is the
       * single most load-bearing line in a Vue consumer's config — drop it and
       * the app warns "unknown custom element" and renders nothing.
       *
       * So the lookahead stops at the blank comment line before it, rather than
       * at `// https://vite.dev/config/` the way React's does. Copying React's
       * pattern here would have eaten the Vue-specific note.
       */
      file: 'vite.config.ts',
      find: /\/\/ `@kitn\.ai\/ui` is linked into this example via `workspace:\*`[\s\S]*?\n(?=\/\/\n\/\/ The one Vue-specific bit)/,
      replace: () =>
        '// `@kitn.ai/ui` ships compiled entry points and resolves through its own\n' +
        '// `exports` map — no aliases, no transpile step needed.\n',
      why: 'a scaffolded project is not a workspace member and has no `nx build ui` to run',
    },
  ],
  angular: [
    {
      /**
       * Angular's index.html lives at `src/index.html`, not the project root the
       * way React's and Vue's do — `angular.json` names it as the `index` input
       * and the builder emits it to `dist/`. Same one-line edit, different path,
       * and the path is the part that a copy of the row above would get wrong.
       */
      file: 'src/index.html',
      find: /<title>@kitn\.ai\/ui Angular example<\/title>/,
      replace: (name) => `<title>${name}</title>`,
      why: 'the browser tab should name the user\'s app, not the kit\'s example',
    },
    {
      /**
       * The one patch in this table that renames rather than rewrites, and the
       * only reason `multiple` exists — see the flag's docblock for why four
       * separate patches would have been the worse answer.
       *
       * `angular.json` is where Angular's builder learns what the project is
       * called, and unlike every other starter's config it is copied verbatim
       * with nothing rewriting it: `rewritePackageJson` only touches
       * package.json, and READMEs never reach a template at all. So a user who
       * scaffolded `my-app` got `ng build` writing into `dist/ui-example-angular`
       * and `ng serve` resolving a build target named after our example. Same
       * class as the "@kitn.ai/ui Vue example" browser tab, in the one file no
       * patch had ever opened.
       *
       * Matching the bare name rather than each quoted string is deliberate:
       * two of the four sites embed it in a longer value
       * (`dist/ui-example-angular`, `ui-example-angular:build:production`), so a
       * `"…"`-anchored find would need two shapes to cover what one substring
       * covers exactly.
       */
      file: 'angular.json',
      find: /ui-example-angular/,
      multiple: true,
      replace: (name) => name,
      why: 'angular.json names the project; a scaffolded app must build into its own dist/<name>, not dist/ui-example-angular',
    },
  ],
  svelte: [
    {
      file: 'index.html',
      find: /<title>@kitn\.ai\/ui Svelte example<\/title>/,
      replace: (name) => `<title>${name}</title>`,
      why: 'the browser tab should name the user\'s app, not the kit\'s example',
    },
    {
      /**
       * Same two-paragraph shape as Vue's, and the second paragraph is kept for
       * the same reason: it is about the FRAMEWORK, not about this repo. It
       * tells a Svelte reader why `kai-*` needs no `isCustomElement`-style
       * registration — the compiler treats any hyphenated tag as a native
       * custom element — which is the first thing someone coming from the Vue
       * config asks. So the lookahead stops at the blank comment line, exactly
       * as Vue's does.
       */
      file: 'vite.config.ts',
      find: /\/\/ `@kitn\.ai\/ui` is linked into this example via `workspace:\*`[\s\S]*?\n(?=\/\/\n\/\/ Unlike Vue, Svelte needs no)/,
      replace: () =>
        '// `@kitn.ai/ui` ships compiled entry points and resolves through its own\n' +
        '// `exports` map — no aliases, no transpile step needed.\n',
      why: 'a scaffolded project is not a workspace member and has no `nx build ui` to run',
    },
  ],
  solid: [
    {
      /**
       * The ONLY patch this template needs, and worth stating why rather than
       * leaving a reader to wonder which one went missing: every other Vite
       * starter also patches its `vite.config.ts` to strip the `workspace:*`
       * paragraph, and Solid's config has no such paragraph to strip. It is four
       * lines registering two plugins, with the kit resolved through its own
       * `exports` map. `emittedContentProblem` is what proves that — it scans the
       * PATCHED bytes of every file for repo-internal instructions — so this
       * comment is a signpost, not the evidence.
       *
       * WHAT THIS TITLE USED TO BE, because it is the string `titleProblems` was
       * written against:
       *
       *     kai-chat — SolidJS Primitives Example
       *
       * Two separate things had gone stale in it. `kai-chat` is an ELEMENT name
       * being used as a product name, and the product it stood for was since
       * renamed to `@kitn.ai/ui`. The result contained no `@kitn.ai/ui` anywhere,
       * so the REPO_INTERNAL row could not match it and it would have shipped
       * into a user's browser tab the day this row flipped to `ready` — which is
       * exactly the hole `titleProblems` exists to close, and it caught this one
       * on the first build with the status flipped.
       */
      file: 'index.html',
      find: /<title>@kitn\.ai\/ui SolidJS example<\/title>/,
      replace: (name) => `<title>${name}</title>`,
      why: 'the browser tab should name the user\'s app, not the kit\'s example',
    },
  ],
  vanilla: [
    {
      file: 'index.html',
      find: /<title>@kitn\.ai\/ui vanilla example<\/title>/,
      replace: (name) => `<title>${name}</title>`,
      why: 'the browser tab should name the user\'s app, not the kit\'s example',
    },
    {
      /**
       * The one place a patch REWRITES the framework paragraph instead of
       * stopping short of it.
       *
       * Vue's and Svelte's second paragraphs describe their compilers, so they
       * survive the copy into a user's project unchanged. The vanilla starter's
       * describes ITSELF — "unlike the React/Vue examples", "this is the pure
       * web components, zero framework showcase" — which is true of the starter
       * sitting in `examples/` and false of the app the user just scaffolded.
       * Nothing in REPO_INTERNAL catches that, because it is not an instruction
       * the user cannot follow; it is a sentence that describes the wrong
       * project. So this patch spans both paragraphs and re-emits the half that
       * is about the browser, dropping the half that is about the repo.
       */
      file: 'vite.config.ts',
      find: /\/\/ `@kitn\.ai\/ui` is linked into this example via `workspace:\*`[\s\S]*?\n(?=\/\/ https:\/\/vite\.dev\/config\/)/,
      replace: () =>
        '// `@kitn.ai/ui` ships compiled entry points and resolves through its own\n' +
        '// `exports` map — no aliases, no transpile step needed.\n' +
        '//\n' +
        '// No framework plugin here: the browser upgrades the `kai-*` custom elements\n' +
        '// natively, so there is nothing for a template compiler to learn about the\n' +
        '// tags.\n',
      why: 'a scaffolded project is not a workspace member and has no `nx build ui` to run',
    },
  ],
  /**
   * The other STANDALONE starter, and the same pair of patches as
   * `tanstack-start` below for the same two reasons — a JS-declared document
   * title, and a `.npmrc` comment naming a monorepo-relative kit path. Different
   * files, because Next declares its title in `export const metadata` rather than
   * a route's `head()`.
   */
  nextjs: [
    {
      /**
       * THE BROWSER TAB, VIA NEXT'S METADATA API.
       *
       * Unlike the TanStack row below, this one IS graded. `titleProblems` now
       * parses `export const metadata = { title }` and `generateMetadata()`
       * (src/template-guards.ts), so a Next starter that stopped being patched —
       * or that grew a second `metadata` export in a new route — fails the build
       * on the emitted bytes rather than relying on this patch still matching.
       * Both hold it: `patchMatchProblem` if the string is reworded,
       * `emittedContentProblem` if the resulting title is not the project name.
       *
       * The one shape to avoid when editing this: anything the parser cannot
       * read as a static string. A template literal, a variable, a call, or
       * Next's `title.template` (`'%s | Acme'`) all yield NO title to compare, so
       * the guard goes quiet rather than failing — see the stated limits on
       * `titleProblems`. Keep it a plain string literal.
       */
      file: 'app/layout.tsx',
      find: /'@kitn\.ai\/ui — Next\.js App Router example'/,
      replace: (name) => `'${name}'`,
      why: 'the browser tab should name the user\'s app, not the kit\'s example',
    },
    {
      /**
       * The `.npmrc` comment, which is pure monorepo geography — see the
       * identical patch on the `tanstack-start` row for the full reasoning. The
       * replacement keeps this starter's own justification for `install-links`,
       * which is Next-specific and worth carrying into a user's project: webpack
       * resolves symlinks to their realpath, which would put the kit's prebuilt
       * `dist/` outside `node_modules` and hand it to the transpiler.
       */
      file: '.npmrc',
      find: /# Pack the local `@kitn\.ai\/ui`[\s\S]*?\n(?=install-links=true)/,
      replace: () =>
        '# A `file:` dependency pointing at a DIRECTORY is copied into node_modules\n' +
        '# rather than symlinked. Next/webpack resolves a symlink to its realpath, which\n' +
        '# would put a linked package\'s prebuilt dist/ outside node_modules and hand it\n' +
        '# to the transpiler. Harmless if this project has no local dependencies.\n',
      why: 'the comment explains a monorepo-relative kit path that does not exist in a user\'s project',
    },
  ],
  /**
   * The first STANDALONE starter to go `ready`, and it needs a different pair of
   * patches from the VITE rows above — neither of the two files below exists in
   * any of them. (`nextjs`, added later and also standalone, sits directly above
   * with the same shape.)
   *
   * The six linked starters name the kit `workspace:*` and carry the repo-internal
   * instruction in `vite.config.ts`. This one names it
   * `file:../../../packages/ui`, and its vite.config says nothing about the
   * monorepo at all, so the React-shaped `vite.config.ts` patch would find nothing
   * to match here. Copying the row above is the wrong move; these are the two
   * files that actually carry the leak.
   */
  'tanstack-start': [
    {
      /**
       * THE BROWSER TAB, SET IN JAVASCRIPT RATHER THAN HTML.
       *
       * TanStack Start has no `index.html`: the document title is a `head()` meta
       * entry on the root route, which is why this patch targets a `.tsx` file
       * where every other title patch in this table targets HTML.
       *
       * THAT DIFFERENCE COSTS REAL COVERAGE, and it is worth knowing rather than
       * discovering. `verifyTitles` (src/template-guards.ts) only reads `.html`
       * files, so it cannot grade this one — see the KNOWN LIMIT paragraph on
       * `titleProblems`, which names this exact case. What holds this title true
       * is therefore narrower than what holds the other five true:
       *
       *   · `patchMatchProblem` fails the build if this `find` stops matching or
       *     starts matching twice, so the title cannot be reworded silently.
       *   · `generate.test.ts`'s tanstack-start block asserts the EMITTED
       *     `__root.tsx` carries the project's name and no longer mentions the
       *     kit's example, which is the assertion `verifyTitles` would have made.
       *
       * What neither covers is a SECOND document title added elsewhere in the
       * project — a new route with its own `head()`. Closing that needs
       * `titleProblems` to read a JS meta array, which needs a parser rather than
       * a regex (an object field named `title` is card data far more often than
       * it is a document title). Left as a stated gap rather than a regex that
       * would half-cover it.
       */
      file: 'src/routes/__root.tsx',
      find: /'@kitn\.ai\/ui — TanStack Start example'/,
      replace: (name) => `'${name}'`,
      why: 'the browser tab should name the user\'s app, not the kit\'s example',
    },
    {
      /**
       * The `.npmrc` comment, which is pure monorepo geography.
       *
       * `install-links=true` itself is worth keeping — it is a general npm setting
       * with a general justification — but the three comment lines above it
       * explain why THIS EXAMPLE points at `file:../../../packages/ui`, a path
       * that climbs out of a user's project and resolves to nothing. That spec is
       * caught by the `file:` pattern in REPO_INTERNAL; `rewritePackageJson`
       * scrubs it from package.json, and the starter's package-lock.json never
       * reaches a template because `scripts/build.mjs` skips lockfiles. This
       * comment is the third and last place it appears.
       *
       * So the patch replaces the explanation rather than the directive, on the
       * same principle as the vanilla row above: keep the half that is about npm,
       * drop the half that is about where this repo keeps its packages.
       */
      file: '.npmrc',
      find: /# Pack the local `@kitn\.ai\/ui`[\s\S]*?\n(?=install-links=true)/,
      replace: () =>
        '# A `file:` dependency pointing at a DIRECTORY is copied into node_modules\n' +
        '# rather than symlinked, so a local package resolves the way a published one\n' +
        '# does. Harmless if this project has none.\n',
      why: 'the comment explains a monorepo-relative kit path that does not exist in a user\'s project',
    },
  ],
};

/**
 * ── GATEWAY PATCHES ──────────────────────────────────────────────────────────
 *
 * The edits that take a starter OFF the mock responder and onto a real route.
 * Applied only when a gateway was chosen; on `mock` the table above is the whole
 * of what changes, which is what keeps the zero-config path byte-identical to
 * the reviewed starter.
 *
 * WHY THESE ARE A SEPARATE TABLE AND NOT A `when` FLAG ON THE ONE ABOVE. The
 * build verifies that every patch in `PATCHES` matches its template, and it must
 * keep doing that unconditionally. These have the same requirement but a
 * different arity: they exist only for the frameworks that have a route host, so
 * a single table would have to encode "this row is expected to be absent for six
 * of the eight frameworks", which is the shape that makes a guard stop meaning
 * anything. Two tables, each checked completely, says the same thing without the
 * exception.
 *
 * WHY THE REPLACEMENT TAKES A CONTEXT AND NOT JUST A NAME. The fetch body has to
 * name the thread the way THIS framework reads it, and that expression is read
 * out of the starter by `goLiveThread` — the same function the README already
 * uses for the same reason, and for the same failure it was written against: a
 * hard-coded `chat.messages` is right for React and serializes a Ref object in
 * Vue. So the CLI never states the expression; it quotes the app file.
 */
export interface GatewayPatchContext {
  /** how this framework's app reads its thread back, from `goLiveThread` */
  thread: string;
  /** where the route was written, for the comment that points at it */
  routeFile: string;
  /** the gateway's catalog title, e.g. "OpenRouter" */
  gatewayTitle: string;
  /**
   * The model id to post, or undefined when this gateway's route pins its own.
   *
   * From `clientModelFor`, which reads `forwardsFromClient` off the catalog. It
   * is `undefined` rather than a default for the integrations whose route never
   * reads the field — emitting an editable constant there would be a knob that
   * does nothing.
   */
  model: string | undefined;
}

export interface GatewayPatch {
  file: string;
  find: RegExp;
  why: string;
  multiple?: true;
  replace: (context: GatewayPatchContext) => string;
}

/**
 * The two edits every composed starter needs, whatever its framework.
 *
 * Both starters wired today carry these byte-identically, because both compose
 * the same way — `useKaiChat` + `readOpenAIStream` over `mockResponse`. That is
 * a fact about the current starters rather than a rule, so this is a helper the
 * rows call rather than a default they inherit: a starter that composes
 * differently gets its own rows and the build tells you which, because a patch
 * that stops matching is fatal.
 */
function goLivePatches(): GatewayPatch[] {
  return [
    {
      file: '',
      find: /import \{ readOpenAIStream \} from '@kitn\.ai\/ui\/wire';/,
      replace: () => `import { readOpenAIStream, toOpenAIMessages } from '@kitn.ai/ui/wire';`,
      why: 'the live path encodes the thread with toOpenAIMessages before POSTing it',
    },
    {
      /**
       * Drop `mockResponse` from the import.
       *
       * NOT COSMETIC. Both starters compile under `noUnusedLocals: true`, so an
       * import left behind after its only call site is rewritten is TS6133 and a
       * hard `npm run build` failure in the emitted project — which is precisely
       * the class of defect the smoke test exists to catch, and the reason it
       * runs a real build rather than checking that files exist.
       */
      file: '',
      find: /, newId, mockResponse \} from '\.\/chat-data';/,
      replace: () => `, newId } from './chat-data';`,
      why: 'mockResponse is no longer called, and noUnusedLocals makes an unused import a build failure',
    },
    {
      /**
       * The doc comment above the component, which tells its reader the app runs
       * on a mock. It does not any more.
       *
       * The optional `\n \*` in the middle is not sloppiness: React's starter
       * wraps this sentence across two comment lines and Next's does not, and a
       * regex written against either one alone silently leaves the other's stale
       * sentence in a user's project.
       */
      file: '',
      find: /Swap(\n \*)? `mockResponse\(text\)` for a real `fetch` to ship a real app\./,
      replace: ({ routeFile }) => `Its \`send\` posts to \`/api/chat\`, served by \`${routeFile}\`.`,
      why: 'the emitted app no longer runs on the mock, so the comment describing it would be false',
    },
    {
      /**
       * The line above the append, which calls the reply a mock. It is not one
       * any more. Small, and included for the same reason the docblock sentence
       * above is: a comment that describes the wrong program is worse than no
       * comment, and these are the three places the starters say "mock" outside
       * the block that gets replaced wholesale.
       */
      file: '',
      find: /message and stream the \(mock\) assistant reply\./,
      replace: () => `message and stream the assistant reply.`,
      why: 'the reply is no longer a mock, so the comment calling it one would be false',
    },
    {
      /**
       * The call site itself — the one expression the README's go-live diff has
       * always described, applied for the user instead of handed to them.
       *
       * The `find` spans the whole NO-BACKEND comment block as well as the call,
       * because the comment explains a mock that is no longer there. Leaving it
       * would ship five lines telling the reader their real provider call is
       * canned SSE frames.
       */
      file: '',
      find: /\/\/ NO BACKEND AND NO PROVIDER\.[\s\S]*?await readOpenAIStream\(mockResponse\(text\), stream\);/,
      replace: ({ thread, routeFile, gatewayTitle, model }) =>
        [
          `// The key never reaches the browser: \`${routeFile}\` reads it from the`,
          `      // environment and forwards this request to ${gatewayTitle}. The reply is`,
          `      // parsed by the SAME reader that parsed the mock's frames.`,
          `      const res = await fetch('/api/chat', {`,
          `        method: 'POST',`,
          `        headers: { 'content-type': 'application/json' },`,
          ...(model
            ? [
                `        // Change this to any model id ${gatewayTitle} accepts. The route forwards`,
                `        // it verbatim, so this is the whole of "use a different model".`,
                `        body: JSON.stringify({ model: '${model}', messages: toOpenAIMessages(${thread}) }),`,
              ]
            : [`        body: JSON.stringify({ messages: toOpenAIMessages(${thread}) }),`]),
          `      });`,
          `      await readOpenAIStream(res, stream);`,
        ].join('\n'),
      why: 'the emitted app must call the route instead of the mock responder',
    },
  ];
}

/** `goLivePatches()` with the app file filled in, since only the path differs. */
function goLivePatchesFor(appFile: string): GatewayPatch[] {
  return goLivePatches().map((patch) => ({ ...patch, file: appFile }));
}

export const GATEWAY_PATCHES: Record<string, readonly GatewayPatch[]> = {
  react: [
    ...goLivePatchesFor('src/App.tsx'),
    {
      file: 'vite.config.ts',
      find: /import react from '@vitejs\/plugin-react';/,
      replace: () =>
        `import react from '@vitejs/plugin-react';\n` +
        `// Mounts the chat route on the dev server. A Vite SPA has no server routes,\n` +
        `// so without this \`fetch('/api/chat')\` 404s with an HTML body.\n` +
        `import { chatApiPlugin } from './vite-chat-api';`,
      why: 'a Vite SPA needs the dev-server plugin imported before it can be registered',
    },
    {
      file: 'vite.config.ts',
      find: /plugins: \[react\(\)\],/,
      replace: () => `plugins: [react(), chatApiPlugin()],`,
      why: 'the chat-api plugin has to be in the plugin list or the middleware never mounts',
    },
  ],
  nextjs: goLivePatchesFor('app/workspace.tsx'),
};

export function gatewayPatchesFor(templateDir: string): readonly GatewayPatch[] {
  return GATEWAY_PATCHES[templateDir] ?? [];
}

/**
 * Apply one gateway patch. Throws if it does not match, for the same reason
 * `applyPatch` does — see that function.
 */
export function applyGatewayPatch(
  patch: GatewayPatch,
  source: string,
  context: GatewayPatchContext,
): string {
  const find = patchRegExp(patch);
  if (!find.test(source)) {
    throw new Error(
      `create-kai: gateway patch for ${patch.file} no longer matches its template (${patch.why}). ` +
        'The starter changed; update GATEWAY_PATCHES in src/patches.ts.',
    );
  }
  find.lastIndex = 0;
  return source.replace(find, () => patch.replace(context));
}

/**
 * Apply one patch. Throws if it does not match.
 *
 * The throw covers `multiple` patches too, and that is the whole point of
 * putting it before the replace rather than checking the result: `replace` with
 * a global regex that matches nothing returns the source unchanged and reports
 * success, so a rename that quietly stopped renaming would look identical to one
 * that worked.
 */
export function applyPatch(patch: Patch, source: string, projectName: string): string {
  const find = patchRegExp(patch);
  if (!find.test(source)) {
    throw new Error(
      `create-kai: patch for ${patch.file} no longer matches its template (${patch.why}). ` +
        'The starter changed; update PATCHES in src/patches.ts.',
    );
  }
  // `test` advanced `lastIndex` if `find` is global. `replace` resets it itself,
  // but depending on that is a subtlety a reader should not have to know.
  find.lastIndex = 0;
  return source.replace(find, () => patch.replace(projectName));
}

export function patchesFor(templateDir: string): readonly Patch[] {
  return PATCHES[templateDir] ?? [];
}
