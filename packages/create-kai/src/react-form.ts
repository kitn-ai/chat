/**
 * The react variant of a block (`create-kai add` in a react project).
 *
 * Blocks are authored once, framework-neutral: a page of `kai-*` elements plus
 * an imperative entry script (spec 2026-08-31, Part 3). This module RENDERS
 * that one source for a react host. What it emits, and why the shape is this
 * one and not a full wrapper rewrite:
 *
 *   - `<Name>.tsx`: the page BODY as JSX, custom-element tags kept as tags.
 *     The typed-wrapper rewrite the spec ultimately wants (`Chat`, `Message`,
 *     typed `onKai*` props) is blocked by a real gap in the published runtime:
 *     `frameworks/react/runtime.tsx` forwards only `className` / `style` /
 *     `id` to the host element, so a wrapper cannot carry `slot="panel"` or a
 *     bare `hidden` - and a block's chrome is MADE of slotted elements. Until
 *     the runtime forwards those, a wrapper rewrite of any real block cannot
 *     render. The tsx still imports `registerAll` from `@kitn.ai/ui/react`
 *     (the typed entry, eager registration); the wrapper rewrite lands when
 *     the runtime gap closes, not by working around it here.
 *   - `kai-elements.d.ts`: JSX typings for exactly the `kai-*` tags the block
 *     renders, derived from the markup, never hand-listed. Declared on both
 *     the `react` module's JSX namespace (@types/react 19) and the global one
 *     (@types/react 18), so the same emit compiles under either.
 *   - the entry script wrapped into `export async function initBlock()`, run
 *     from the component's mount effect. Module scope would run before the
 *     DOM exists (`getElementById` all null); a function called after mount
 *     sees the rendered page, and re-querying per call is what keeps
 *     StrictMode's double-mount from wiring a discarded tree.
 *   - a sibling `.d.ts` for that script, so the tsx's dynamic import of a
 *     plain `.js` module typechecks under `strict` without `allowJs`.
 *
 * Everything here is pure string-to-string, tested directly; the caller owns
 * the filesystem.
 */

/** kebab-or-plain block name to a react component name: support-widget -> SupportWidget. */
export function componentName(blockName: string): string {
  return blockName
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
}

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
export function wrapWcEntryScript(js: string): { code?: string; errors: string[] } {
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
  const name = componentName(opts.blockName);
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
