/**
 * The react delivery form: the typed wrappers from `@kitn.ai/ui/react` plus a
 * `useSyncExternalStore` adapter over the controller. This is the generator's
 * target as the contract spike hand-wrote and RAN it (report appendices A3 and
 * A4), so the shape below is evidence rather than taste.
 *
 * THREE NAMES ARE DERIVED, NOT TABLED. The wrapper component is PascalCase of
 * the tag minus `kai-`; the element interface is `Kai<Component>Element`; the
 * handler prop is `on` + PascalCase of the event minus `kai-`. All three hold
 * for every entry in the kit's element metadata, and
 * packages/ui/mcp/tests/blocks-artifacts.test.ts asserts it for every entry
 * rather than trusting this comment.
 *
 * NO REGISTRATION LINE, deliberately, and it is the one place this form
 * differs from every other: the wrappers self-register their own element and
 * their runtime re-applies props on `customElements.whenDefined`, so the
 * import and the await the other forms need would be noise here.
 */
import { parseTemplate, walkElements } from '../contract/parse-template';
import { analyzeController, crossCheckBindings } from '../contract/analyze-controller';
import { fileTarget } from '../targets';
import { pascal, type Block } from '../registry';
// Never './index': index.ts re-exports this module, so importing the barrel
// back is a cycle. The shared types live in ../contract/types for exactly
// this reason.
import type { Binding, FormFile, TemplateNode } from '../contract/types';

const camel = (name: string): string => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
const pascalTag = (tag: string): string => pascal(tag.replace(/^kai-/, ''));

/** `packages/ui/scripts/gen-element-react.mjs`'s `onName`, restated once and
 *  pinned against the original for every event the kit declares. */
export const handlerName = (event: string): string => `on${pascal(event.replace(/^kai-/, ''))}`;

const isKai = (tag: string): boolean => tag.startsWith('kai-');
const jsxText = (text: string): string => text.replace(/[{}]/g, (c) => `{'${c}'}`);
const read = (value: string, scope: string | undefined): string =>
  scope && value.startsWith(`${scope}.`) ? value : `state.${value}`;

/** The JSX prop NAME a literal attribute lands on. `data-*` and `aria-*` are
 *  verbatim: React takes them as authored, and camelCasing them invents a
 *  `dataTestid` / `ariaLabel` that is not on the wrappers' closed prop type,
 *  so the emitted file would not compile. */
function literalPropName(tag: string, name: string): string {
  if (name === 'class') return 'className';
  if (name === 'for') return 'htmlFor';
  if (name.startsWith('data-') || name.startsWith('aria-')) return name;
  return isKai(tag) && name !== 'slot' && name !== 'id' ? camel(name) : name;
}

/** A literal attribute as a JSX prop. */
function literalProp(tag: string, name: string, value: string): string {
  const prop = literalPropName(tag, name);
  if (value === '') return prop;
  // The kit's own documented "default-true flag off" idiom does not survive
  // translation: the generated prop is `boolean`, so the string has to become
  // one. Safe unconditionally because no element declares a prop whose type
  // union contains the string 'true' or 'false' -- and if one ever does, the
  // react compile cell fails on that line with TS2322, which is a better guard
  // than a list somebody maintains.
  if (isKai(tag) && (value === 'true' || value === 'false')) return `${prop}={${value}}`;
  return `${prop}="${value}"`;
}

function bindingProp(tag: string, b: Binding, scope: string | undefined, refExpr: (b: Binding) => string): string | null {
  switch (b.kind) {
    case 'prop':
      return b.name === 'textContent' ? null : `${b.name}={${read(b.value, scope)}}`;
    case 'attr':
      return `${isKai(tag) ? camel(b.name) : b.name}={${read(b.value, scope)}}`;
    case 'event':
      return `${handlerName(b.name)}={actions.${b.value}}`;
    case 'ref':
      return refExpr(b);
    case 'seed':
      return null; // a mount effect, never a re-applied prop (spec 8b, amendment 5)
  }
}

interface Emit {
  seeds: { ref: string; name: string; value: string }[];
  refNames: Set<string>;
}

function printNode(node: TemplateNode, pad: string, scope: string | undefined, emit: Emit): string {
  // A brace in text opens a JSX expression, so a literal one is emitted as
  // an expression holding the character. The predecessor refused the page
  // instead; there is no reason to, and refusing a page over an apostrophe's
  // neighbour is the kind of gap a consumer hits and cannot fix.
  if (node.type === 'text') return `${pad}${jsxText(node.text.trim())}`;
  if (node.type === 'comment') return `${pad}{/*${node.text.replace(/\*\//g, '* /')}*/}`;

  const tag = isKai(node.tag) ? pascalTag(node.tag) : node.tag;
  const refBinding = node.bindings.find((b) => b.kind === 'ref');
  const seedBindings = node.bindings.filter((b) => b.kind === 'seed');
  let seedRef: string | undefined;
  if (seedBindings.length) {
    seedRef = refBinding ? `refs.current.${refBinding.name}` : `seedRef${node.marker}.current`;
    if (!refBinding) emit.refNames.add(`seedRef${node.marker}`);
    for (const s of seedBindings) emit.seeds.push({ ref: seedRef, name: s.name, value: s.value });
  }

  // A repeated element opens the scope its subtree reads from: inside
  // `*for="row of rows"`, `row.title` is legal and `title` still means
  // `state.title`. It is resolved BEFORE the props below, because the
  // repeated element's OWN bindings (`:key`, `:unread="row.unread"`) sit
  // inside the `.map((row) => ...)` closure this emits too: reading them with
  // the outer scope emits `key={state.row.id}`, which does not compile.
  const childScope = node.repeat ? node.repeat.item : scope;

  const refExpr = (b: Binding): string => `ref={(el) => { refs.current.${b.name} = el; }}`;
  const bindingProps = node.bindings
    .map((b) => bindingProp(node.tag, b, childScope, refExpr))
    .filter((p): p is string => p !== null);
  // A LITERAL BESIDE ITS OWN BINDING is dropped, and the binding wins. The
  // authored page carries both when the literal is what the element shows
  // BEFORE registration, which the html form needs and React does not: a prop
  // applies on the first render. Emitting both is a duplicate JSX attribute.
  const bound = new Set(bindingProps.map((p) => p.split(/[={\s]/)[0]));
  const props = [
    ...(refBinding ? [] : seedRef ? [`ref={(el) => { seedRef${node.marker}.current = el; }}`] : []),
    ...node.attrs
      .filter((a) => !bound.has(literalPropName(node.tag, a.name)))
      .map((a) => literalProp(node.tag, a.name, a.value)),
    ...bindingProps,
  ];

  const textBinding = node.bindings.find((b) => b.kind === 'prop' && b.name === 'textContent');
  const children = textBinding
    ? [`${pad}  {${read(textBinding.value, childScope)}}`]
    : node.children.map((c) => printNode(c, `${pad}  `, childScope, emit)).filter(Boolean);

  const head = props.length > 3
    ? `${pad}<${tag}\n${props.map((p) => `${pad}  ${p}`).join('\n')}\n${pad}${children.length ? '>' : '/>'}`
    : `${pad}<${tag}${props.length ? ' ' : ''}${props.join(' ')}${children.length ? '>' : ' />'}`;
  const element = children.length ? `${head}\n${children.join('\n')}\n${pad}</${tag}>` : head;

  if (!node.repeat) return element;
  const inner = element.split('\n').map((l) => `  ${l}`).join('\n');
  return [
    `${pad}{${read(node.repeat.list, scope)}.map((${node.repeat.item}) => (`,
    inner.replace(`<${tag}`, `<${tag} key={${read(node.repeat.key, childScope)}}`),
    `${pad}))}`,
  ].join('\n');
}

export function renderReactForm(block: Block): FormFile[] {
  const pageEntry = block.manifest.files.find((f) => f.type === 'registry:page');
  if (!pageEntry) throw new Error(`${block.name}: no registry:page entry to render the react form from`);
  const parsed = parseTemplate(block.files.get(pageEntry.path) as string, `${block.name}/${pageEntry.path}`);
  if (!parsed.template) throw new Error(`${block.name}: ${parsed.errors.join('; ')}`);

  const name = pascal(block.name);
  const controllerPath = `${block.name}.controller.ts`;
  const controllerSource = block.files.get(controllerPath);
  if (controllerSource === undefined) throw new Error(`${block.name}: the react form needs ${controllerPath} (spec 3.2)`);
  const analysis = analyzeController(controllerSource, name, `${block.name}/${controllerPath}`);
  if (!analysis.shape) throw new Error(`${block.name}: ${analysis.errors.join('; ')}`);

  // The cross-check is not the gate's alone: `create-kai add` and `kai dev`
  // render without ever running checkBlockContracts, so it runs HERE too or
  // those two front doors emit a tree that calls a function nobody exports.
  const crossErrors = crossCheckBindings(parsed.template, analysis.shape, `${block.name}/${pageEntry.path}`);
  if (crossErrors.length) throw new Error(`${block.name}: ${crossErrors.join('; ')}`);

  // JSX has no string `style`, and there is no honest translation: parsing CSS
  // text into a style object is a second CSS implementation. Refused by name,
  // with the fix, rather than emitted as a file that does not compile.
  const styled = walkElements(parsed.template.body).find((el) => el.attrs.some((a) => a.name === 'style'));
  if (styled) {
    throw new Error(
      `${block.name}: ${pageEntry.path}:${styled.line}: <${styled.tag}> sets style="..." as a string, which JSX does not accept. Move the rule into the block stylesheet.`,
    );
  }

  const emit: Emit = { seeds: [], refNames: new Set() };
  // THE BLOCK ROOT, not the page. The authored page opens with a host
  // stand-in paragraph so the html and cdn forms are a runnable PAGE; a react
  // consumer is not installing a paragraph explaining that the page is a
  // stand-in. `data-block-root` marks the one element that IS the block, and
  // the marker attribute itself is dropped from the emitted tree.
  const root = parsed.template.blockRoot;
  const rootForEmit = { ...root, attrs: root.attrs.filter((a) => a.name !== 'data-block-root') };
  const body = printNode(rootForEmit, '    ', undefined, emit);
  // The wrappers this tree renders, walked over the ROOT SUBTREE and not read
  // off `template.kaiTags`, which is collected over the whole body: a kai
  // element sitting in the host chrome is not in the emitted tree, so
  // importing it would be an unused local and `noUnusedLocals` fails the
  // react compile cell on it.
  const components = [...new Set(walkElements([root]).filter((el) => isKai(el.tag)).map((el) => pascalTag(el.tag)))].sort();

  const hooks = [...(emit.seeds.length ? ['useEffect'] : []), ...(emit.refNames.size ? ['useRef'] : [])];
  const tsx = [
    `// GENERATED by @kitn.ai/blocks from ${block.name}.html and ${controllerPath}.`,
    `// It is your code now: edit freely, and regenerate to start over.`,
    // ONLY the hooks this file uses: `useEffect` is emitted for a seed and for
    // nothing else, so importing it unconditionally is TS6133 under the
    // `noUnusedLocals` a stock react-ts project turns on.
    ...(hooks.length ? [`import { ${hooks.join(', ')} } from 'react';`] : []),
    `import { ${components.join(', ')} } from '@kitn.ai/ui/react';`,
    `import { use${name} } from './use${name}';`,
    ...parsed.template.stylesheets.map((css) => `import './${css}';`),
    '',
    `export function ${name}() {`,
    `  const { state, actions, refs } = use${name}();`,
    ...[...emit.refNames].map((r) => `  const ${r} = useRef<HTMLElement | null>(null);`),
    ...(emit.seeds.length
      ? [
          '',
          '  // seed: written ONCE. A literal on a prop the element self-manages is',
          '  // a controlled-component trap in React, because the wrapper re-applies',
          '  // every prop after every render (spec 8b, amendment 5).',
          '  useEffect(() => {',
          ...emit.seeds.map((s) => `    ${s.ref}?.setAttribute('${s.name}', '${s.value}');`),
          '  }, []);',
        ]
      : []),
    '',
    '  return (',
    body,
    '  );',
    '}',
    '',
  ].join('\n');

  const hook = [
    `// GENERATED by @kitn.ai/blocks: the react adapter.`,
    `// useSyncExternalStore takes exactly the getter + subscribe pair the`,
    `// controller contract specifies, so this file is the whole adapter: no`,
    `// state mirrored, no effect re-deriving anything.`,
    `import { useEffect, useRef, useState, useSyncExternalStore } from 'react';`,
    // RefObject, not MutableRefObject: @types/react 19 deprecates
    // MutableRefObject and `useRef<T>(initial)` returns RefObject<T> there,
    // whose `.current` is mutable. The repo pins @types/react 19.
    `import type { RefObject } from 'react';`,
    `import {`,
    `  createController,`,
    `  type ${name}Actions,`,
    `  type ${name}Refs,`,
    `  type ${name}State,`,
    `} from './${block.name}.controller';`,
    '',
    `export interface Use${name} {`,
    `  state: ${name}State;`,
    `  actions: ${name}Actions;`,
    `  refs: RefObject<${name}Refs>;`,
    `}`,
    '',
    `export function use${name}(): Use${name} {`,
    `  // The refs object is stable and the controller reads it lazily, which is`,
    `  // why deps.refs is a getter: here the handles are still null.`,
    `  const refs = useRef<${name}Refs>({ ${analysis.shape.refNames.map((r) => `${r}: null`).join(', ')} });`,
    `  const [controller] = useState(() => createController({ refs: () => refs.current }));`,
    `  const state = useSyncExternalStore(controller.subscribe, controller.state, controller.state);`,
    '',
    `  useEffect(() => {`,
    `    void controller.actions.boot();`,
    `  }, [controller]);`,
    '',
    `  return { state, actions: controller.actions, refs };`,
    `}`,
    '',
  ].join('\n');

  const readme = [
    `# ${block.manifest.title}`,
    '',
    `${block.manifest.description}`,
    '',
    `Render it: \`import { ${name} } from './${name}';\``,
    ...(block.manifest.docs ? ['', block.manifest.docs] : []),
    '',
  ].join('\n');

  const files: FormFile[] = [];
  const put = (path: string, content: string): void => {
    files.push({ path, content, target: fileTarget('react', block.name, path) });
  };
  put(`${name}.tsx`, tsx);
  put(`use${name}.ts`, hook);
  put('README.md', readme);
  for (const entry of block.manifest.files) {
    if (entry.type === 'registry:page') continue;
    if (entry.path.endsWith('.js')) continue; // a generated twin; the react tree keeps the .ts
    put(entry.path, block.files.get(entry.path) as string);
  }
  return files;
}
