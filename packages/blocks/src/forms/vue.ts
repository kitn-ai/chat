/**
 * The vue delivery form: a `<script setup lang="ts">` SFC over the custom
 * elements plus a composable holding one `shallowRef` over the controller's
 * snapshot.
 *
 * THE SAME STRUCTURE AS react.ts: a `printNode(node, pad, scope, isRoot)`
 * recursion over the root, a `bindingAttr` switch over the five binding kinds,
 * and a `literalAttr` for authored attributes. What differs, and why, is
 * documented at each function below.
 *
 * THE TEMPLATE IS GATED ON `ready`. Outside react, a generated form needs the
 * registration import AND the whenDefined await (spec 8b, amendment 7): an
 * element created before its definition lands discards a property set on it,
 * and custom-element upgrade does not put it back.
 */
import { fileTarget } from '../targets';
import { README_FILE, renderReadme } from './readme';
import { camel, carriedFiles, elementInterface, escapeAttr, isKai, parseBlock } from './emit';
import type { Block } from '../registry';
import type { Binding, FormFile, TemplateNode } from '../contract/types';

const read = (value: string, scope: string | undefined): string =>
  scope && value.startsWith(`${scope}.`) ? value : `state.${value}`;

/** A JS single-quoted string literal, for the composable's own `setAttribute`
 *  calls (a JS context, not an HTML attribute -- `escapeAttr` is the wrong
 *  escaper here). */
const jsString = (value: string): string => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * Literal text in the template.
 *
 * `&` first, or the ampersand of an entity this function itself introduced
 * gets escaped twice. `<` and `>` because Vue's template compiler is an HTML
 * parser: a bare `<` opens a tag the way it would in any hand-authored
 * template. `{{` is broken by encoding only its SECOND brace as an entity --
 * `{{` becomes `{&#123;` -- which still RENDERS as `{{` (the entity decodes
 * to `{`, so the raw first brace plus the decoded second one is `{{` again)
 * but no longer opens a mustache interpolation for the compiler that reads
 * the source text.
 */
function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{\{/g, '{&#123;');
}

/** A comment's text. `-->` cannot occur in an AUTHORED HTML comment (the
 *  parser that read the page would have already closed the comment on it),
 *  but this is defensive in the same spirit as html.ts's binder escaping and
 *  react.ts's own comment-closer guard (it replaces a JS "star slash"
 *  sequence the same way): never trust that every path into a comment node
 *  went through that parser. */
function escapeComment(text: string): string {
  return text.replace(/-->/g, '--&gt;');
}

/** The template NAME a binding lands on. Camel for a kai element, because
 *  `KaiElementVueProps` carries an index signature and an explicit member only
 *  wins when the name matches it: the kebab spelling types as `unknown` and
 *  vue-tsc then checks nothing. Verbatim otherwise, which is what a plain
 *  element's attribute is. */
function propName(tag: string, name: string): string {
  return isKai(tag) ? camel(name) : name;
}

/** A literal attribute in the template.
 *
 *  A bare boolean and a `="true"` / `="false"` on a KAI element become bound
 *  literals (spec 8b, amendment 8 (F-10)): the generated prop is `boolean`, and
 *  vue-tsc rejects the string against it. On a plain element they stay
 *  attributes, because that is what they are in HTML. */
function literalAttr(tag: string, name: string, value: string): string {
  if (!isKai(tag)) return value === '' ? name : `${name}="${escapeAttr(value)}"`;
  if (value === '') return `:${propName(tag, name)}="true"`;
  if (value === 'true' || value === 'false') return `:${propName(tag, name)}="${value}"`;
  return `${name}="${escapeAttr(value)}"`;
}

/** One binding as a template attribute. Seed lands here too, as a static
 *  attribute string, so it keeps its authored position among the element's
 *  other bindings instead of being sorted to a fixed slot. */
function bindingAttr(tag: string, b: Binding, scope: string | undefined): string | null {
  switch (b.kind) {
    case 'prop':
      // `.textContent` is emitted as CHILDREN, never as a binding: it is not a
      // Vue prop and binding it is silently wrong (spec 8b, amendment 2).
      return b.name === 'textContent' ? null : `:${propName(tag, b.name)}.prop="${read(b.value, scope)}"`;
    case 'attr':
      // THE SAME as a `.prop` on a kai element, deliberately, and the react
      // renderer decided this first: an attribute stringifies, so a bound
      // `false` would write `unread="false"` and the element would read it as
      // true. On a plain element it is a real attribute binding.
      return isKai(tag)
        ? `:${propName(tag, b.name)}.prop="${read(b.value, scope)}"`
        : `:${b.name}="${read(b.value, scope)}"`;
    case 'event':
      // No handler name to invent: Vue camelizes `@kai-click` to the
      // `onKaiClick` the kit's own Events type declares.
      return `@${b.name}="actions.${b.value}"`;
    case 'ref':
      return `ref="${b.name}"`;
    case 'seed':
      // A NON-colliding seed only: a seed whose target name is also claimed
      // by a prop/attr binding or a literal attribute on the same element is
      // filtered out of `node.bindings` before this runs (see `printNode`)
      // and applied through onMounted instead. A seed is written once, and
      // when nothing else on the element claims its name it stays a plain
      // static attribute, because nothing re-applies it (spec 8b,
      // amendment 5).
      return `${b.name}="${escapeAttr(b.value)}"`;
  }
}

/** A seed the template cannot carry as a static attribute: something else on
 *  the same element already claims its name. `ref` names the template ref
 *  (an existing `#ref`, or a synthetic one this renderer invents) whose
 *  `setAttribute` call the composable emits. */
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
}

function printNode(node: TemplateNode, pad: string, scope: string | undefined, isRoot: boolean, emit: Emit): string {
  if (node.type === 'text') return `${pad}${escapeText(node.text.trim())}`;
  if (node.type === 'comment') return `${pad}<!--${escapeComment(node.text)}-->`;

  const tag = node.tag;
  const childScope = node.repeat ? node.repeat.item : scope;

  const boundNames = new Set(
    node.bindings.filter((b) => b.kind === 'prop' || b.kind === 'attr').map((b) => propName(tag, b.name)),
  );
  const literalAttrs = node.attrs
    .filter((a) => !boundNames.has(propName(tag, a.name)))
    .map((a) => literalAttr(tag, a.name, a.value));

  // CONTROLLER RULING B2-T3-a: a seed never disappears. A seed sharing its
  // target name with a prop/attr binding OR a literal attribute on the SAME
  // element (support-widget's kai-tab-bar has the first shape: `seed:value=
  // "home" .value="tab"`) cannot stay a static attribute -- Vue compiles a
  // `.prop`/`:attr` binding and a plain attribute of the same name into two
  // entries of ONE props object, which is TS1117, a duplicate object-literal
  // key -- so it is applied instead as a one-time `setAttribute` on the
  // element's template ref, from the composable's `onMounted`, after `await
  // nextTick()` and before `boot()` (the order react's own mount effect gives
  // it; html and react apply every seed through their own mount step too,
  // this is only "sometimes" here because a non-colliding seed compiles fine
  // as a static attribute and there is no reason to route it through a ref).
  const claimedNames = new Set([...boundNames, ...node.attrs.map((a) => propName(tag, a.name))]);
  const refBinding = node.bindings.find((b) => b.kind === 'ref');
  const collidingSeeds = node.bindings.filter((b) => b.kind === 'seed' && claimedNames.has(propName(tag, b.name)));
  let syntheticRef: string | undefined;
  if (collidingSeeds.length && !refBinding) {
    syntheticRef = `seedRef${node.marker}`;
    emit.extraRefs.set(syntheticRef, elementInterface(tag));
  }
  const seedRef = refBinding?.name ?? syntheticRef;
  for (const b of collidingSeeds) {
    emit.collidingSeeds.push({ ref: seedRef as string, name: b.name, value: b.value });
  }

  const bindingAttrs = node.bindings
    .filter((b) => !collidingSeeds.includes(b))
    .map((b) => bindingAttr(tag, b, childScope))
    .filter((a): a is string => a !== null);

  const attrs = [
    ...(isRoot ? ['v-if="ready"'] : []),
    ...(node.repeat ? [`v-for="${node.repeat.item} in ${read(node.repeat.list, scope)}"`, `:key="${read(node.repeat.key, childScope)}"`] : []),
    ...(syntheticRef ? [`ref="${syntheticRef}"`] : []),
    ...literalAttrs,
    ...bindingAttrs,
  ];

  const textBinding = node.bindings.find((b) => b.kind === 'prop' && b.name === 'textContent');

  // No attrs and a single text expression: the fully inline form, matching
  // what a hand-authored SFC looks like for a leaf node.
  if (attrs.length === 0 && textBinding) {
    return `${pad}<${tag}>{{ ${read(textBinding.value, childScope)} }}</${tag}>`;
  }

  const childrenLines = textBinding
    ? [`${pad}  {{ ${read(textBinding.value, childScope)} }}`]
    : node.children.map((c) => printNode(c, `${pad}  `, childScope, false, emit)).filter(Boolean);

  if (attrs.length === 0) {
    if (childrenLines.length === 0) return `${pad}<${tag}></${tag}>`;
    return `${pad}<${tag}>\n${childrenLines.join('\n')}\n${pad}</${tag}>`;
  }

  const open = `${pad}<${tag}\n${attrs.map((a) => `${pad}  ${a}`).join('\n')}\n${pad}>`;
  if (childrenLines.length === 0) return `${open}\n${pad}</${tag}>`;
  return `${open}\n${childrenLines.join('\n')}\n${pad}</${tag}>`;
}

export function renderVueForm(block: Block): FormFile[] {
  const parsed = parseBlock(block, 'vue');
  const { name, root, tags, refTypes } = parsed;

  const emit: Emit = { collidingSeeds: [], extraRefs: new Map() };
  const body = printNode(root, '  ', undefined, true, emit);

  const refEntries = [...refTypes.entries()];
  const extraRefEntries = [...emit.extraRefs.entries()];
  const refImports = [
    ...new Set([...refTypes.values(), ...emit.extraRefs.values()].filter((t) => t !== 'HTMLElement')),
  ].sort();
  // Every distinct ref a colliding seed applies through, whether that ref is
  // ALSO part of the controller's declared Refs (an authored `#ref`, already
  // in `refEntries`) or a synthetic one this renderer invented for an element
  // that had none. A separate object literal from the controller's own
  // `refs()` call: mixing a synthetic key into that one would fail Refs'
  // excess-property check, since it is typed to exactly `${name}Refs`.
  const seedRefNames = [...new Set(emit.collidingSeeds.map((s) => s.ref))].sort();

  const sfc = [
    '<script setup lang="ts">',
    `// GENERATED by @kitn.ai/blocks from ${parsed.pagePath} and ${parsed.controllerPath}.`,
    `// It is your code now: edit freely, and regenerate to start over.`,
    `import { useTemplateRef } from 'vue';`,
    ...(refImports.length ? [`import type { ${refImports.join(', ')} } from '@kitn.ai/ui/elements';`] : []),
    `import { use${name} } from './use${name}';`,
    ...parsed.template.stylesheets.map((css) => `import './${css}';`),
    '',
    ...refEntries.map(([refName, type]) => `const ${refName} = useTemplateRef<${type}>('${refName}');`),
    ...extraRefEntries.map(([refName, type]) => `const ${refName} = useTemplateRef<${type}>('${refName}');`),
    `const { state, actions, ready } = use${name}(` +
      `() => ({ ${refEntries.map(([r]) => `${r}: ${r}.value`).join(', ')} })` +
      (seedRefNames.length ? `, () => ({ ${seedRefNames.map((r) => `${r}: ${r}.value`).join(', ')} })` : '') +
      `);`,
    '</script>',
    '',
    '<template>',
    body,
    '</template>',
    '',
  ].join('\n');

  const tagsLiteral = `[${tags.map((t) => `'${t}'`).join(', ')}]`;
  const composable = [
    `// GENERATED by @kitn.ai/blocks: the vue adapter.`,
    `// One shallowRef over the controller's snapshot: nothing is mirrored and no`,
    `// effect re-derives anything. shallowRef rather than ref because the controller`,
    `// hands back a NEW state object per notification and the kai- reactivity`,
    `// contract wants a new array reference for a list prop anyway, so deep`,
    `// reactivity would only cost proxies over data that is replaced wholesale.`,
    `// boot() runs AFTER the ready-gated tree has rendered (an \`await nextTick()\``,
    `// past \`ready.value = true\`), matching the shipped react adapter's useEffect`,
    `// ordering, so a boot() that touches a ref finds it populated on every host.`,
    `import { nextTick, onMounted, onUnmounted, ref, shallowRef } from 'vue';`,
    `import type { Ref, ShallowRef } from 'vue';`,
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
    `// Every kai- tag the block root renders. The template is gated on these being`,
    `// DEFINED: an element created before its definition lands discards a property`,
    `// set on it, and the upgrade does not put it back (spec 8b, amendment 7).`,
    `const TAGS = ${tagsLiteral};`,
    '',
    `export interface Use${name} {`,
    `  state: ShallowRef<${name}State>;`,
    `  actions: ${name}Actions;`,
    `  ready: Ref<boolean>;`,
    `}`,
    '',
    `export function use${name}(`,
    `  refs: () => ${name}Refs,`,
    ...(emit.collidingSeeds.length
      ? [
          `  // A colliding seed's target ref(s), separate from \`refs\` above:`,
          `  // \`refs\` is typed to exactly ${name}Refs, and a synthetic ref this`,
          `  // renderer invented for an un-\`#ref\`'d element is not one of its`,
          `  // members.`,
          `  seedRefs: () => Record<string, Element | null>,`,
        ]
      : []),
    `): Use${name} {`,
    `  const controller = createController({ refs });`,
    `  const state = shallowRef<${name}State>(controller.state());`,
    `  const ready = ref(false);`,
    `  let unsubscribe: (() => void) | undefined;`,
    '',
    `  onMounted(async () => {`,
    `    unsubscribe = controller.subscribe(() => {`,
    `      state.value = controller.state();`,
    `    });`,
    `    await Promise.all(TAGS.map((tag) => customElements.whenDefined(tag)));`,
    `    ready.value = true;`,
    `    await nextTick();`,
    ...(emit.collidingSeeds.length
      ? [
          `    // CONTROLLER RULING B2-T3-a: a seed colliding with a reactive`,
          `    // binding or a literal attribute of the same name (spec 8b,`,
          `    // amendment 5, as amended) cannot stay a static attribute --`,
          `    // Vue would compile two entries of the same name into ONE props`,
          `    // object, TS1117 -- so it applies here instead, once, after the`,
          `    // ready-gated tree has rendered and before boot() (the order`,
          `    // react's own mount effect gives it; html and react apply every`,
          `    // seed through their own mount step too).`,
          `    const seedTargets = seedRefs();`,
          ...emit.collidingSeeds.map(
            (s) => `    seedTargets.${s.ref}?.setAttribute(${jsString(s.name)}, ${jsString(s.value)});`,
          ),
        ]
      : []),
    `    void controller.actions.boot();`,
    `  });`,
    `  onUnmounted(() => unsubscribe?.());`,
    '',
    `  return { state, actions: controller.actions, ready };`,
    `}`,
    '',
  ].join('\n');

  const files: FormFile[] = [];
  const target = (path: string): string => fileTarget('vue', block.name, path);
  const put = (path: string, content: string): void => {
    files.push({ path, content, target: target(path) });
  };
  put(`${name}.vue`, sfc);
  put(`use${name}.ts`, composable);
  put(
    README_FILE,
    renderReadme(block, [
      `Render it: \`<${name} />\`, from \`./${name}.vue\`.`,
      '',
      "Vue resolves every tag as a component first, so add `vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('kai-') } } })` to your vite config or it will warn about each `kai-` element.",
    ]),
  );
  for (const file of carriedFiles(block, target)) files.push(file);
  return files;
}
