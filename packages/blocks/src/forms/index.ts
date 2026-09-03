/**
 * The DELIVERY FORMS of a block — one renderer, shared by every front door.
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
 *   - `cdn`  — the single-file CDN paste form, rendered by `registry.ts`'s
 *              `generateCdnForm` (imports pinned onto the published entries).
 *
 * ONE RENDERER, TWO CALLERS, by the same precedent as `registry.ts`:
 * `create-kai` bundle-imports this module (`src/react-form.ts` re-exports it,
 * `src/blocks.ts` plans writes over it), and the `kai dev` gallery serves the
 * identical output per framework over GET /gallery/api/form/. A drift between
 * "what the gallery shows" and "what add writes" is therefore a build failure,
 * never a runtime surprise.
 *
 * DISCIPLINE — pure functions over injected data, no `node:*` imports, same
 * as `registry.ts`: this file typechecks under the package's browser tsconfig
 * (the gallery page imports `BLOCK_FORMS` directly) and bundles into the CLI.
 */
import { generateCdnForm, type Block, type CdnFormOptions } from '../registry';
import type { FormFile } from '../contract/types';
import { renderHtmlForm } from './html';
import { renderReactForm } from './react';

// The renderers live in their own modules and are re-exported HERE, so every
// caller keeps importing `@kitn.ai/blocks/forms` and nothing under src/forms/
// ever imports this barrel back (that would be a cycle).
export { renderHtmlForm, renderBinder, serializeTemplate, adaptRegistrationForBundler } from './html';
export { renderReactForm, handlerName } from './react';
export type { FormFile };

/** kebab-or-plain block name to a react component name: support-widget -> SupportWidget.
 *  ONE definition, in src/registry.ts; this is the name the form callers use. */
export { pascal as componentName } from '../registry';

// ------------------------------------------------------------- the form axis

/**
 * Every delivery form a block can be rendered into — THE list, derived by
 * consumers (the gallery's framework selector, the CLI's planner), never
 * hand-restated. `html` leads: it is the authored truth and the default tab.
 */
export const BLOCK_FORMS = [
  { id: 'html', label: 'HTML' },
  { id: 'react', label: 'React' },
  { id: 'cdn', label: 'CDN single file' },
] as const;

export type BlockFormId = (typeof BLOCK_FORMS)[number]['id'];

export function isBlockFormId(id: string): id is BlockFormId {
  return BLOCK_FORMS.some((form) => form.id === id);
}

/** The page's module-script entries, in order (`./name.js` only). */
export function moduleScriptsIn(pageHtml: string): string[] {
  return [...pageHtml.matchAll(/<script\s+type="module"\s+src="\.\/([^"]+)"\s*><\/script>/g)].map((m) => m[1]);
}

/** The page's relative stylesheet links, in order. */
export function stylesheetsIn(pageHtml: string): string[] {
  return [...pageHtml.matchAll(/<link\s+rel="stylesheet"\s+href="\.\/([^"]+)"\s*\/?>/g)].map((m) => m[1]);
}

// ------------------------------------------------------------- kai tag scan

/** Every `kai-*` tag the markup renders, sorted, deduped. A STRING scan, kept
 *  for the callers that hold raw page html and no parsed template; the react
 *  renderer walks the parsed block root instead, because the page carries host
 *  chrome the emitted tree does not. */
export function kaiTagsIn(html: string): string[] {
  return [...new Set([...html.matchAll(/<(kai-[\w-]+)/g)].map((m) => m[1]))].sort();
}

// -------------------------------------------------------- the stripped twin

/**
 * Add a `<name>.js` twin beside every `<name>.ts` file the block ships.
 *
 * WHERE THE STRIP HAPPENS, and why not here: the controller is TypeScript and
 * the html and cdn forms land in contexts with no build step, so the types
 * have to come off. This package cannot strip them (it depends on nothing
 * that can) and neither of the two RUNTIME renderers can either: the kai dev
 * gallery route runs inside the published @kitn.ai/ui CLI (esbuild is a
 * devDependency there) and `create-kai add` runs on Node >= 20.19, which
 * predates `module.stripTypeScriptTypes`. And "each caller strips with what it
 * has" makes this module's central claim false, because two strippers emit two
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
    if (files.has(twin)) continue;
    files.set(twin, strip(block.files.get(entry.path) ?? '', entry.path));
    manifestFiles.push({ path: twin, type: 'registry:file' });
  }
  return { name: block.name, manifest: { ...block.manifest, files: manifestFiles }, files };
}

// ------------------------------------------------------- the form renderers

/**
 * The CDN single-file form: `generateCdnForm`'s output as one `<name>.html`.
 * A block that composes OTHER blocks cannot be a single paste file, and the
 * refusal names that rather than emitting a partial composition.
 */
export function renderCdnFormFiles(block: Block, opts: CdnFormOptions): FormFile[] {
  if ((block.manifest.registryDependencies ?? []).some((dep) => !dep.startsWith('route:'))) {
    throw new Error(
      `${block.name} composes other blocks, and the single-file paste form cannot carry them yet; run \`create-kai add\` inside a project instead`,
    );
  }
  const form = generateCdnForm(block, opts);
  if (!form.html) throw new Error(`${block.name}: the paste form cannot be generated: ${form.errors.join('; ')}`);
  return [{ path: `${block.name}.html`, content: form.html, target: `${block.name}.html` }];
}

/** ONE dispatch over the form axis — the gallery route and the CLI planner
 *  both call this, so the two can never disagree about what a form contains. */
export function renderBlockForm(block: Block, form: BlockFormId, opts: { cdn: CdnFormOptions }): FormFile[] {
  switch (form) {
    case 'html': return renderHtmlForm(block);
    case 'react': return renderReactForm(block);
    case 'cdn': return renderCdnFormFiles(block, opts.cdn);
  }
}
