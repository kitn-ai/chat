/**
 * The DELIVERY FORMS of a block -- one renderer, shared by every front door.
 *
 * A block is authored once, framework-neutral: a page of `kai-*` elements plus
 * an imperative entry script (spec 2026-08-31, Part 3). This module renders
 * that one source into each form a consumer can receive:
 *
 *   - `html` - the web-component form `create-kai add` writes into any
 *              non-react project: the authored page with its bindings taken
 *              off the markup plus a GENERATED binder (see `./html`), with
 *              registration adapted for a bundler.
 *   - `react`- the react form: the block root as a tree of the typed
 *              wrappers from `@kitn.ai/ui/react`, plus a `useSyncExternalStore`
 *              adapter over the controller (see `./react`).
 *   - `vue`  : the vue form: the block root as a `<script setup>` SFC over the
 *              custom elements, plus a composable holding one `shallowRef`
 *              over the controller (see `./vue`, built on the shared
 *              component-framework preamble in `./emit`).
 *   - `cdn`  : the single-file CDN paste form: the HTML form above, inlined
 *              and pinned onto the published entries by `registry.ts`'s
 *              `generateCdnForm` (see `./cdn`).
 *
 * ONE RENDERER, TWO CALLERS, by the same precedent as `registry.ts`:
 * `create-kai` bundle-imports this module (`src/react-form.ts` re-exports it,
 * `src/blocks.ts` plans writes over it), and `gen-blocks.mjs` renders the
 * identical output per framework into `dist/blocks/f/<name>.<form>.json`,
 * which is what the docs site's /blocks section shows. A drift between "what
 * /blocks shows" and "what add writes" is therefore a build failure, never a
 * runtime surprise.
 *
 * DISCIPLINE -- pure functions over injected data, no `node:*` imports, same
 * as `registry.ts`: this file typechecks under the package's browser tsconfig
 * (the /blocks page imports the form axis directly) and bundles into the CLI.
 */
import type { Block, CdnFormOptions } from '../registry';
import type { FormFile } from '../contract/types';
import { renderHtmlForm } from './html';
import { renderReactForm } from './react';
import { renderVueForm } from './vue';
import { renderCdnFormFiles } from './cdn';

// The renderers live in their own modules and are re-exported HERE, so every
// caller keeps importing `@kitn.ai/blocks/forms` and nothing under src/forms/
// ever imports this barrel back (that would be a cycle).
export { renderHtmlForm, renderBinder, serializeTemplate, adaptRegistrationForBundler } from './html';
export type { HtmlFormOptions } from './html';
export { renderReactForm, handlerName } from './react';
export { renderVueForm } from './vue';
export { renderCdnFormFiles } from './cdn';
export { README_FILE, renderReadme } from './readme';
export type { FormFile };

/** kebab-or-plain block name to a react component name: support-widget -> SupportWidget.
 *  ONE definition, in src/registry.ts; this is the name the form callers use. */
export { pascal as componentName } from '../registry';

// ------------------------------------------------------------- the form axis

/**
 * Every delivery form a block can be rendered into -- THE list, derived by
 * consumers (the /blocks page's framework selector, the CLI's planner), never
 * hand-restated. `html` leads: it is the authored truth and the default tab.
 */
export const BLOCK_FORMS = [
  { id: 'html', label: 'HTML' },
  { id: 'react', label: 'React' },
  { id: 'vue', label: 'Vue' },
  { id: 'cdn', label: 'CDN single file' },
] as const;

export type BlockFormId = (typeof BLOCK_FORMS)[number]['id'];

/**
 * The forms that are a PROJECT SHAPE: a tree of files a consumer drops into a
 * build and compiles. THE list, and the only place `cdn` is named as the
 * exception, so a fourth form joins by being added to `BLOCK_FORMS` alone.
 *
 * `cdn` is out because it is one pasted file with no build step, no tsc
 * project and no install root. What would be checked about it is checked
 * where it lives instead: `verify:blocks [pins]` on the emitted artifact and
 * the block driver on the page it produces.
 */
export const FRAMEWORK_BLOCK_FORMS = BLOCK_FORMS.filter((form) => form.id !== 'cdn');

export function isBlockFormId(id: string): id is BlockFormId {
  return BLOCK_FORMS.some((form) => form.id === id);
}

// -------------------------------------------------------- the stripped twin

/**
 * Add a `<name>.js` twin beside every `<name>.ts` file the block ships.
 *
 * WHERE THE STRIP HAPPENS, and why not here: the controller is TypeScript and
 * the html and cdn forms land in contexts with no build step, so the types
 * have to come off. This package cannot strip them (it depends on nothing
 * that can) and neither can the renderer that runs on a consumer's machine:
 * `create-kai add` runs on Node >= 20.19, which predates
 * `module.stripTypeScriptTypes`. And "each caller strips with what it has"
 * makes this module's central claim false, because two strippers emit two
 * different files.
 *
 * So the strip runs ONCE, at generation time, with esbuild, and the twin
 * TRAVELS with the block: packages/ui/scripts/gen-blocks.mjs writes it into
 * the emitted item JSON, and packages/create-kai/scripts/build.mjs writes it
 * beside the copied source. Everything downstream just reads the file.
 */
export function withStrippedTwins(block: Block, strip: (source: string, fileName: string) => string): Block {
  const files = new Map(block.files);
  const manifestFiles = [...block.manifest.files];
  for (const entry of block.manifest.files) {
    if (!entry.path.endsWith('.ts')) continue;
    const twin = entry.path.replace(/\.ts$/, '.js');
    // The two halves are decided SEPARATELY, because they can disagree.
    // `create-kai`'s dist carries the twin as a FILE (its build wrote it) while
    // the manifest still lists only the authored sources, and one early return
    // covering both left the manifest entry off -- so `buildRegistryItem`,
    // which serializes the manifest, dropped a file the html form then refused
    // to render without. A twin already present wins: re-stripping it would be
    // the second stripper this design exists to avoid.
    if (!files.has(twin)) files.set(twin, strip(block.files.get(entry.path) ?? '', entry.path));
    if (!manifestFiles.some((f) => f.path === twin)) manifestFiles.push({ path: twin, type: 'registry:file' });
  }
  return { name: block.name, manifest: { ...block.manifest, files: manifestFiles }, files };
}

// ------------------------------------------------------- the form renderers

/** ONE dispatch over the form axis -- `gen-blocks.mjs` and the CLI planner
 *  both call this, so the two can never disagree about what a form contains. */
export function renderBlockForm(block: Block, form: BlockFormId, opts: { cdn: CdnFormOptions }): FormFile[] {
  switch (form) {
    case 'html': return renderHtmlForm(block);
    case 'react': return renderReactForm(block);
    case 'vue': return renderVueForm(block);
    case 'cdn': return renderCdnFormFiles(block, opts.cdn);
  }
}
