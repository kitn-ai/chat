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
import { camel, carriedFiles, escapeAttr, isKai, parseBlock } from './emit';
import type { Block } from '../registry';
import type { Binding, FormFile, TemplateNode } from '../contract/types';

const read = (value: string, scope: string | undefined): string =>
  scope && value.startsWith(`${scope}.`) ? value : `state.${value}`;

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
      // A seed is written once. Everywhere except react that is a plain
      // static attribute, because nothing re-applies it (spec 8b, amendment 5).
      return `${b.name}="${escapeAttr(b.value)}"`;
  }
}

function printNode(node: TemplateNode, pad: string, scope: string | undefined, isRoot: boolean): string {
  if (node.type === 'text') return `${pad}${node.text.trim()}`;
  if (node.type === 'comment') return `${pad}<!--${node.text}-->`;

  const tag = node.tag;
  const childScope = node.repeat ? node.repeat.item : scope;

  const boundNames = new Set(
    node.bindings.filter((b) => b.kind === 'prop' || b.kind === 'attr').map((b) => propName(tag, b.name)),
  );
  const literalAttrs = node.attrs
    .filter((a) => !boundNames.has(propName(tag, a.name)))
    .map((a) => literalAttr(tag, a.name, a.value));
  // A seed sharing its target name with a prop/attr binding on the SAME
  // element (the fixture never has this, support-widget's kai-tab-bar does:
  // `seed:value="home" .value="tab"`) is dropped rather than emitted beside
  // the binding. In react that pairing is fine -- the seed is a mount effect,
  // wholly separate from the JSX prop -- but Vue compiles a `.prop` binding
  // AND a plain attribute of the same name into two entries of ONE props
  // object, which is TS1117, a duplicate object-literal key. The reactive
  // binding already supplies the value on first render, so the seed's "write
  // once" is redundant here rather than lost.
  const bindingAttrs = node.bindings
    .filter((b) => !(b.kind === 'seed' && boundNames.has(propName(tag, b.name))))
    .map((b) => bindingAttr(tag, b, childScope))
    .filter((a): a is string => a !== null);

  const attrs = [
    ...(isRoot ? ['v-if="ready"'] : []),
    ...(node.repeat ? [`v-for="${node.repeat.item} in ${read(node.repeat.list, scope)}"`, `:key="${read(node.repeat.key, childScope)}"`] : []),
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
    : node.children.map((c) => printNode(c, `${pad}  `, childScope, false)).filter(Boolean);

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

  const body = printNode(root, '  ', undefined, true);

  const refImports = [...new Set([...refTypes.values()].filter((t) => t !== 'HTMLElement'))].sort();
  const refEntries = [...refTypes.entries()];

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
    `const { state, actions, ready } = use${name}(() => ({ ${refEntries.map(([r]) => `${r}: ${r}.value`).join(', ')} }));`,
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
    `export function use${name}(refs: () => ${name}Refs): Use${name} {`,
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
