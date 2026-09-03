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
 *   - `react`— the react form: the page body as JSX, the entry script wrapped
 *              into `initBlock()`, JSX typings derived from the markup.
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
import { generateCdnForm, pascal, type Block, type CdnFormOptions } from '../registry';
import { fileTarget } from '../targets';
import type { FormFile } from '../contract/types';
import { adaptRegistrationForBundler, renderHtmlForm } from './html';

// The renderers live in their own modules and are re-exported HERE, so every
// caller keeps importing `@kitn.ai/blocks/forms` and nothing under src/forms/
// ever imports this barrel back (that would be a cycle).
export { renderHtmlForm, renderBinder, serializeTemplate, adaptRegistrationForBundler } from './html';
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

const posixBasename = (p: string): string => p.split('/').pop() as string;

/** The page's module-script entries, in order (`./name.js` only). */
export function moduleScriptsIn(pageHtml: string): string[] {
  return [...pageHtml.matchAll(/<script\s+type="module"\s+src="\.\/([^"]+)"\s*><\/script>/g)].map((m) => m[1]);
}

/** The page's relative stylesheet links, in order. */
export function stylesheetsIn(pageHtml: string): string[] {
  return [...pageHtml.matchAll(/<link\s+rel="stylesheet"\s+href="\.\/([^"]+)"\s*\/?>/g)].map((m) => m[1]);
}

// ------------------------------------------------------------ react pieces
// (moved verbatim from create-kai's react-form.ts, which now re-exports them
// — the original rationale comments travel with each function.)

/** Every `kai-*` tag the markup renders, sorted, deduped - the d.ts roster. */
export function kaiTagsIn(html: string): string[] {
  return [...new Set([...html.matchAll(/<(kai-[\w-]+)/g)].map((m) => m[1]))].sort();
}

const VOID_TAGS = /<(img|br|hr|input|source|track|wbr)(\s[^>]*[^/>])?>/g;

/**
 * The page body as JSX. Mechanical and conservative: anything this cannot
 * translate faithfully is an ERROR, never a silent approximation - a react
 * file that renders almost the block is worse than a refusal that names why.
 */
export function bodyToJsx(pageHtml: string): { jsx?: string; errors: string[] } {
  const errors: string[] = [];
  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/.exec(pageHtml);
  if (!bodyMatch) return { errors: ['the block page has no <body>; the react form renders the body as JSX'] };
  let body = bodyMatch[1];

  // The behavior script leaves the markup: the component's mount effect runs it.
  body = body.replace(/<script\b[\s\S]*?<\/script>\s*/g, '');

  if (/[{}]/.test(body)) {
    errors.push('the block page body contains { or }, which this JSX translation does not escape; rewrite the block markup without literal braces');
  }
  if (/\sstyle="/.test(body)) {
    errors.push('the block page body sets style="..." as a string, which JSX does not accept; move the rule into the block stylesheet');
  }

  body = body
    .replace(/<!--([\s\S]*?)-->/g, (_, text: string) => `{/*${text.replace(/\*\//g, '* /')}*/}`)
    .replace(/\bclass="/g, 'className="')
    .replace(/\sfor="/g, ' htmlFor="')
    .replace(VOID_TAGS, (_, tag: string, attrs: string | undefined) => `<${tag}${attrs ?? ''} />`);

  if (errors.length) return { errors };
  const indented = body
    .trim()
    .split('\n')
    .map((line) => (line.trim().length ? `      ${line.replace(/^ {4}/, '')}` : ''))
    .join('\n');
  return { jsx: `    <>\n${indented}\n    </>`, errors };
}

/** Imports hoisted off a leaf entry script, or the reason it is not one. */
function splitImports(js: string): { imports?: string[]; body?: string[]; errors: string[] } {
  if (/^export\s/m.test(js)) {
    return { errors: ['the block entry script has exports of its own; add wraps a leaf entry script and cannot preserve exports'] };
  }
  const imports: string[] = [];
  const body: string[] = [];
  for (const line of js.split('\n')) {
    if (/^import\s.*['"][^'"]+['"];?\s*$/.test(line.trim())) imports.push(line);
    else body.push(line);
  }
  const stray = body.findIndex((line) => /^\s*import\s/.test(line));
  if (stray >= 0) {
    return { errors: [`the block entry script has a multi-line import ("${body[stray].trim()}"), which this wrap does not hoist; write block imports on one line`] };
  }
  return { imports, body, errors: [] };
}

/**
 * Wrap the block's entry script into `export async function initBlock()`.
 * Imports hoist (they must stay module-level); everything else moves inside,
 * so each call re-queries the DOM it is given. A script that already exports
 * something is not an entry script and is refused by name.
 */
export function wrapEntryScript(js: string): { code?: string; errors: string[] } {
  const split = splitImports(js);
  if (split.errors.length) return { errors: split.errors };
  return {
    code: [
      ...(split.imports as string[]),
      '',
      '// Wrapped for the react form by create-kai add: the page markup is rendered',
      '// by the component in the sibling .tsx file, and this runs after mount.',
      'export async function initBlock() {',
      ...(split.body as string[]).map((line) => (line.length ? `  ${line}` : '')),
      '}',
      '',
    ].join('\n'),
    errors: [],
  };
}

/**
 * Wrap the block's entry script for the WEB-COMPONENT add form: same hoist,
 * body inside an async IIFE instead of an export.
 *
 * WHY THE BODY CANNOT STAY AT MODULE SCOPE: the authored script top-level
 * `await`s `customElements.whenDefined`. Through a consumer bundler the
 * register-impl chunk imports shared modules out of the ENTRY chunk, and an
 * importer of a top-level-awaiting module waits for that module to settle -
 * so registration waits on the entry, the entry waits on registration, and
 * the page renders nothing with no error anywhere (observed live in a built
 * vite app: the register-impl chunk's module eval never completes). An async
 * IIFE lets the module graph finish evaluating; the body still awaits
 * registration INSIDE the function, where nothing imports it.
 */
export function wrapHtmlEntryScript(js: string): { code?: string; errors: string[] } {
  const split = splitImports(js);
  if (split.errors.length) return { errors: split.errors };
  return {
    code: [
      ...(split.imports as string[]),
      '',
      '// Wrapped by create-kai add: through a bundler, a top-level await here can',
      '// deadlock against element registration sharing chunks with this entry, so',
      '// the block body runs in an async function instead.',
      '(async () => {',
      ...(split.body as string[]).map((line) => (line.length ? `  ${line}` : '')),
      '})();',
      '',
    ].join('\n'),
    errors: [],
  };
}

/** The component module: markup + the mount effect that starts the block script. */
export function renderComponent(opts: {
  blockName: string;
  jsx: string;
  /** the entry script's emitted file name, e.g. `support-widget.js` */
  entryScript: string;
  /** stylesheet file names the page linked, imported by the component */
  stylesheets: readonly string[];
}): string {
  const name = pascal(opts.blockName);
  return [
    `// GENERATED by create-kai add ${opts.blockName}, from the block's web-component form.`,
    '// It is your code now: edit freely. The markup below is the block page body;',
    `// the behavior lives in ./${opts.entryScript} and starts after mount.`,
    `import { useEffect } from 'react';`,
    `import { registerAll } from '@kitn.ai/ui/react';`,
    ...opts.stylesheets.map((css) => `import './${css}';`),
    '',
    `export default function ${name}() {`,
    '  useEffect(() => {',
    '    let stopped = false;',
    '    // Register every kai-* element, then run the block script against the mounted DOM.',
    '    registerAll();',
    `    void import('./${opts.entryScript}').then((mod) => {`,
    '      if (!stopped) void mod.initBlock();',
    '    });',
    '    return () => {',
    '      stopped = true;',
    '    };',
    '  }, []);',
    '  return (',
    opts.jsx,
    '  );',
    '}',
    '',
  ].join('\n');
}

/** JSX typings for the tags the block renders, valid under @types/react 18 and 19. */
export function renderJsxTypings(tags: readonly string[]): string {
  const rows = tags.map((tag) => `      '${tag}': KaiElementAttrs;`);
  return [
    '// GENERATED by create-kai add: JSX typings for the kai-* elements this block',
    '// renders, derived from its markup. Loose on purpose: attributes flow through',
    '// as authored, and array/object props are set by the block script as JS',
    '// properties, never as attributes.',
    `import type * as React from 'react';`,
    '',
    'type KaiElementAttrs = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {',
    '  [attribute: string]: unknown;',
    '};',
    '',
    `declare module 'react' {`,
    '  namespace JSX {',
    '    interface IntrinsicElements {',
    ...rows,
    '    }',
    '  }',
    '}',
    '',
    'declare global {',
    '  namespace JSX {',
    '    interface IntrinsicElements {',
    ...rows,
    '    }',
    '  }',
    '}',
    '',
  ].join('\n');
}

/** The typing stub that lets the tsx dynamic-import a plain .js entry under strict. */
export function renderEntryTypings(entryScript: string): string {
  return [
    `// GENERATED by create-kai add: types for ./${entryScript}, so the component's`,
    '// dynamic import typechecks under strict without allowJs.',
    'export function initBlock(): Promise<void>;',
    '',
  ].join('\n');
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
 * The react form: the page replaced by a generated `<Name>.tsx` component,
 * the entry script wrapped into `initBlock()`, plus the two derived typing
 * files. Throws with the reason when the page cannot be rendered faithfully.
 */
export function renderReactForm(block: Block): FormFile[] {
  const pageEntry = block.manifest.files.find((f) => f.type === 'registry:page');
  if (!pageEntry) throw new Error(`${block.name}: no registry:page entry to render the react form from`);
  const pageHtml = block.files.get(pageEntry.path) as string;

  const scriptNames = moduleScriptsIn(pageHtml);
  if (scriptNames.length !== 1) {
    throw new Error(`${block.name}: the react form needs exactly one module script on the page, found ${scriptNames.length}`);
  }
  const entryScript = scriptNames[0];
  const stylesheets = stylesheetsIn(pageHtml);

  const jsx = bodyToJsx(pageHtml);
  if (jsx.errors.length) throw new Error(`${block.name}: ${jsx.errors.join('; ')}`);
  const wrapped = wrapEntryScript(block.files.get(entryScript) ?? '');
  if (wrapped.errors.length) throw new Error(`${block.name}: ${wrapped.errors.join('; ')}`);

  const files: FormFile[] = [];
  for (const entry of block.manifest.files) {
    if (entry.type === 'registry:page') continue; // the tsx component IS the page here
    const name = entry.target ?? posixBasename(entry.path);
    const raw =
      entry.path === entryScript ? (wrapped.code as string) : (block.files.get(entry.path) as string);
    files.push({
      path: name,
      content: entry.path.endsWith('.js') ? adaptRegistrationForBundler(raw) : raw,
      target: fileTarget('react', block.name, name),
    });
  }
  // PascalCase on purpose, and not only as react convention: the component
  // must NOT share a basename with the entry script, or `bundler` resolution
  // maps the tsx's own `import('./<entry>.js')` back onto the tsx itself
  // (js -> tsx substitution) instead of the script's .d.ts.
  const componentFileName = `${pascal(block.name)}.tsx`;
  files.push({
    path: componentFileName,
    content: renderComponent({ blockName: block.name, jsx: jsx.jsx as string, entryScript, stylesheets }),
    target: fileTarget('react', block.name, componentFileName),
  });
  files.push({
    path: 'kai-elements.d.ts',
    content: renderJsxTypings(kaiTagsIn(pageHtml)),
    target: fileTarget('react', block.name, 'kai-elements.d.ts'),
  });
  const entryTypesName = entryScript.replace(/\.js$/, '.d.ts');
  files.push({
    path: entryTypesName,
    content: renderEntryTypings(entryScript),
    target: fileTarget('react', block.name, entryTypesName),
  });
  return files;
}

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
