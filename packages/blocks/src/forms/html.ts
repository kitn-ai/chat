/**
 * The html delivery form: the authored page with its bindings taken OFF the
 * markup, plus a GENERATED binder that puts them back at runtime. This is the
 * form `create-kai add` writes into a project with no framework, and the form
 * the cdn single-file paste is inlined from.
 *
 * The binder is the only file in this repo with no typecheck behind it
 * anywhere, which is why so much of the contract is checked before it is
 * emitted (the grammar in parse-template, the action and ref names in
 * analyze-controller) and why `verify:blocks [html-binder]` re-checks the
 * emitted artifact.
 */
import { parseTemplate, walkElements } from '../contract/parse-template';
import { analyzeController, crossCheckBindings } from '../contract/analyze-controller';
import type { ControllerShape, FormFile, ParsedTemplate, TemplateNode } from '../contract/types';
import { fileTarget } from '../targets';
import { pascal, type Block } from '../registry';

// NO import from './index': index.ts re-exports this module, so a renderer
// importing the barrel is a cycle. `adaptRegistrationForBundler` therefore
// lives here (it is about this form's registration line) and index.ts
// re-exports it for the callers that already import it by name.
/**
 * Registration is rendered per delivery form. The authored block imports
 * `@kitn.ai/ui/autoloader`, which is a CDN / static-file tool by its own
 * header: it resolves element modules relative to its own URL, and through a
 * bundler every one of those fetches 404s (observed live: thirteen missing
 * `/assets/<element>.js` requests in a built vite app). The `add` forms land
 * in bundled projects, so their scripts register through the register-all
 * bundle instead; the CDN paste form keeps the autoloader, which is its
 * native pattern.
 */
export function adaptRegistrationForBundler(js: string): string {
  return js.replace(
    /import\s+['"]@kitn\.ai\/ui\/autoloader['"];?/g,
    `import '@kitn.ai/ui/elements'; // add form: register-all (the autoloader is CDN-only and 404s through a bundler)`,
  );
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** Emit ASCII: a generated file never carries a literal astral character. */
const ascii = (s: string): string =>
  [...s].map((ch) => (ch.codePointAt(0)! > 127 ? `&#x${ch.codePointAt(0)!.toString(16)};` : ch)).join('');
const escText = (s: string): string => ascii(s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
const escAttr = (s: string): string => ascii(s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));

function serializeNode(node: TemplateNode, pad: string): string {
  if (node.type === 'text') return `${pad}${escText(node.text.trim())}`;
  // A comment's text is VERBATIM, ASCII-folded and nothing else. parse5 does
  // not decode entities inside a comment (its content is not character data),
  // so running it through escText would escape what was never unescaped:
  // `<!-- a & b -->` becomes `<!-- a &amp; b -->` and an authored `&amp;`
  // becomes `&amp;amp;`, one round of corruption per render.
  if (node.type === 'comment') return `${pad}<!--${ascii(node.text)}-->`;
  const attrs = node.attrs.map((a) => (a.value === '' ? ` ${a.name}` : ` ${a.name}="${escAttr(a.value)}"`)).join('');
  const marker = node.marker === undefined ? '' : ` data-kai-b="${node.marker}"`;
  const open = `<${node.tag}${attrs}${marker}>`;
  const body = node.children.map((c) => serializeNode(c, `${pad}  `)).filter(Boolean).join('\n');
  const element = VOID_TAGS.has(node.tag)
    ? `${pad}${open.slice(0, -1)} />`
    : body
      ? `${pad}${open}\n${body}\n${pad}</${node.tag}>`
      : `${pad}${open}</${node.tag}>`;
  // A repeated element ships inside a <template>: the binder clones it once
  // per row and keys the clones. Templates never render, so the parent element
  // sees exactly the rows and nothing else.
  return node.repeat ? `${pad}<template data-kai-for="${node.marker}">\n${element.replace(/^/gm, '  ')}\n${pad}</template>` : element;
}

export function serializeTemplate(template: ParsedTemplate, opts: { entryScript: string }): string {
  const bodyAttrs = template.bodyAttrs.map((a) => (a.value === '' ? ` ${a.name}` : ` ${a.name}="${escAttr(a.value)}"`)).join('');
  return [
    '<!doctype html>',
    `<html lang="${escAttr(template.lang)}">`,
    '  <head>',
    template.headInner.trim().split('\n').map((l) => `  ${l.trim()}`).join('\n'),
    '  </head>',
    `  <body${bodyAttrs}>`,
    template.body.map((n) => serializeNode(n, '    ')).filter(Boolean).join('\n'),
    `    <script type="module" src="./${opts.entryScript}"></script>`,
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}

const jsString = (value: string): string => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** `state.field` or, inside a `*for`, `row.field`. */
const readOf = (value: string, scope: string | undefined): string =>
  scope && value.startsWith(`${scope}.`) ? value : `state.${value}`;

function applyLines(el: Extract<TemplateNode, { type: 'element' }>, target: string, scope: string | undefined): string[] {
  const out: string[] = [];
  for (const b of el.bindings) {
    switch (b.kind) {
      case 'prop':
        out.push(`  ${target}.${b.name} = ${readOf(b.value, scope)};`);
        break;
      case 'attr':
        out.push(`  setAttr(${target}, ${jsString(b.name)}, ${readOf(b.value, scope)});`);
        break;
      case 'event':
      case 'ref':
      case 'seed':
        break; // wired once, outside apply()
      default: {
        // A seventh binding kind must not be dropped here in silence: this
        // function decides what gets re-applied, and a kind nobody re-applies
        // is a binding that renders once and then goes stale.
        const never: never = b.kind;
        throw new Error(`applyLines: unhandled binding kind "${String(never)}"`);
      }
    }
  }
  return out;
}

export function renderBinder(opts: { blockName: string; template: ParsedTemplate; shape: ControllerShape }): string {
  const { template, shape } = opts;
  const elements = walkElements(template.body);

  // EVERY element inside a repeat subtree is wired INSIDE the row, never at
  // document scope. `walkElements` is FLAT: it returns a repeated element's
  // descendants too, so a loop that skipped only the repeated element would
  // still emit `at(9).textContent = ...` for a <span> that exists only inside
  // a <template>. `at(9)` is null there, and the first apply() throws.
  const rowScoped = new Set<number>();
  for (const el of elements) {
    if (!el.repeat) continue;
    for (const inner of walkElements(el.children)) {
      if (inner.marker !== undefined) rowScoped.add(inner.marker);
    }
  }
  const documentScope = elements.filter((el) => !el.repeat && (el.marker === undefined || !rowScoped.has(el.marker)));

  const refs = documentScope.flatMap((el) => el.bindings.filter((b) => b.kind === 'ref').map((b) => `${b.name}: at(${el.marker})`));
  const seeds: string[] = [];
  const listeners: string[] = [];
  const applies: string[] = [];
  const rowBlocks: string[] = [];

  for (const el of documentScope) {
    const target = `at(${el.marker})`;
    for (const b of el.bindings) {
      if (b.kind === 'seed') seeds.push(`setAttr(${target}, ${jsString(b.name)}, ${jsString(b.value)});`);
      if (b.kind === 'event') listeners.push(`${target}.addEventListener(${jsString(b.name)}, (event) => controller.actions.${b.value}(event));`);
    }
    applies.push(...applyLines(el, target, undefined));
  }

  for (const el of elements) {
    if (!el.repeat) continue;
    const n = el.marker as number;
    const rows = walkElements([el]); // the repeated element AND its descendants
    const setters = rows.flatMap((row) => applyLines(row, `inRow(node, ${row.marker})`, el.repeat!.item));
    const rowListeners = rows.flatMap((row) =>
      row.bindings.filter((b) => b.kind === 'event').map((b) => `      inRow(node, ${row.marker}).addEventListener(${jsString(b.name)}, (event) => controller.actions.${b.value}(event));`),
    );
    rowBlocks.push(
      [
        `const rowTemplate${n} = document.querySelector('template[data-kai-for="${n}"]');`,
        `const rowParent${n} = rowTemplate${n}.parentElement;`,
        `// \`state\` is a PARAMETER, not a closure read: a plain identifier`,
        `// inside a *for is legal and reads a State field, and this function`,
        `// is module-level, so \`state\` would otherwise be undefined here.`,
        `function applyRows${n}(rows, state) {`,
        `  const existing = new Map();`,
        `  for (const node of rowParent${n}.querySelectorAll(':scope > [data-kai-row="${n}"]')) existing.set(node.getAttribute('data-kai-key'), node);`,
        `  let prev = rowTemplate${n};`,
        `  for (const ${el.repeat.item} of rows) {`,
        `    const key = String(${el.repeat.key});`,
        `    let node = existing.get(key);`,
        `    if (node) existing.delete(key);`,
        `    else {`,
        `      node = rowTemplate${n}.content.firstElementChild.cloneNode(true);`,
        `      node.setAttribute('data-kai-row', '${n}');`,
        `      node.setAttribute('data-kai-key', key);`,
        ...rowListeners,
        `    }`,
        ...setters.map((l) => `  ${l}`),
        `    if (prev.nextElementSibling !== node) prev.after(node);`,
        `    prev = node;`,
        `  }`,
        `  for (const stale of existing.values()) stale.remove();`,
        `}`,
      ].join('\n'),
    );
    applies.push(`  applyRows${n}(state.${el.repeat.list}, state);`);
  }

  const body = [
    `// GENERATED by @kitn.ai/blocks (the html form's binder). Do not edit: edit`,
    `// ${opts.blockName}.html (the bindings) or ${opts.blockName}.controller.ts (the logic).`,
    `//`,
    `// It does three things. Register the elements this page uses and WAIT for`,
    `// them (an element created before its definition lands discards a property`,
    `// set on it, and the upgrade does not put it back). Wire every binding the`,
    `// page declared. Re-apply on every controller notification.`,
    `import '@kitn.ai/ui/autoloader';`,
    `import { createController } from './${opts.blockName}.controller.js';`,
    '',
    `const TAGS = [${template.kaiTags.map(jsString).join(', ')}];`,
    `await Promise.all(TAGS.map((tag) => customElements.whenDefined(tag)));`,
    '',
    `const at = (n) => document.querySelector(\`[data-kai-b="\${n}"]\`);`,
    `const inRow = (row, n) => (row.matches(\`[data-kai-b="\${n}"]\`) ? row : row.querySelector(\`[data-kai-b="\${n}"]\`));`,
    `// REMOVE on false/null/undefined and NOTHING ELSE. \`0\` and \`''\` are`,
    `// falsy and are legitimate attribute values; dropping count="0" because`,
    `// zero is falsy is a silent data loss. \`true\` writes the empty string,`,
    `// which is what a bare boolean attribute is.`,
    `const setAttr = (el, name, value) => {`,
    `  if (value === false || value === null || value === undefined) el.removeAttribute(name);`,
    `  else el.setAttribute(name, value === true ? '' : String(value));`,
    `};`,
    '',
    `const controller = createController({`,
    `  refs: () => ({ ${refs.join(', ')} }),`,
    `});`,
    '',
    ...(seeds.length
      ? [
          '// seed: written ONCE, after registration and before the first apply,',
          '// then never again. "After registration" is the honest wording: an',
          '// element that captures a prop at upgrade (kai-view-stack captures',
          '// `view` into initialView, in view-stack.tsx) has already captured',
          '// by the time this line runs, so a seed on such a prop acts as the',
          '// first NAVIGATION rather than as a deep link. That is the same',
          '// landing view here, and it is the behaviour to expect.',
          ...seeds,
          '',
        ]
      : []),
    ...(listeners.length ? ['// kai-* events do not bubble: every listener is on its own element.', ...listeners, ''] : []),
    ...(rowBlocks.length ? [...rowBlocks, ''] : []),
    `function apply() {`,
    `  const state = controller.state();`,
    ...applies,
    `}`,
    '',
    `controller.subscribe(apply);`,
    `apply();`,
    `await controller.actions.boot();`,
    '',
    `// The block driver's readiness convention: ONE constant across every`,
    `// block and every scenario (packages/ui/scripts/block-driver/).`,
    `window.__blockReady = true;`,
    '',
  ].join('\n');

  void shape; // validated by the caller; nothing in the emitted body reads it
  return body;
}

export function renderHtmlForm(block: Block): FormFile[] {
  const pageEntry = block.manifest.files.find((f) => f.type === 'registry:page');
  if (!pageEntry) throw new Error(`${block.name}: no registry:page entry to render the html form from`);
  const pageHtml = block.files.get(pageEntry.path) as string;

  const parsed = parseTemplate(pageHtml, `${block.name}/${pageEntry.path}`);
  if (!parsed.template) throw new Error(`${block.name}: ${parsed.errors.join('; ')}`);

  const name = pascal(block.name);
  const controllerPath = `${block.name}.controller.ts`;
  const controllerSource = block.files.get(controllerPath);
  if (controllerSource === undefined) {
    throw new Error(`${block.name}: the html form needs ${controllerPath} (spec 3.2)`);
  }
  const analysis = analyzeController(controllerSource, name, `${block.name}/${controllerPath}`);
  if (!analysis.shape) throw new Error(`${block.name}: ${analysis.errors.join('; ')}`);
  // The gate is not the only caller: `create-kai add` and `kai dev` render
  // without ever running checkBlockContracts, so the cross-check runs HERE too
  // or those two front doors emit a binder that calls a missing action.
  const crossErrors = crossCheckBindings(parsed.template, analysis.shape, `${block.name}/${pageEntry.path}`);
  if (crossErrors.length) throw new Error(`${block.name}: ${crossErrors.join('; ')}`);

  const entryScript = `${block.name}.js`;
  const files: FormFile[] = [];
  const put = (path: string, content: string): void => {
    files.push({ path, content, target: fileTarget('html', block.name, path) });
  };

  put(pageEntry.path, serializeTemplate(parsed.template, { entryScript }));
  put(entryScript, adaptRegistrationForBundler(renderBinder({ blockName: block.name, template: parsed.template, shape: analysis.shape })));

  for (const entry of block.manifest.files) {
    if (entry.type === 'registry:page') continue;
    if (entry.path.endsWith('.js')) continue; // a twin; emitted beside its .ts below
    if (entry.path.endsWith('.ts')) {
      const twin = entry.path.replace(/\.ts$/, '.js');
      const stripped = block.files.get(twin);
      if (stripped === undefined) {
        throw new Error(
          `${block.name}: ${twin} is missing. The html form ships JavaScript, and the stripped twin is written at generation time by packages/ui/scripts/gen-blocks.mjs (esbuild) or packages/create-kai/scripts/build.mjs. Run a build.`,
        );
      }
      put(twin, adaptRegistrationForBundler(stripped));
      continue;
    }
    put(entry.path, block.files.get(entry.path) as string);
  }
  return files;
}
