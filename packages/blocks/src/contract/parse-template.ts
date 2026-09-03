/**
 * The authored page -> `ParsedTemplate` (spec 3.1 as amended by 8b).
 *
 * WHY parse5 AND NOT A REGEX. The predecessor (`bodyToJsx`) matched tags with
 * a regex and refused anything it could not translate. That was honest and it
 * does not scale to a grammar: bindings are attributes, `*for` opens a scope,
 * and a scope needs a tree. parse5 is the WHATWG tokenizer, so what it thinks
 * a page contains is what a browser thinks.
 *
 * THE ONE parse5 GOTCHA, measured, not assumed: it LOWERCASES attribute names,
 * so `.textContent` arrives as `.textcontent` and `.activeId` as `.activeid`.
 * With `sourceCodeLocationInfo: true` every attribute carries source offsets
 * keyed by that lowercased name, and slicing the original text gives the
 * AUTHORED spelling back. That is what `authoredAttrs` does, and it runs
 * before anything is classified, so every rule and every error message sees
 * what the author wrote.
 */
import { parse, defaultTreeAdapter } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import type { Binding, BindingKind, LiteralAttr, ParsedTemplate, Repeat, TemplateNode } from './types';

type P5Node = DefaultTreeAdapterMap['node'];
type P5Element = DefaultTreeAdapterMap['element'];
type P5Parent = DefaultTreeAdapterMap['parentNode'];

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const DOTTED = /^([A-Za-z_$][A-Za-z0-9_$]*)\.([A-Za-z_$][A-Za-z0-9_$]*)$/;
const FOR_VALUE = /^([A-Za-z_$][A-Za-z0-9_$]*)\s+of\s+([A-Za-z_$][A-Za-z0-9_$]*)$/;

const camel = (name: string): string => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

const isElement = (node: P5Node): node is P5Element => defaultTreeAdapter.isElementNode(node);
const childrenOf = (node: P5Parent): P5Node[] => defaultTreeAdapter.getChildNodes(node) ?? [];
const findChild = (node: P5Parent, tag: string): P5Element | undefined =>
  childrenOf(node).find((c): c is P5Element => isElement(c) && c.tagName === tag);

/** parse5 lowercases attribute names; recover the authored spelling from the
 *  source offsets it recorded for each one. */
function authoredAttrs(el: P5Element, source: string): { name: string; value: string }[] {
  const locs = el.sourceCodeLocation?.attrs;
  return el.attrs.map((attr) => {
    const loc = locs?.[attr.name];
    if (!loc) return { name: attr.name, value: attr.value };
    const raw = source.slice(loc.startOffset, loc.endOffset);
    const eq = raw.indexOf('=');
    return { name: (eq === -1 ? raw : raw.slice(0, eq)).trim(), value: attr.value };
  });
}

const lineOf = (el: P5Element): number => el.sourceCodeLocation?.startLine ?? 0;

interface Ctx {
  where: string;
  source: string;
  errors: string[];
  refs: string[];
  marker: number;
}

const fail = (ctx: Ctx, line: number, message: string): void => {
  ctx.errors.push(`${ctx.where}:${line}: ${message}`);
};

/** A binding value is an identifier, optionally dotted from the enclosing
 *  `*for` item. Everything else is an error that names the fix. */
function checkValue(ctx: Ctx, line: number, raw: string, value: string, scope: string | undefined): boolean {
  if (IDENT.test(value)) return true;
  const dotted = DOTTED.exec(value);
  if (dotted) {
    if (scope && dotted[1] === scope) return true;
    fail(
      ctx,
      line,
      `${raw}="${value}": a dotted value like \`${value}\` is only legal inside the \`*for\` that declares \`${dotted[1]}\`. Add a field to State instead.`,
    );
    return false;
  }
  fail(
    ctx,
    line,
    `${raw}="${value}": a binding holds an identifier, never an expression. Put the derivation in the controller and bind the field it produces (spec 3.1; State is a view model, spec 3.2).`,
  );
  return false;
}

/**
 * THE SINKS A BINDING MAY NOT NAME (R21-style refusals, decided at the grammar
 * so every delivery form refuses the same page).
 *
 * The repo's threat model: everything the model produced is untrusted input
 * (CLAUDE.md). A State field fed from a message IS the model-controlled path,
 * and a generated form runs no sanitizer and no scheme policy over a bound
 * value, so the sink is refused rather than emitted unguarded. Neither list is
 * a filter to be widened case by case: a block that needs one of these needs a
 * kit element that owns the guard.
 */
const MARKUP_SINKS = new Set(['innerhtml', 'outerhtml', 'srcdoc', 'insertadjacenthtml']);
/** The kit HAS a scheme policy (`isSafeUrl`, src/primitives/url-scheme-policy.ts)
 *  and no generated form puts it on a bound value, so a navigable URL from
 *  State is refused until one does. */
const URL_SINKS = new Set(['href', 'src', 'action', 'formaction']);

/** The refusal message for a sink a `.prop` or `:attr` binding must not name,
 *  or null when the target is fine. `key` is the target normalized the way the
 *  DOM would read it, so `.inner-html` and `.innerHTML` are one rule. */
function sinkRefusal(raw: string, value: string, key: string): string | null {
  if (MARKUP_SINKS.has(key)) {
    return `${raw}="${value}": bind \`.textContent\`; markup is not a binding. Everything the model produced is untrusted input, and a State field fed from a message is the model-controlled path, so a generated form never writes one as HTML (spec 3.1).`;
  }
  if (URL_SINKS.has(key)) {
    return `${raw}="${value}": a navigable URL from State has no scheme guard in a generated form yet, and \`javascript:\` is a scheme. Use a literal attribute for a URL the block author wrote (spec 3.1).`;
  }
  return null;
}

function classify(name: string): { kind: BindingKind | 'for' | 'key'; target: string } | null {
  if (name.startsWith('seed:')) return { kind: 'seed', target: name.slice('seed:'.length) };
  if (name.startsWith('.')) return { kind: 'prop', target: name.slice(1) };
  if (name === ':key') return { kind: 'key', target: 'key' };
  if (name.startsWith(':')) return { kind: 'attr', target: name.slice(1) };
  if (name.startsWith('@')) return { kind: 'event', target: name.slice(1) };
  if (name.startsWith('#')) return { kind: 'ref', target: name.slice(1) };
  if (name.startsWith('*')) return { kind: 'for', target: name.slice(1) };
  return null;
}

/** The entry script is GENERATED under the authored contract, so an authored
 *  one is a page that was never converted. Refused wherever it sits: `<head>`
 *  is copied into the emitted page VERBATIM, so a script there would survive
 *  without ever having been looked at. */
function failScript(ctx: Ctx, el: P5Element): void {
  const src = el.attrs.find((a) => a.name === 'src')?.value;
  fail(
    ctx,
    lineOf(el),
    `the page carries ${src ? `<script src="${src}">` : 'an inline <script>'}. Under the authored contract the entry script is GENERATED: put the wiring on the markup (spec 3.1) and the logic in <id>.controller.ts (spec 3.2).`,
  );
}

function convertElement(el: P5Element, ctx: Ctx, scope: string | undefined, hasParent: boolean): TemplateNode {
  const line = lineOf(el);
  const attrs: LiteralAttr[] = [];
  const bindings: Binding[] = [];
  let keyValue: string | undefined;
  let refName: string | undefined;
  const authored = authoredAttrs(el, ctx.source);

  // The repeat is resolved BEFORE anything else on this element is classified.
  // A `*for` opens a scope that belongs to the ELEMENT, not to the attributes
  // written after it, and a single loop that discovered the repeat midway made
  // the verdict depend on attribute ORDER: `<li :unread="row.unread" *for="row
  // of rows">` was refused for lacking the `*for` sitting two attributes along.
  let repeat: Repeat | undefined;
  for (const { name, value } of authored) {
    if (!name.startsWith('*')) continue;
    if (name !== '*for') {
      fail(ctx, line, `"${name}" is not a list binding; the only \`*\` form is \`*for="item of list"\`.`);
      continue;
    }
    const m = FOR_VALUE.exec(value.trim());
    if (!m) {
      fail(ctx, line, `*for="${value}": a list binding is spelled \`*for="item of list"\`, both identifiers.`);
      continue;
    }
    repeat = { item: m[1], list: m[2], key: '', line };
  }
  const inScope = repeat ? repeat.item : scope;

  for (const { name, value } of authored) {
    const kind = classify(name);
    if (!kind) {
      // `?attr` is the near-miss spelling an author arrives with (spec 8a.2
      // rejects it), and taking it for a literal would write `?hidden` into
      // the page. It is the only unknown prefix there is to catch: every other
      // punctuation the grammar uses has its own `classify` branch.
      if (name.startsWith('?')) {
        fail(ctx, line, `"${name}" is not a binding kind: a boolean attribute is spelled \`:${name.slice(1)}\`, which removes the attribute on false and writes it otherwise (spec 3.1).`);
        continue;
      }
      attrs.push({ name, value });
      continue;
    }
    if (kind.kind === 'for') continue; // resolved above
    if (kind.kind === 'key') {
      keyValue = value;
      continue;
    }
    // `.="x"`, `:="x"`, `@="x"`, `seed:="x"`: the punctuation classified and
    // named nothing. Without this the binding lands with an empty name and a
    // renderer writes `setAttr(el, '', ...)` or a nameless JSX prop, which is
    // a page that renders wrong rather than a page that was refused.
    if (kind.target === '') {
      fail(ctx, line, `"${name}" names no target: a binding is spelled \`.prop\`, \`:attr\`, \`@event\`, \`#ref\` or \`seed:attr\`, with the name after the punctuation (spec 3.1).`);
      continue;
    }
    if (kind.kind === 'ref') {
      if (!IDENT.test(value)) {
        fail(ctx, line, `#ref="${value}": a ref name is a plain identifier.`);
        continue;
      }
      if (ctx.refs.includes(value)) {
        fail(ctx, line, `#ref="${value}" is declared twice; a ref names one element.`);
        continue;
      }
      ctx.refs.push(value);
      refName = value;
      bindings.push({ kind: 'ref', raw: '#ref', name: value, value, line });
      continue;
    }
    if (kind.kind === 'seed') {
      bindings.push({ kind: 'seed', raw: name, name: kind.target, value, line });
      continue;
    }
    if (kind.kind === 'event') {
      // AN EVENT BINDS ON A kai- ELEMENT ONLY -- the one exception to
      // "binding kinds are element-agnostic" (spec 3.1, amended). The html
      // binder would happily `addEventListener('keydown')`, but React's
      // native handler names are not derivable from `on<Name>`: `keydown` is
      // `onKeyDown`, and `change` does not even mean the same event there. So
      // the react form has no translation, and one page refused by one
      // renderer is the two-renderers-disagree defect this contract removes.
      // Decided here rather than in the renderer, because the grammar is where
      // the shape is decided (R21).
      if (!el.tagName.startsWith('kai-')) {
        fail(
          ctx,
          line,
          `${name}="${value}" is on <${el.tagName}>, a plain HTML element. Events bind on \`kai-*\` elements, which emit \`kai-*\` CustomEvents: wrap the interaction in the element that owns it (\`kai-button\` for a click, \`kai-input\` for typing) and bind its \`@kai-\` event.`,
        );
        continue;
      }
      if (!IDENT.test(value)) {
        fail(ctx, line, `${name}="${value}": an event binds ONE action name, an identifier the controller exports.`);
        continue;
      }
      bindings.push({ kind: 'event', raw: name, name: kind.target, value, line });
      continue;
    }
    // prop | attr
    const sink = sinkRefusal(name, value, (kind.kind === 'prop' ? camel(kind.target) : kind.target).toLowerCase());
    if (sink) {
      fail(ctx, line, sink);
      continue;
    }
    if (!checkValue(ctx, line, name, value, inScope)) continue;
    bindings.push({
      kind: kind.kind,
      raw: name,
      name: kind.kind === 'prop' ? camel(kind.target) : kind.target,
      value,
      line,
    });
  }

  if (repeat) {
    if (keyValue === undefined) {
      fail(ctx, line, `*for="${repeat.item} of ${repeat.list}" carries no :key. :key is mandatory: the kai- reactivity contract is reference-keyed and every host framework needs a key anyway (spec 3.1).`);
    } else {
      const dotted = DOTTED.exec(keyValue);
      if (!dotted || dotted[1] !== repeat.item) {
        fail(ctx, line, `:key="${keyValue}" must be dotted from the loop item, e.g. :key="${repeat.item}.id".`);
      } else {
        repeat.key = keyValue;
      }
    }
    if (!hasParent) {
      fail(ctx, line, `*for needs a parent element to rebuild its rows into; a repeated element cannot be a top-level child of <body>.`);
    }
    if (refName !== undefined) {
      fail(ctx, line, `an element carrying *for cannot also carry \`#ref\`: the ref would name one of many rows.`);
    }
    // A `*for` inside a `*for` subtree has no answer in the binder, and the
    // binder would not say so: the inner repeat ships as its own <template>
    // nested inside the outer one's content, where a document-scope
    // `querySelector('template[data-kai-for="N"]')` cannot reach it, and its
    // row setters would address markers that only exist per outer clone. The
    // refusal is here rather than in the renderer because the grammar is
    // where the shape is decided (R21).
    if (scope !== undefined) {
      fail(ctx, line, `*for="${repeat.item} of ${repeat.list}" is a nested \`*for\`, inside the \`*for\` that declares \`${scope}\`. The binder clones ONE template per repeat, from document scope, and has no answer for a template inside a template: lift the inner list onto its own element outside the repeat.`);
    }
  } else if (keyValue !== undefined) {
    fail(ctx, line, `:key="${keyValue}" is only legal on an element carrying \`*for\`.`);
  }

  // Markers are numbered in DOCUMENT order, so this element takes its number
  // BEFORE its children take theirs. The binder addresses elements by walking
  // the emitted tree in the same order, so a post-order counter would hand the
  // parent its child's address.
  const marker = bindings.length > 0 || repeat ? ctx.marker++ : undefined;

  const childScope = repeat ? repeat.item : scope;
  const children = convertChildren(el, ctx, childScope, true);

  // `#ref` and `seed:` name ONE element, and a repeat has none: inside a
  // `*for` subtree both would resolve to whichever clone the binder reached
  // last. `scope !== undefined` IS "inside a repeat subtree", because the
  // scope is set by the enclosing `*for` and by nothing else; the repeated
  // element itself is covered by the `#ref`-and-`*for`-are-exclusive check
  // above, which names its own reason.
  if (scope !== undefined) {
    for (const b of bindings) {
      if (b.kind === 'ref' || b.kind === 'seed') {
        fail(ctx, line, `${b.raw}="${b.value}" is inside a \`*for\` subtree. \`#ref\` and \`seed:\` name one element, and a repeated element is many.`);
      }
    }
  }

  const node: Extract<TemplateNode, { type: 'element' }> = { type: 'element', tag: el.tagName, attrs, bindings, children, line };
  if (repeat) node.repeat = repeat;
  if (marker !== undefined) node.marker = marker;
  return node;
}

/** Every element carrying `data-block-root`, with its line -- the marker the
 *  component-framework renderers cut the tree at. */
function findBlockRoots(nodes: readonly TemplateNode[]): Extract<TemplateNode, { type: 'element' }>[] {
  const out: Extract<TemplateNode, { type: 'element' }>[] = [];
  for (const node of nodes) {
    if (node.type !== 'element') continue;
    if (node.attrs.some((a) => a.name === 'data-block-root')) out.push(node);
    out.push(...findBlockRoots(node.children));
  }
  return out;
}

/** `hasParent` is whether `parent` is an ELEMENT. Body's own children have no
 *  parent element, which is the one thing the `*for` rule below turns on, so
 *  it is threaded rather than assumed true. */
function convertChildren(parent: P5Parent, ctx: Ctx, scope: string | undefined, hasParent: boolean): TemplateNode[] {
  const out: TemplateNode[] = [];
  for (const child of childrenOf(parent)) {
    if (isElement(child)) {
      if (child.tagName === 'script') {
        failScript(ctx, child);
        continue;
      }
      // parse5 puts a template's children on its `.content` fragment, so
      // `childrenOf` returns NOTHING for one and the whole subtree, bindings
      // included, would be dropped without a word. The row template is
      // generated from `*for`, so an authored one is refused rather than
      // walked.
      if (child.tagName === 'template') {
        fail(
          ctx,
          lineOf(child),
          `the page carries a <template>. Its children live on the element's \`.content\` fragment rather than in the tree, so nothing inside it is parsed at all, and the row template is GENERATED from \`*for\` (spec 3.1): author the row markup as the \`*for\` element itself.`,
        );
        continue;
      }
      out.push(convertElement(child, ctx, scope, hasParent));
      continue;
    }
    if (child.nodeName === '#text') {
      const text = (child as DefaultTreeAdapterMap['textNode']).value;
      if (text.trim().length === 0) continue;
      out.push({ type: 'text', text });
      continue;
    }
    if (child.nodeName === '#comment') {
      out.push({ type: 'comment', text: (child as DefaultTreeAdapterMap['commentNode']).data });
    }
  }
  return out;
}

function collectKaiTags(nodes: readonly TemplateNode[], into: Set<string>): void {
  for (const node of nodes) {
    if (node.type !== 'element') continue;
    if (node.tag.startsWith('kai-')) into.add(node.tag);
    collectKaiTags(node.children, into);
  }
}

export function parseTemplate(html: string, where: string): { template?: ParsedTemplate; errors: string[] } {
  const ctx: Ctx = { where, source: html, errors: [], refs: [], marker: 0 };
  const doc = parse(html, { sourceCodeLocationInfo: true });
  const htmlEl = findChild(doc, 'html');
  const head = htmlEl && findChild(htmlEl, 'head');
  const body = htmlEl && findChild(htmlEl, 'body');
  if (!htmlEl || !head || !body) {
    return { errors: [`${where}: the block page needs <html>, <head> and <body>; the html form emits the whole document.`] };
  }

  // parse5 SYNTHESIZES html/head/body for a fragment, with a null
  // sourceCodeLocation on the synthesized node (measured: `parse('<!doctype
  // html><kai-thread>')` yields all three, head.sourceCodeLocation === null).
  // That is what keeps the fragment-shaped pages in the existing contract
  // tests parseable, and it is why every offset read below is optional.
  const headStart = head.sourceCodeLocation?.startTag?.endOffset ?? 0;
  const headEnd = head.sourceCodeLocation?.endTag?.startOffset ?? headStart;
  const headInner = html.slice(headStart, headEnd);

  const stylesheets: string[] = [];
  for (const child of childrenOf(head)) {
    if (!isElement(child)) continue;
    if (child.tagName === 'script') {
      failScript(ctx, child);
      continue;
    }
    if (child.tagName !== 'link') continue;
    if (child.attrs.find((a) => a.name === 'rel')?.value !== 'stylesheet') continue;
    const href = child.attrs.find((a) => a.name === 'href')?.value ?? '';
    if (href.startsWith('./')) stylesheets.push(href.slice(2));
  }

  const nodes = convertChildren(body, ctx, undefined, false);
  const kai = new Set<string>();
  collectKaiTags(nodes, kai);

  // Exactly one block root. Zero means a component renderer would emit the
  // host chrome the page carries so the html form is a runnable PAGE (the
  // "this blank page stands in for your site" paragraph); two has no answer.
  const roots = findBlockRoots(nodes);
  if (roots.length !== 1) {
    ctx.errors.push(
      roots.length === 0
        ? `${where}: no element carries \`data-block-root\`. Mark the ONE element that IS the block: the html and cdn forms render the whole page, and every component-framework renderer emits that subtree only (spec 3.1, as amended by PR B).`
        : `${where}: ${roots.length} elements carry \`data-block-root\` (lines ${roots.map((r) => r.line).join(', ')}). Exactly one element is the block.`,
    );
  }

  if (ctx.errors.length) return { errors: ctx.errors };
  return {
    template: {
      lang: htmlEl.attrs.find((a) => a.name === 'lang')?.value ?? 'en',
      bodyAttrs: body.attrs.map((a) => ({ name: a.name, value: a.value })),
      headInner,
      body: nodes,
      stylesheets,
      kaiTags: [...kai].sort(),
      refs: ctx.refs,
      markerCount: ctx.marker,
      blockRoot: roots[0],
    },
    errors: [],
  };
}

/** Every element node, document order -- what a renderer or a checker walks. */
export function walkElements(nodes: readonly TemplateNode[]): Extract<TemplateNode, { type: 'element' }>[] {
  const out: Extract<TemplateNode, { type: 'element' }>[] = [];
  for (const node of nodes) {
    if (node.type !== 'element') continue;
    out.push(node);
    out.push(...walkElements(node.children));
  }
  return out;
}
