/**
 * What every COMPONENT-framework renderer does before it emits a line.
 *
 * The html and cdn forms render the whole page; react, vue, svelte, angular and
 * solid render the block ROOT and share the same five steps: parse the page,
 * refuse a page with no `data-block-root`, analyze the controller, cross-check
 * the bindings against it, and work out which element interfaces the refs need.
 *
 * NOT './index': index.ts re-exports every renderer, so importing the barrel
 * from one is a cycle. Same reason `FormFile` lives in ../contract/types.
 *
 * react.ts is deliberately NOT refactored onto this. A renderer that already
 * ships, with a compile cell and a runtime cell behind it, does not get rewritten
 * inside the PR that adds four more; folding it in is a small-tickets item.
 */
import { parseTemplate, walkElements } from '../contract/parse-template';
import { analyzeController, crossCheckBindings } from '../contract/analyze-controller';
import { pascal, type Block } from '../registry';
import type { ControllerShape, FormFile, ParsedTemplate, TemplateNode } from '../contract/types';

type ElementNode = Extract<TemplateNode, { type: 'element' }>;

export const isKai = (tag: string): boolean => tag.startsWith('kai-');
/** `kai-view-stack` -> `ViewStack`. */
export const pascalTag = (tag: string): string => pascal(tag.replace(/^kai-/, ''));
/** `conversation-id` -> `conversationId`. */
export const camel = (name: string): string => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/**
 * A literal attribute VALUE, for the double-quoted attribute every renderer
 * below writes it into.
 *
 * It lives here because there was nowhere else: `react.ts` has `jsString` and
 * `jsxText`, and neither is an attribute escaper, so a renderer reaching for
 * one of those would be escaping for the wrong context. `&` first, or the
 * ampersand of an entity this function itself introduced gets escaped twice.
 * `<` is escaped too: it is legal in an attribute value in HTML but not in the
 * XML-ish templates Vue and Angular parse.
 */
export const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The element interface a `#ref` hands the controller.
 *
 * DERIVED, by the same rule react.ts states and
 * packages/ui/mcp/tests/blocks-artifacts.test.ts asserts for every element the
 * kit declares: `Kai` + PascalCase of the tag minus `kai-` + `Element`. A `#ref`
 * on a plain tag gets `HTMLElement`, because there is nothing narrower to
 * derive and inventing one would not compile.
 */
export const elementInterface = (tag: string): string =>
  isKai(tag) ? `Kai${pascalTag(tag)}Element` : 'HTMLElement';

export interface ParsedBlock {
  /** `pascal(block.name)`: the component name every emitted file is named for. */
  name: string;
  /** The authored page's path, e.g. `fixture.html`. */
  pagePath: string;
  /** `<id>.controller.ts`. */
  controllerPath: string;
  template: ParsedTemplate;
  shape: ControllerShape;
  /** The `data-block-root` element with the marker attribute removed: what a
   *  component-framework renderer emits, never the page. */
  root: ElementNode;
  /** Every `kai-` tag the ROOT subtree renders, sorted and deduped. Collected
   *  over the root rather than read off `template.kaiTags`, which is the whole
   *  body: an element in the host stand-in is not in the emitted tree, so
   *  awaiting its registration would await a definition this tree never uses. */
  tags: string[];
  /** `#ref` name -> the element interface it hands back, in document order. */
  refTypes: Map<string, string>;
}

export function parseBlock(block: Block, form: string): ParsedBlock {
  const pageEntry = block.manifest.files.find((file) => file.type === 'registry:page');
  if (!pageEntry) throw new Error(`${block.name}: no registry:page entry to render the ${form} form from`);
  const parsed = parseTemplate(block.files.get(pageEntry.path) as string, `${block.name}/${pageEntry.path}`);
  if (!parsed.template) throw new Error(`${block.name}: ${parsed.errors.join('; ')}`);

  const name = pascal(block.name);
  const controllerPath = `${block.name}.controller.ts`;
  const controllerSource = block.files.get(controllerPath);
  if (controllerSource === undefined) throw new Error(`${block.name}: the ${form} form needs ${controllerPath} (spec 3.2)`);
  const analysis = analyzeController(controllerSource, name, `${block.name}/${controllerPath}`);
  if (!analysis.shape) throw new Error(`${block.name}: ${analysis.errors.join('; ')}`);

  // The cross-check is not the gate's alone: `create-kai add` and `kai dev`
  // render without ever running checkBlockContracts, so it runs HERE too or
  // those two front doors emit a tree that calls a function nobody exports.
  const crossErrors = crossCheckBindings(parsed.template, analysis.shape, `${block.name}/${pageEntry.path}`);
  if (crossErrors.length) throw new Error(`${block.name}: ${crossErrors.join('; ')}`);

  const root = parsed.template.blockRoot;
  const subtree = walkElements([root]);
  const refTypes = new Map<string, string>();
  for (const element of subtree) {
    for (const binding of element.bindings) {
      if (binding.kind === 'ref') refTypes.set(binding.value, elementInterface(element.tag));
    }
  }

  return {
    name,
    pagePath: pageEntry.path,
    controllerPath,
    template: parsed.template,
    shape: analysis.shape,
    root: { ...root, attrs: root.attrs.filter((a) => a.name !== 'data-block-root') },
    tags: [...new Set(subtree.filter((el) => isKai(el.tag)).map((el) => el.tag))].sort(),
    refTypes,
  };
}

/** The block's own files, carried into a component tree unchanged: everything
 *  but the page and the generated `.js` twins, which only the html and cdn
 *  forms ship. */
export function carriedFiles(block: Block, target: (path: string) => string): FormFile[] {
  const out: FormFile[] = [];
  for (const entry of block.manifest.files) {
    if (entry.type === 'registry:page') continue;
    if (entry.path.endsWith('.js')) continue;
    out.push({ path: entry.path, content: block.files.get(entry.path) as string, target: target(entry.path) });
  }
  return out;
}

/** The refs object literal every adapter seeds itself with: every declared ref
 *  name, null. Same shape react's `useRef<Refs>({ ... })` takes. */
export const nullRefs = (shape: ControllerShape): string =>
  `{ ${shape.refNames.map((r) => `${r}: null`).join(', ')} }`;
