/**
 * The solid delivery form: custom elements directly, gated on `<Show
 * when={ready()}>`, plus a `createSignal` adapter over the controller's
 * snapshot.
 *
 * SPEC 3.6, OPTION (a). The set of elements with no Solid component to reach
 * for is ALL of them, and the reasons are mechanical: the shared controller
 * types its refs as the ELEMENT interfaces (`KaiDockElement`), which a Solid
 * component does not hand back, and the `kai-` events are dispatched by the
 * element facade in `src/elements/`, not by the Solid component underneath
 * it, so `on:kai-click` on a Solid component would silently never fire. This
 * renderer is over the shared preamble in `./emit`, the same as vue.ts,
 * svelte.ts and angular.ts.
 *
 * NO REGISTRATION-ELEMENT SHIM NEEDED FOR JSX ITSELF: Solid's compiler
 * treats any dashed tag name as an intrinsic element without configuration.
 * What it DOES need is the kit's `solid-js/jsx-runtime` augmentation (PR B2
 * Task 1) for `JSX.IntrinsicElements['kai-dock']` to exist at all -- proven
 * red by watching the compile cell fail with that augmentation disabled
 * (Task 6 Step 6).
 *
 * REFS ARE PLAIN `let`s, not signals: the controller reads them lazily
 * through a getter, so nothing here needs to be reactive. An unannotated
 * `ref` callback is TS7006 under the kit's generic JSX augmentation, so every
 * ref callback below carries an explicit parameter type.
 *
 * `<For>` TAKES NO KEY: it is reference-keyed by the row object itself, so
 * the authored `:key` has no expression to become in this form. Rather than
 * silently dropping it, the emitted file says so at the site (this is the
 * corollary the repo calls "decide loudly").
 *
 * CONTROLLER RULING B2-T3-a, restated here because this renderer implements
 * it: a seed never disappears. A seed whose target name is also claimed by a
 * prop/attr binding or a literal attribute on the SAME element cannot stay a
 * static attribute -- Solid would compile two entries against the same DOM
 * property/attribute -- so it applies instead as a one-time `setAttribute` on
 * that element's ref, inside `onMount`, after `setReady(true)` and before
 * `boot()`. Solid's signal writes flush to the DOM synchronously (outside a
 * `batch()`), so the `<Show>`-gated tree, and every ref inside it, is already
 * populated by the time the code right after `setReady(true)` runs -- even
 * though that line sits inside an async `onMount` callback. A non-colliding
 * seed stays a plain static attribute, same as every other form.
 */
import { fileTarget } from '../targets';
import { README_FILE, renderReadme } from './readme';
import { camel, carriedFiles, elementInterface, escapeAttr, isKai, parseBlock } from './emit';
import type { Block } from '../registry';
import type { Binding, FormFile, TemplateNode } from '../contract/types';

type ElementNode = Extract<TemplateNode, { type: 'element' }>;

/** A JS single-quoted string literal, for the adapter's own `setAttribute`
 *  calls (a JS context, not a JSX attribute -- `escapeAttr` is the wrong
 *  escaper here). */
const jsString = (value: string): string => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** Literal text in the template. `{`, `}`, `<` and `>` each open or close a
 *  JSX construct on their own (an expression, or a tag), so every one is
 *  emitted as a JSX expression holding the literal character -- the same
 *  device react.ts's `jsxText` uses. `&` needs nothing: JSX text takes it
 *  literally. */
function jsxText(text: string): string {
  return text.replace(/[{}<>]/g, (c) => `{'${c}'}`);
}

/** A comment's text, emitted as a JSX comment. A star-slash cannot occur in an
 *  AUTHORED HTML comment (the parser that read the page would have already
 *  closed it on `-->` first), but this is defensive in the same spirit as
 *  every other renderer's own comment-closer guard: never trust that every
 *  path into a comment node went through that parser. */
function escapeComment(text: string): string {
  return text.replace(/\*\//g, '* /');
}

/** The JSX prop NAME a binding or literal lands on. Camel for a kai element,
 *  because the kit's generic solid-js JSX augmentation types every kai prop
 *  through `prop:`/`on:` namespaces that read the camelCase property or the
 *  raw event name; verbatim otherwise, which is what a plain element's
 *  attribute is. */
function propName(tag: string, name: string): string {
  return isKai(tag) ? camel(name) : name;
}

const read = (value: string, scope: string | undefined): string =>
  scope && value.startsWith(`${scope}.`) ? value : `state().${value}`;

/** A literal attribute in the template. A bare boolean and a `="true"` /
 *  `="false"` on a kai element become bound `prop:` expressions (spec 8b,
 *  amendment 8 (F-10)): the generated property is `boolean`, and a plain
 *  attribute stringifies -- `unread="false"` would read as true. On a plain
 *  element it stays a real attribute, which is what it is in HTML. */
function literalProp(tag: string, name: string, value: string): string {
  if (!isKai(tag)) return value === '' ? name : `${name}="${escapeAttr(value)}"`;
  if (value === '') return `prop:${propName(tag, name)}={true}`;
  if (value === 'true' || value === 'false') return `prop:${propName(tag, name)}={${value}}`;
  return `${name}="${escapeAttr(value)}"`;
}

/** One binding as a solid JSX prop. */
function bindingProp(tag: string, b: Binding, scope: string | undefined, refType: string): string | null {
  switch (b.kind) {
    case 'prop':
      // `.textContent` is emitted as CHILDREN. `prop:` sets the DOM property,
      // which for a custom element is the only spelling that carries a
      // non-string value at all.
      return b.name === 'textContent' ? null : `prop:${propName(tag, b.name)}={${read(b.value, scope)}}`;
    case 'attr':
      // A PROPERTY on a kai element, the rule react set first: solid's `attr:`
      // stringifies, so a bound `false` would write unread="false" and the
      // element would read it as true. A plain element keeps the ordinary JSX
      // prop, which is where solid's own HTML typings apply.
      return isKai(tag)
        ? `prop:${propName(tag, b.name)}={${read(b.value, scope)}}`
        : `${b.name}={${read(b.value, scope)}}`;
    case 'event':
      // `on:name` is addEventListener with the exact name, which is what a
      // non-bubbling kai- event needs. Solid's lower-cased `onname` delegation
      // would not reach it.
      return `on:${b.name}={actions.${b.value}}`;
    case 'ref':
      // The annotation is not decoration: without it this is TS7006.
      return `ref={(el: ${refType}) => { ${b.value} = el; }}`;
    case 'seed':
      // Handled by the caller: a non-colliding seed formats through
      // `literalProp` so it keeps its authored position and true/false
      // treatment, and a colliding one is filtered out before this runs.
      return null;
  }
}

/** A seed the JSX cannot carry as a static attribute: something else on the
 *  same element already claims its name. `ref` names the plain `let` (an
 *  existing `#ref`, or a synthetic one this renderer invents) whose
 *  `setAttribute` call the adapter emits. */
interface CollidingSeed {
  ref: string;
  name: string;
  value: string;
}

interface Emit {
  collidingSeeds: CollidingSeed[];
  /** Synthetic ref name -> element interface, for an element with a
   *  colliding seed and no authored `#ref` to reuse. */
  extraRefs: Map<string, string>;
  /** Whether the tree repeats at all: `For` is imported only when it does,
   *  because `noUnusedLocals` is on in a stock solid-ts project. */
  usesFor: boolean;
}

function printElement(node: ElementNode, pad: string, scope: string | undefined, emit: Emit): string {
  const tag = node.tag;
  const refType = elementInterface(tag);

  const boundNames = new Set(
    node.bindings.filter((b) => b.kind === 'prop' || b.kind === 'attr').map((b) => propName(tag, b.name)),
  );
  const literalAttrs = node.attrs
    .filter((a) => !boundNames.has(propName(tag, a.name)))
    .map((a) => literalProp(tag, a.name, a.value));

  // CONTROLLER RULING B2-T3-a: a seed never disappears. See the module
  // header; this is the same collision test every other component-framework
  // renderer runs.
  const claimedNames = new Set([...boundNames, ...node.attrs.map((a) => propName(tag, a.name))]);
  const refBinding = node.bindings.find((b) => b.kind === 'ref');
  const collidingSeeds = node.bindings.filter((b) => b.kind === 'seed' && claimedNames.has(propName(tag, b.name)));
  let syntheticRef: string | undefined;
  if (collidingSeeds.length && !refBinding) {
    syntheticRef = `seedRef${node.marker}`;
    emit.extraRefs.set(syntheticRef, refType);
  }
  const seedRef = refBinding?.name ?? syntheticRef;
  for (const b of collidingSeeds) {
    emit.collidingSeeds.push({ ref: seedRef as string, name: b.name, value: b.value });
  }

  // Every binding IN AUTHORED ORDER, so `#ref`, `seed:`, `.prop` and `@event`
  // interleave the way they were written. A non-colliding seed formats
  // through `literalProp`, matching svelte.ts's approach, so it gets the same
  // true/false literal treatment an authored attribute would.
  const orderedProps = node.bindings
    .filter((b) => !collidingSeeds.includes(b))
    .map((b) => (b.kind === 'seed' ? literalProp(tag, b.name, b.value) : bindingProp(tag, b, scope, refType)))
    .filter((p): p is string => p !== null);

  const attrs = [
    ...(syntheticRef ? [`ref={(el: ${refType}) => { ${syntheticRef} = el; }}`] : []),
    ...literalAttrs,
    ...orderedProps,
  ];

  const textBinding = node.bindings.find((b) => b.kind === 'prop' && b.name === 'textContent');

  // No attrs and a single text expression: the fully inline form, matching
  // what a hand-authored component looks like for a leaf node.
  if (attrs.length === 0 && textBinding) {
    return `${pad}<${tag}>{${read(textBinding.value, scope)}}</${tag}>`;
  }

  const childrenLines = textBinding
    ? [`${pad}  {${read(textBinding.value, scope)}}`]
    : node.children.map((c) => printNode(c, `${pad}  `, scope, emit)).filter(Boolean);

  if (attrs.length === 0) {
    if (childrenLines.length === 0) return `${pad}<${tag}></${tag}>`;
    return `${pad}<${tag}>\n${childrenLines.join('\n')}\n${pad}</${tag}>`;
  }

  const open = `${pad}<${tag}\n${attrs.map((a) => `${pad}  ${a}`).join('\n')}\n${pad}>`;
  if (childrenLines.length === 0) return `${open}\n${pad}</${tag}>`;
  return `${open}\n${childrenLines.join('\n')}\n${pad}</${tag}>`;
}

function printNode(node: TemplateNode, pad: string, scope: string | undefined, emit: Emit): string {
  if (node.type === 'text') return `${pad}${jsxText(node.text.trim())}`;
  if (node.type === 'comment') return `${pad}{/*${escapeComment(node.text)}*/}`;

  if (node.repeat) {
    emit.usesFor = true;
    const item = node.repeat.item;
    // Solid's <For> is reference-keyed by the row object itself and takes no
    // key, so the authored `:key` has no expression to become here. It is
    // not dropped in silence: a key prop on a custom element would be an
    // attribute Solid sets and nothing reads.
    const comment = [
      `${pad}{/* Solid's <For> is reference-keyed by the row object itself and`,
      `${pad}    takes no key, so the authored \`:key\` has no expression to become`,
      `${pad}    here. It is not dropped in silence: a key prop on a custom`,
      `${pad}    element would be an attribute Solid sets and nothing reads. */}`,
    ];
    const inner = printElement(node, `${pad}    `, item, emit);
    return [
      ...comment,
      `${pad}<For each={${read(node.repeat.list, scope)}}>`,
      `${pad}  {(${item}) => (`,
      inner,
      `${pad}  )}`,
      `${pad}</For>`,
    ].join('\n');
  }
  return printElement(node, pad, scope, emit);
}

export function renderSolidForm(block: Block): FormFile[] {
  const parsed = parseBlock(block, 'solid');
  const { name, root, tags, refTypes } = parsed;

  const emit: Emit = { collidingSeeds: [], extraRefs: new Map(), usesFor: false };
  const body = printNode(root, '      ', undefined, emit);

  const refEntries = [...refTypes.entries()];
  const extraRefEntries = [...emit.extraRefs.entries()];
  const refImports = [
    ...new Set([...refTypes.values(), ...emit.extraRefs.values()].filter((t) => t !== 'HTMLElement')),
  ].sort();
  // Every distinct ref a colliding seed applies through, whether that ref is
  // ALSO part of the controller's declared Refs (an authored `#ref`, already
  // in `refEntries`) or a synthetic one this renderer invented for an element
  // that had none.
  const seedRefNames = [...new Set(emit.collidingSeeds.map((s) => s.ref))].sort();

  // ONLY the solid-js helpers this file uses: `noUnusedLocals` is on in a
  // stock solid-ts project, and an unconditional `For` import fails TS6133 on
  // a page with no repeat.
  const solidHelpers = [...(emit.usesFor ? ['For'] : []), 'Show'];

  const refDeclarations = [
    ...refEntries.map(([refName, type]) => `  let ${refName}: ${type} | null = null;`),
    ...extraRefEntries.map(([refName, type]) => `  let ${refName}: ${type} | null = null;`),
  ];

  const tsx = [
    `// GENERATED by @kitn.ai/blocks from ${parsed.pagePath} and ${parsed.controllerPath}.`,
    `// It is your code now: edit freely, and regenerate to start over.`,
    `//`,
    `// CUSTOM ELEMENTS, not the Solid components in \`@kitn.ai/ui/solid\`, and the`,
    `// reasons are mechanical rather than stylistic. The controller types its refs`,
    `// as the ELEMENT interfaces (${refImports[0] ?? 'HTMLElement'}), which a Solid component does not`,
    `// hand back; and the kai- events are dispatched by the element facade, not by`,
    `// the Solid component underneath it, so \`on:kai-click\` on a Solid component`,
    `// would silently never fire.`,
    `import { ${solidHelpers.join(', ')} } from 'solid-js';`,
    ...(refImports.length ? [`import type { ${refImports.join(', ')} } from '@kitn.ai/ui/elements';`] : []),
    `import { use${name} } from './use${name}';`,
    ...parsed.template.stylesheets.map((css) => `import './${css}';`),
    '',
    `export function ${name}() {`,
    ...(refDeclarations.length
      ? [
          `  // A plain \`let\`, read through the getter below: refs are not reactive, and`,
          `  // the controller reads them lazily, so there is nothing here for a signal to`,
          `  // do. The parameter annotation is required: under the kit's generic`,
          `  // solid-js JSX augmentation an unannotated \`ref\` callback is TS7006.`,
          ...refDeclarations,
        ]
      : []),
    `  const { state, actions, ready } = use${name}(` +
      `() => ({ ${refEntries.map(([r]) => r).join(', ')} })` +
      (seedRefNames.length ? `, () => ({ ${seedRefNames.join(', ')} })` : '') +
      `);`,
    '',
    `  return (`,
    `    <Show when={ready()}>`,
    body,
    `    </Show>`,
    `  );`,
    `}`,
    '',
  ].join('\n');

  const tagsLiteral = `[${tags.map((t) => `'${t}'`).join(', ')}]`;
  const adapter = [
    `// GENERATED by @kitn.ai/blocks: the solid adapter.`,
    `// One signal over the controller's snapshot. The controller replaces the whole`,
    `// state object per notification, so a store with reconciliation would buy`,
    `// nothing a signal does not already give.`,
    `import { createSignal, onCleanup, onMount } from 'solid-js';`,
    `import type { Accessor } from 'solid-js';`,
    `// The add form's registration, not the autoloader's: the autoloader resolves`,
    `// element modules relative to its own URL and 404s every one of them through a`,
    `// bundler.`,
    `import '@kitn.ai/ui/elements';`,
    `import {`,
    `  createController,`,
    `  type ${name}Actions,`,
    `  type ${name}Refs,`,
    `  type ${name}State,`,
    `} from './${block.name}.controller';`,
    '',
    `// Every kai- tag the block root renders. The tree is gated on these being`,
    `// DEFINED: an element created before its definition lands discards a property`,
    `// set on it, and the upgrade does not put it back (spec 8b, amendment 7).`,
    `const TAGS = ${tagsLiteral};`,
    '',
    `export interface Use${name} {`,
    `  state: Accessor<${name}State>;`,
    `  actions: ${name}Actions;`,
    `  ready: Accessor<boolean>;`,
    `}`,
    '',
    ...(seedRefNames.length
      ? [
          `export function use${name}(`,
          `  refs: () => ${name}Refs,`,
          `  // A colliding seed's target ref(s), separate from \`refs\` above:`,
          `  // \`refs\` is typed to exactly ${name}Refs, and a synthetic ref this`,
          `  // renderer invented for an un-\`#ref\`'d element is not one of its`,
          `  // members.`,
          `  seedRefs: () => Record<string, Element | null>,`,
          `): Use${name} {`,
        ]
      : [`export function use${name}(refs: () => ${name}Refs): Use${name} {`]),
    `  const controller = createController({ refs });`,
    `  const [state, setState] = createSignal<${name}State>(controller.state());`,
    `  const [ready, setReady] = createSignal(false);`,
    '',
    `  onCleanup(controller.subscribe(() => setState(controller.state())));`,
    '',
    `  // onMount, not the body: it runs in the browser only, and \`customElements\``,
    `  // does not exist during server rendering. boot() runs after \`setReady(true)\``,
    `  // inside the same hook: Solid's signal writes flush to the DOM synchronously`,
    `  // outside a \`batch()\`, so the ready-gated tree is already rendered by the`,
    `  // time boot() runs, matching the shipped react adapter's useEffect ordering.`,
    `  onMount(async () => {`,
    `    await Promise.all(TAGS.map((tag) => customElements.whenDefined(tag)));`,
    `    setReady(true);`,
    ...(seedRefNames.length
      ? [
          `    // CONTROLLER RULING B2-T3-a: a seed colliding with a reactive`,
          `    // binding or a literal attribute of the same name cannot stay a`,
          `    // static attribute, so it applies here instead, once, after the`,
          `    // ready flip and before boot() (the order react's, vue's and`,
          `    // svelte's own mount hooks give it). Solid's signal write above`,
          `    // flushes synchronously, so the gated refs are already populated.`,
          `    const seedTargets = seedRefs();`,
          ...emit.collidingSeeds.map(
            (s) => `    seedTargets.${s.ref}?.setAttribute(${jsString(s.name)}, ${jsString(s.value)});`,
          ),
        ]
      : []),
    `    void controller.actions.boot();`,
    `  });`,
    '',
    `  return { state, actions: controller.actions, ready };`,
    `}`,
    '',
  ].join('\n');

  const files: FormFile[] = [];
  const target = (path: string): string => fileTarget('solid', block.name, path);
  const put = (path: string, content: string): void => {
    files.push({ path, content, target: target(path) });
  };
  put(`${name}.tsx`, tsx);
  put(`use${name}.ts`, adapter);
  put(README_FILE, renderReadme(block, [`Render it: \`import { ${name} } from './${name}';\``]));
  for (const file of carriedFiles(block, target)) files.push(file);
  return files;
}
