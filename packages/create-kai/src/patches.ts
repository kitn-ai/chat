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
  /** must match exactly once in the template */
  find: RegExp;
  /** replacement, given the project name */
  replace: (projectName: string) => string;
  /** why this patch exists, printed when it stops matching */
  why: string;
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
  ],
};

/** Apply every patch for a template. Throws if one does not match. */
export function applyPatch(patch: Patch, source: string, projectName: string): string {
  if (!patch.find.test(source)) {
    throw new Error(
      `create-kai: patch for ${patch.file} no longer matches its template (${patch.why}). ` +
        'The starter changed; update PATCHES in src/patches.ts.',
    );
  }
  return source.replace(patch.find, () => patch.replace(projectName));
}

export function patchesFor(templateDir: string): readonly Patch[] {
  return PATCHES[templateDir] ?? [];
}
