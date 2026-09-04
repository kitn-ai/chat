/**
 * The angular delivery form: a standalone `Component` with
 * `CUSTOM_ELEMENTS_SCHEMA` over the custom elements, its own
 * `<name>.component.html` template, and an `@Injectable()` store holding one
 * `signal` over the controller's snapshot.
 *
 * THE SAME STRUCTURE AS vue.ts and svelte.ts: a `printNode`/`printElement`
 * recursion over the root, a `bindingAttr` switch over the five binding
 * kinds, and a `literalAttr` for authored attributes. What differs, and why,
 * is documented at each function below.
 *
 * THREE SHAPE DECISIONS, each because the alternative is worse and neither is
 * recoverable from the spec.
 *
 * The store is `@Injectable()` with no `providedIn`, provided in the
 * component's own `providers`. Spec 3.5 says "an injectable service over the
 * controller". A controller belongs to a component INSTANCE (it owns
 * conversation state and a subscription), so `providedIn: 'root'` would give
 * two instances of the block one controller.
 *
 * There is no `<name>.component.css`. Spec 3.5's table writes
 * `<name>.component.{ts,html,css}`, but the block already ships its own
 * stylesheet and the component names it through `styleUrls`. A second, empty
 * file would be a file nobody reads. Angular scopes it with the default
 * emulated encapsulation, and the README says so, because a rule authored to
 * reach the host page will not.
 *
 * `ngAfterViewInit`, not the constructor. `viewChild()` has nothing before
 * the view exists, and `customElements.whenDefined` must not run during SSR.
 *
 * ANGULAR IS THE ONLY HOST THAT CALLS THE ACTION FROM THE TEMPLATE (ruling
 * R18). An Angular event binding is a STATEMENT, and `strictTemplates`
 * type-checks that call in both directions: a zero-arg action called with
 * `$event` is TS2554 "Expected 0 arguments, but got 1", and a one-arg action
 * called with none is TS2554 the other way. Nothing about the event NAME
 * predicts which -- `kai-click` carries no detail at all, and
 * `support-widget.controller.ts` mixes both arities across `kai-*` events in
 * one template -- so this renderer reads `ControllerShape.actionArity`
 * instead of guessing from the name.
 */
import { fileTarget } from '../targets';
import { README_FILE, renderReadme } from './readme';
import { camel, carriedFiles, elementInterface, escapeAttr, isKai, nullRefs, parseBlock } from './emit';
import type { Block } from '../registry';
import type { Binding, FormFile, TemplateNode } from '../contract/types';

type ElementNode = Extract<TemplateNode, { type: 'element' }>;

/** A JS single-quoted string literal, for the store's own `setAttribute`
 *  calls (a JS context, not a template attribute -- `escapeAttr` is the wrong
 *  escaper here). */
const jsString = (value: string): string => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * Literal text in the angular template.
 *
 * `&` first, or the ampersand of an entity this function itself introduced
 * gets escaped twice. `<` / `>` because a bare one opens or closes a tag, the
 * same reason vue's does. `{{` is broken the same way vue's is: only the
 * SECOND brace is encoded (`{{` becomes `{&#123;`), which still renders as
 * `{{` (the entity decodes to `{`) but no longer opens an interpolation for
 * the compiler reading the source text. Angular templates also treat a bare
 * `{` specially inside an ICU expression, which is the other reason a stray
 * brace is not left unescaped.
 */
function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{\{/g, '{&#123;');
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
 *  `="false"` on a kai element become bound literals (spec 8b, amendment 8
 *  (F-10)): the generated prop is typed `boolean`, and `strictTemplates`
 *  checks a bound expression against it. On a plain element it stays a real
 *  attribute, because that is what it is in HTML. */
function literalAttr(tag: string, name: string, value: string): string {
  if (!isKai(tag)) return value === '' ? name : `${name}="${escapeAttr(value)}"`;
  if (value === '') return `[${propName(tag, name)}]="true"`;
  if (value === 'true' || value === 'false') return `[${propName(tag, name)}]="${value}"`;
  return `${name}="${escapeAttr(value)}"`;
}

/** One binding as an angular template attribute. `arity` is
 *  `shape.actionArity`, which is why Step 1 exists. */
function bindingAttr(tag: string, b: Binding, scope: string | undefined, arity: Record<string, number>): string | null {
  switch (b.kind) {
    case 'prop':
      // `.textContent` is emitted as CHILDREN, never as a binding: it is not
      // a real prop and binding it is silently wrong (spec 8b, amendment 2).
      return b.name === 'textContent' ? null : `[${propName(tag, b.name)}]="${read(b.value, scope)}"`;
    case 'attr':
      // A PROPERTY binding on a kai element, the rule react set first: an
      // `[attr.x]` stringifies, so a bound `false` would write x="false" and
      // the element would read it as true. A plain element keeps `[attr.x]`,
      // which is what an attribute on a plain element means.
      return isKai(tag)
        ? `[${propName(tag, b.name)}]="${read(b.value, scope)}"`
        : `[attr.${b.name}]="${read(b.value, scope)}"`;
    case 'event':
      // Angular passes an unrecognised event name straight to
      // addEventListener, which is what a non-bubbling kai- event needs. The
      // action is CALLED here, not referenced: an Angular event binding is a
      // statement, and strictTemplates type-checks the call. So $event is
      // passed IFF the action declares a parameter (ruling R18): both
      // directions are TS2554, and the event name predicts neither --
      // kai-click carries no detail, and the real blocks mix both arities
      // across kai-* events in one template.
      return `(${b.name})="store.actions.${b.value}(${(arity[b.value] ?? 0) > 0 ? '$event' : ''})"`;
    case 'ref':
      return `#${b.name}`;
    case 'seed':
      // A NON-colliding seed only, the same convention vue.ts and svelte.ts
      // use: a seed whose target name is also claimed by a prop/attr binding
      // or a literal attribute on the same element is filtered out of
      // `node.bindings` before this runs (see `printElement`) and applied
      // through ngAfterViewInit instead (CONTROLLER RULING B2-T3-a).
      return null;
  }
}

const read = (value: string, scope: string | undefined): string =>
  scope && value.startsWith(`${scope}.`) ? value : `store.state().${value}`;

/** A seed the template cannot carry as a static attribute: something else on
 *  the same element already claims its name. `ref` names the `#ref` (an
 *  existing one, or a synthetic one this renderer invents) whose
 *  `setAttribute` call the store emits. */
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

function printElement(
  node: ElementNode,
  pad: string,
  scope: string | undefined,
  arity: Record<string, number>,
  emit: Emit,
): string {
  const tag = node.tag;

  const boundNames = new Set(
    node.bindings.filter((b) => b.kind === 'prop' || b.kind === 'attr').map((b) => propName(tag, b.name)),
  );
  const literalAttrs = node.attrs
    .filter((a) => !boundNames.has(propName(tag, a.name)))
    .map((a) => literalAttr(tag, a.name, a.value));

  // CONTROLLER RULING B2-T3-a: a seed never disappears. See the module
  // header; this is the same collision test vue.ts and svelte.ts run.
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

  // Every binding IN AUTHORED ORDER, so `#ref`, `seed:`, `.prop` and `@event`
  // interleave the way they were written rather than being sorted to a fixed
  // slot. A non-colliding seed formats through `literalAttr`; everything else
  // goes through `bindingAttr`.
  const orderedAttrs = node.bindings
    .filter((b) => !collidingSeeds.includes(b))
    .map((b) => (b.kind === 'seed' ? literalAttr(tag, b.name, b.value) : bindingAttr(tag, b, scope, arity)))
    .filter((a): a is string => a !== null);

  const attrs = [
    ...literalAttrs,
    ...(syntheticRef ? [`#${syntheticRef}`] : []),
    ...orderedAttrs,
  ];

  const textBinding = node.bindings.find((b) => b.kind === 'prop' && b.name === 'textContent');

  const body = (() => {
    // No attrs and a single text expression: the fully inline form, matching
    // what a hand-authored template looks like for a leaf node.
    if (attrs.length === 0 && textBinding) {
      return `${pad}<${tag}>{{ ${read(textBinding.value, scope)} }}</${tag}>`;
    }

    const childrenLines = textBinding
      ? [`${pad}  {{ ${read(textBinding.value, scope)} }}`]
      : node.children.map((c) => printNode(c, `${pad}  `, scope, arity, emit)).filter(Boolean);

    if (attrs.length === 0) {
      if (childrenLines.length === 0) return `${pad}<${tag}></${tag}>`;
      return `${pad}<${tag}>\n${childrenLines.join('\n')}\n${pad}</${tag}>`;
    }

    // A single attribute stays on the tag's own line, matching hand-authored
    // markup; more than one explodes, one per line, the way vue's SFC does.
    const open = attrs.length === 1
      ? `${pad}<${tag} ${attrs[0]}>`
      : `${pad}<${tag}\n${attrs.map((a) => `${pad}  ${a}`).join('\n')}\n${pad}>`;
    if (childrenLines.length === 0) return `${open}\n${pad}</${tag}>`;
    return `${open}\n${childrenLines.join('\n')}\n${pad}</${tag}>`;
  })();

  return body;
}

function printNode(node: TemplateNode, pad: string, scope: string | undefined, arity: Record<string, number>, emit: Emit): string {
  if (node.type === 'text') return `${pad}${escapeText(node.text.trim())}`;
  if (node.type === 'comment') return `${pad}<!--${escapeComment(node.text)}-->`;

  // A repeated element is wrapped in a keyed `@for` rather than carrying an
  // attribute, which is what the mandatory `:key` becomes here.
  if (node.repeat) {
    const item = node.repeat.item;
    const header = `${pad}@for (${item} of ${read(node.repeat.list, scope)}; track ${node.repeat.key}) {`;
    const inner = printElement(node, `${pad}  `, item, arity, emit);
    return `${header}\n${inner}\n${pad}}`;
  }
  return printElement(node, pad, scope, arity, emit);
}

export function renderAngularForm(block: Block): FormFile[] {
  const parsed = parseBlock(block, 'angular');
  const { name, root, tags, refTypes, shape } = parsed;

  const emit: Emit = { collidingSeeds: [], extraRefs: new Map() };
  const body = printElement(root, '  ', undefined, shape.actionArity, emit);

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

  const stylesheet = parsed.template.stylesheets[0] as string | undefined;

  const componentCoreImports = [
    'AfterViewInit',
    'Component',
    'CUSTOM_ELEMENTS_SCHEMA',
    'ElementRef',
    'Injector',
    'afterNextRender',
    'inject',
    'viewChild',
  ];

  const viewChildDeclarations = [
    ...refEntries.map(([refName, type]) => `  private readonly ${refName} = viewChild<ElementRef<${type}>>('${refName}');`),
    ...extraRefEntries.map(([refName, type]) => `  private readonly ${refName} = viewChild<ElementRef<${type}>>('${refName}');`),
  ];

  const componentTs = [
    `// GENERATED by @kitn.ai/blocks from ${parsed.pagePath} and ${parsed.controllerPath}.`,
    `// It is your code now: edit freely, and regenerate to start over.`,
    `import { ${componentCoreImports.join(', ')} } from '@angular/core';`,
    ...(refImports.length ? [`import type { ${refImports.join(', ')} } from '@kitn.ai/ui/elements';`] : []),
    `import { ${name}Store } from './${block.name}.store';`,
    '',
    '@Component({',
    `  selector: 'app-${block.name}',`,
    `  templateUrl: './${block.name}.component.html',`,
    ...(stylesheet ? [`  styleUrls: ['./${stylesheet}'],`] : []),
    `  // The store is INSTANCE-scoped. Two of this block on one page each need`,
    `  // their own controller: it owns a subscription and a snapshot.`,
    `  providers: [${name}Store],`,
    `  // kai-* are custom elements, so Angular is told not to resolve them as`,
    `  // components. This is also why the angular compile cell cannot type a`,
    `  // kai prop: the schema suppresses exactly that check, which is what it`,
    `  // is for.`,
    `  schemas: [CUSTOM_ELEMENTS_SCHEMA],`,
    '})',
    `export class ${name}Component implements AfterViewInit {`,
    `  protected readonly store = inject(${name}Store);`,
    `  private readonly injector = inject(Injector);`,
    ...viewChildDeclarations,
    '',
    `  // ngAfterViewInit, not the constructor: viewChild has nothing before the`,
    `  // view exists, and \`customElements\` does not exist during server`,
    `  // rendering. boot() is scheduled from here too, through afterNextRender,`,
    `  // so it fires AFTER Angular has rendered the ready-gated template,`,
    `  // matching the shipped react adapter's useEffect ordering: a boot() that`,
    `  // touches a ref finds it populated.`,
    `  ngAfterViewInit(): void {`,
    `    void this.store.connect(` +
      `() => (${nullRefsAsGetters(shape, refEntries)})` +
      (seedRefNames.length ? `, () => (${seedRefsAsGetters(seedRefNames)})` : '') +
      `).then(() => {`,
    `      afterNextRender(() => { void this.store.actions.boot(); }, { injector: this.injector });`,
    `    });`,
    `  }`,
    '}',
    '',
  ].join('\n');

  const tagsLiteral = `[${tags.map((t) => `'${t}'`).join(', ')}]`;
  const seedRefsType = seedRefNames.length ? `Record<string, Element | null>` : undefined;

  const storeTs = [
    `// GENERATED by @kitn.ai/blocks: the angular adapter.`,
    `// One signal over the controller's snapshot. Nothing is mirrored and no`,
    `// computed re-derives anything: the controller already hands back a view`,
    `// model.`,
    `import { Injectable, signal } from '@angular/core';`,
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
    `@Injectable()`,
    `export class ${name}Store {`,
    `  // Replaced by \`connect\` once the view exists. The controller reads it`,
    `  // lazily, which is why \`refs\` is a getter in the contract at all.`,
    `  private refs: () => ${name}Refs = () => (${nullRefs(shape)});`,
    `  private readonly controller = createController({ refs: () => this.refs() });`,
    '',
    `  readonly state = signal<${name}State>(this.controller.state());`,
    `  readonly ready = signal(false);`,
    `  readonly actions: ${name}Actions = this.controller.actions;`,
    '',
    `  // Sets \`ready\` and returns; it does not call boot() itself. boot() is`,
    `  // the component's job, scheduled from ngAfterViewInit through`,
    `  // afterNextRender so it runs after Angular has rendered the ready-gated`,
    `  // template.`,
    `  async connect(refs: () => ${name}Refs${seedRefsType ? `, seedRefs?: () => ${seedRefsType}` : ''}): Promise<void> {`,
    `    this.refs = refs;`,
    `    this.controller.subscribe(() => this.state.set(this.controller.state()));`,
    `    await Promise.all(TAGS.map((tag) => customElements.whenDefined(tag)));`,
    `    this.ready.set(true);`,
    ...(emit.collidingSeeds.length
      ? [
          `    // CONTROLLER RULING B2-T3-a: a seed colliding with a reactive`,
          `    // binding or a literal attribute of the same name (spec 8b,`,
          `    // amendment 5, as amended) cannot stay a static attribute, so it`,
          `    // applies here instead, once, after the ready-gated tree has`,
          `    // rendered and before boot() (the order react's and vue's own`,
          `    // mount hooks give it).`,
          `    const seedTargets = seedRefs ? seedRefs() : {};`,
          // Bracket access, not dot: seedTargets is typed through an index
          // signature (Record<string, Element | null>), and the stock
          // Angular CLI tsconfig sets noPropertyAccessFromIndexSignature, so
          // a dotted access is TS4111 under ngc even though vue-tsc and
          // svelte-check do not set that option.
          ...emit.collidingSeeds.map(
            (s) => `    seedTargets[${jsString(s.ref)}]?.setAttribute(${jsString(s.name)}, ${jsString(s.value)});`,
          ),
        ]
      : []),
    `  }`,
    '}',
    '',
  ].join('\n');

  const html = [
    `@if (store.ready()) {`,
    body,
    `}`,
    '',
  ].join('\n');

  const files: FormFile[] = [];
  const target = (path: string): string => fileTarget('angular', block.name, path);
  const put = (path: string, content: string): void => {
    files.push({ path, content, target: target(path) });
  };
  put(`${block.name}.component.ts`, componentTs);
  put(`${block.name}.component.html`, html);
  put(`${block.name}.store.ts`, storeTs);
  put(
    README_FILE,
    renderReadme(block, [
      `Render it: \`<app-${block.name} />\`, importing \`${name}Component\` from \`./${block.name}.component\`.`,
      '',
      'The component declares `CUSTOM_ELEMENTS_SCHEMA`, which is what lets Angular render `kai-` elements without trying to resolve them as components.',
      ...(stylesheet
        ? ['', `Angular scopes \`${stylesheet}\` to this component. A rule that has to reach the page around the block belongs in your global styles instead.`]
        : []),
    ]),
  );
  for (const file of carriedFiles(block, target)) files.push(file);
  return files;
}

/** The object literal `connect` hands the controller from `ngAfterViewInit`:
 *  every declared ref, read off its `viewChild` signal's `.nativeElement`. */
function nullRefsAsGetters(shape: { refNames: string[] }, refEntries: [string, string][]): string {
  const byName = new Set(refEntries.map(([r]) => r));
  return `{ ${shape.refNames
    .map((r) => (byName.has(r) ? `${r}: this.${r}()?.nativeElement ?? null` : `${r}: null`))
    .join(', ')} }`;
}

/** The object literal `connect`'s second argument hands over: every distinct
 *  ref a colliding seed applies through, read off its `viewChild` signal.
 *  This is the ONLY reader of a synthetic ref's `viewChild` (an element that
 *  had no authored `#ref`), which is why a synthetic ref with a colliding
 *  seed and no other use would otherwise be TS6133 "declared but never
 *  read". */
function seedRefsAsGetters(seedRefNames: string[]): string {
  return `{ ${seedRefNames.map((r) => `${r}: this.${r}()?.nativeElement ?? null`).join(', ')} }`;
}
