/**
 * The svelte delivery form: a `.svelte` component over the custom elements
 * plus a `.svelte.ts` rune adapter holding one `$state` snapshot.
 *
 * THE SAME STRUCTURE AS vue.ts: a `printNode`/`printElement` recursion over
 * the root, a `bindingAttr` switch over the five binding kinds, and a
 * `literalAttr` for authored attributes. What differs, and why, is documented
 * at each function below.
 *
 * FOLLOWS THE SPEC'S INTENT, NOT ITS MECHANISM. Spec 3.5 says the svelte form
 * uses `$effect` for property assignment. Svelte 5's own `set_custom_element_data`
 * assigns the PROPERTY once the element is registered and the name is one of
 * its setters, and falls back to `setAttribute` otherwise; with the tree gated
 * on registration, a plain attribute in the template IS the property
 * assignment, so no hand-rolled `$effect` per binding is needed. The
 * registration await lives in `onMount` instead of a bare `$effect`: `onMount`
 * never runs during server rendering (neither does `$effect` during SSR, but
 * `onMount` is also the mount hook `boot()` is called from, matching the
 * html/react/vue mount-hook pattern).
 *
 * CONTROLLER RULING B2-T3-a, restated here because this renderer implements
 * it: a seed never disappears. A seed whose target name is also claimed by a
 * prop/attr binding or a literal attribute on the SAME element cannot stay a
 * static attribute (svelte compiles a bound expression and a plain attribute
 * of the same name onto the same DOM property, and the later one --
 * source-order dependent -- would silently win or lose), so it is applied
 * instead as a one-time `setAttribute` on that element's `bind:this` ref,
 * inside `onMount`, after the ready-gated tree has rendered and before
 * `boot()`. A non-colliding seed stays a plain static attribute.
 *
 * ONE MORE THING SVELTE NEEDS THAT VUE DOES NOT: the instance object is never
 * destructured (`fixture.state`, not `{ state }`), because runes reactivity
 * for a getter-based interface lives on the object's accessors -- destructuring
 * would capture the value at call time and never update. So `read` and the
 * event-binding form thread the render's instance name (`camelName`) through a
 * closure rather than reading a module-level constant the way vue's does.
 */
import { fileTarget } from '../targets';
import { README_FILE, renderReadme } from './readme';
import { camel, carriedFiles, elementInterface, escapeAttr, isKai, parseBlock } from './emit';
import type { Block } from '../registry';
import type { Binding, FormFile, TemplateNode } from '../contract/types';

type ElementNode = Extract<TemplateNode, { type: 'element' }>;

/** A JS single-quoted string literal, for the adapter's own `setAttribute`
 *  calls (a JS context, not a template attribute -- `escapeAttr` is the wrong
 *  escaper here). */
const jsString = (value: string): string => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * Literal text in the template. `&` first, or the ampersand of an entity this
 * function itself introduced gets escaped twice. `<` / `>` because a bare one
 * opens or closes a tag. `{` / `}` because svelte's template compiler reads
 * any brace as the start of an expression, unlike vue's mustache pairs -- a
 * single stray brace is enough to break parsing, so both are always escaped.
 */
function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

/** A comment's text. `-->` cannot occur in an AUTHORED HTML comment, but this
 *  is defensive in the same spirit as vue.ts's own comment-closer guard: never
 *  trust that every path into a comment node went through that parser. */
function escapeComment(text: string): string {
  return text.replace(/-->/g, '--&gt;');
}

/** The template NAME a binding lands on. Camel for a kai element, because the
 *  emitted property must match one of the element's setters; verbatim
 *  otherwise, which is what a plain element's attribute is. */
function propName(tag: string, name: string): string {
  return isKai(tag) ? camel(name) : name;
}

/** A literal attribute in the template. A bare boolean and a `="true"` /
 *  `="false"` on a kai element become expressions (spec 8b, amendment 8
 *  (F-10)): the generated prop is typed `boolean` and svelte compiles a
 *  non-string expression into a PROPERTY assignment via
 *  `set_custom_element_data`. On a plain element it stays a real attribute,
 *  because that is what it is in HTML. */
function literalAttr(tag: string, name: string, value: string): string {
  if (!isKai(tag)) return value === '' ? name : `${name}="${escapeAttr(value)}"`;
  if (value === '') return `${propName(tag, name)}={true}`;
  if (value === 'true' || value === 'false') return `${propName(tag, name)}={${value}}`;
  return `${name}="${escapeAttr(value)}"`;
}

/** A seed the template cannot carry as a static attribute: something else on
 *  the same element already claims its name. `ref` names the `bind:this`
 *  variable (an existing `#ref`, or a synthetic one this renderer invents)
 *  whose `setAttribute` call the adapter emits. */
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

export function renderSvelteForm(block: Block): FormFile[] {
  const parsed = parseBlock(block, 'svelte');
  const { name, root, tags, refTypes } = parsed;

  // The runes instance is never destructured (see the module header), so
  // every generated expression is qualified through this name.
  const instanceName = name.charAt(0).toLowerCase() + name.slice(1);

  const read = (value: string, scope: string | undefined): string =>
    scope && value.startsWith(`${scope}.`) ? value : `${instanceName}.state.${value}`;

  /** One binding as a svelte attribute. `seed` is never reached here: a
   *  non-colliding seed is formatted through `literalAttr` instead, so it
   *  keeps its authored position among the element's other bindings and gets
   *  the same true/false literal treatment an authored attribute would. This
   *  branch exists for the switch's exhaustiveness alone. */
  function bindingAttr(tag: string, b: Binding, scope: string | undefined): string | null {
    switch (b.kind) {
      case 'prop':
        // `.textContent` is emitted as CHILDREN, never as a binding: it is
        // not a real prop and binding it is silently wrong (spec 8b,
        // amendment 2).
        return b.name === 'textContent' ? null : `${propName(tag, b.name)}={${read(b.value, scope)}}`;
      case 'attr':
        // The same spelling as a prop on a kai element, and it lands as a
        // property for the same reason: `set_custom_element_data` prefers
        // the setter once the element is registered, which the `ready` gate
        // guarantees.
        return `${propName(tag, b.name)}={${read(b.value, scope)}}`;
      case 'event':
        // `onkai-click` compiles to `$.event('kai-click', node, handler)` in
        // svelte 5, which is addEventListener with the exact name -- correct
        // for an event that does not bubble.
        return `on${b.name}={${instanceName}.actions.${b.value}}`;
      case 'ref':
        return `bind:this={${b.name}}`;
      case 'seed':
        return null;
    }
  }

  function printElement(node: ElementNode, pad: string, scope: string | undefined, emit: Emit): string {
    const tag = node.tag;

    const boundNames = new Set(
      node.bindings.filter((b) => b.kind === 'prop' || b.kind === 'attr').map((b) => propName(tag, b.name)),
    );
    const literalAttrs = node.attrs
      .filter((a) => !boundNames.has(propName(tag, a.name)))
      .map((a) => literalAttr(tag, a.name, a.value));

    // CONTROLLER RULING B2-T3-a: a seed never disappears. See the module
    // header; this is the same collision test vue.ts runs.
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

    // Every binding IN AUTHORED ORDER, so `#ref`, `seed:`, `.prop` and
    // `@event` interleave the way they were written rather than being sorted
    // to a fixed slot. A non-colliding seed formats through `literalAttr`;
    // everything else goes through `bindingAttr`.
    const orderedAttrs = node.bindings
      .filter((b) => !collidingSeeds.includes(b))
      .map((b) => (b.kind === 'seed' ? literalAttr(tag, b.name, b.value) : bindingAttr(tag, b, scope)))
      .filter((a): a is string => a !== null);

    const attrs = [
      ...literalAttrs,
      ...(syntheticRef ? [`bind:this={${syntheticRef}}`] : []),
      ...orderedAttrs,
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

    // A single attribute stays on the tag's own line, matching hand-authored
    // svelte; more than one explodes, one per line, the way vue's SFC does.
    const open = attrs.length === 1
      ? `${pad}<${tag} ${attrs[0]}>`
      : `${pad}<${tag}\n${attrs.map((a) => `${pad}  ${a}`).join('\n')}\n${pad}>`;
    if (childrenLines.length === 0) return `${open}\n${pad}</${tag}>`;
    return `${open}\n${childrenLines.join('\n')}\n${pad}</${tag}>`;
  }

  function printNode(node: TemplateNode, pad: string, scope: string | undefined, emit: Emit): string {
    if (node.type === 'text') return `${pad}${escapeText(node.text.trim())}`;
    if (node.type === 'comment') return `${pad}<!--${escapeComment(node.text)}-->`;

    // A repeated element is wrapped in a keyed `{#each}` rather than carrying
    // an attribute, which is what the mandatory `:key` becomes here.
    if (node.repeat) {
      const item = node.repeat.item;
      const header = `${pad}{#each ${read(node.repeat.list, scope)} as ${item} (${node.repeat.key})}`;
      const inner = printElement(node, `${pad}  `, item, emit);
      return `${header}\n${inner}\n${pad}{/each}`;
    }
    return printElement(node, pad, scope, emit);
  }

  const emit: Emit = { collidingSeeds: [], extraRefs: new Map() };
  const body = printNode(root, '  ', undefined, emit);

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

  const refDeclarations = [
    ...refEntries.map(([refName, type]) => `  let ${refName} = $state<${type} | null>(null);`),
    ...extraRefEntries.map(([refName, type]) => `  let ${refName} = $state<${type} | null>(null);`),
  ];

  const sfc = [
    '<script lang="ts">',
    `  // GENERATED by @kitn.ai/blocks from ${parsed.pagePath} and ${parsed.controllerPath}.`,
    `  // It is your code now: edit freely, and regenerate to start over.`,
    `  //`,
    `  // A kai prop is set PLAINLY here and it still lands as a property: Svelte's`,
    `  // set_custom_element_data assigns the property when the element is registered`,
    `  // and the name is one of its setters, and this tree does not render until`,
    '  // registration is done. That is also why a bound `false` clears rather than',
    '  // writing the string "false".',
    ...(refImports.length ? [`  import type { ${refImports.join(', ')} } from '@kitn.ai/ui/elements';`] : []),
    `  import { use${name} } from './use${name}.svelte';`,
    ...parsed.template.stylesheets.map((css) => `  import './${css}';`),
    '',
    ...refDeclarations,
    `  const ${instanceName} = use${name}(` +
      `() => ({ ${refEntries.map(([r]) => r).join(', ')} })` +
      (seedRefNames.length ? `, () => ({ ${seedRefNames.join(', ')} })` : '') +
      `);`,
    '</script>',
    '',
    `{#if ${instanceName}.ready}`,
    body,
    '{/if}',
    '',
  ].join('\n');

  const tagsLiteral = `[${tags.map((t) => `'${t}'`).join(', ')}]`;
  const adapter = [
    `// GENERATED by @kitn.ai/blocks: the svelte adapter.`,
    '// `.svelte.ts`, not `.ts`: the runes compiler runs on `.svelte` and `.svelte.ts`',
    "// files only, so `$state` in a plain module is a compile error.",
    '//',
    '// The add form\'s registration, not the autoloader\'s: the autoloader resolves',
    '// element modules relative to its own URL and 404s every one of them through a',
    '// bundler.',
    `import { onMount, tick } from 'svelte';`,
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
    `  readonly state: ${name}State;`,
    `  readonly actions: ${name}Actions;`,
    `  readonly ready: boolean;`,
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
    `  let snapshot = $state<${name}State>(controller.state());`,
    `  let ready = $state(false);`,
    '',
    `  // IN onMount, and that is the SSR answer rather than a style choice:`,
    `  // \`onMount\` never runs during server rendering, and \`customElements\` does`,
    `  // not exist on the server, so a SvelteKit page rendering this component`,
    `  // would throw. boot() runs AFTER \`ready\` flips and Svelte has flushed the`,
    `  // gated tree to the DOM (an \`await tick()\` past \`ready = true\`), matching`,
    `  // the shipped react adapter's useEffect ordering, so a boot() that touches`,
    `  // a ref finds it populated on every host.`,
    `  onMount(() => {`,
    `    const unsubscribe = controller.subscribe(() => {`,
    `      snapshot = controller.state();`,
    `    });`,
    `    void (async () => {`,
    `      await Promise.all(TAGS.map((tag) => customElements.whenDefined(tag)));`,
    `      ready = true;`,
    `      await tick();`,
    ...(seedRefNames.length
      ? [
          `      // CONTROLLER RULING B2-T3-a: a seed colliding with a reactive`,
          `      // binding or a literal attribute of the same name (spec 8b,`,
          `      // amendment 5, as amended) cannot stay a static attribute, so`,
          `      // it applies here instead, once, after the ready-gated tree`,
          `      // has rendered and before boot() (the order react's and vue's`,
          `      // own mount hooks give it).`,
          `      const seedTargets = seedRefs();`,
          ...emit.collidingSeeds.map(
            (s) => `      seedTargets.${s.ref}?.setAttribute(${jsString(s.name)}, ${jsString(s.value)});`,
          ),
        ]
      : []),
    `      void controller.actions.boot();`,
    `    })();`,
    `    return unsubscribe;`,
    `  });`,
    '',
    `  return {`,
    `    get state() { return snapshot; },`,
    `    get actions() { return controller.actions; },`,
    `    get ready() { return ready; },`,
    `  };`,
    `}`,
    '',
  ].join('\n');

  const files: FormFile[] = [];
  const target = (path: string): string => fileTarget('svelte', block.name, path);
  const put = (path: string, content: string): void => {
    files.push({ path, content, target: target(path) });
  };
  put(`${name}.svelte`, sfc);
  put(`use${name}.svelte.ts`, adapter);
  put(
    README_FILE,
    renderReadme(block, [
      // Svelte needs no `isCustomElement` equivalent, unlike vue: any dashed
      // tag is treated as an element, so there is no framework-config line to
      // add here.
      `Render it: \`<${name} />\`, from \`./${name}.svelte\`.`,
    ]),
  );
  for (const file of carriedFiles(block, target)) files.push(file);
  return files;
}
