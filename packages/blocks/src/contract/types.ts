/**
 * The vocabulary the parsed page and the parsed controller are expressed in.
 * Every renderer consumes THESE types and never re-reads the source, which is
 * what makes "the renderers agree about what a binding means" checkable.
 */

/** An attribute the renderers pass through unchanged. */
export interface LiteralAttr {
  name: string;
  value: string;
}

export type BindingKind = 'prop' | 'attr' | 'event' | 'ref' | 'seed';

export interface Binding {
  kind: BindingKind;
  /** The authored spelling, case preserved: `.textContent`, `:hidden`, `@kai-click`. */
  raw: string;
  /** prop: the camelCase property. attr/seed: the authored attribute name.
   *  event: the event name. ref: the ref name. */
  name: string;
  /** prop/attr: the controller field (`row.title` inside a `*for`).
   *  event: the action name. ref: the ref name. seed: the literal. */
  value: string;
  line: number;
}

/** A `*for="item of list"` with its mandatory `:key`. */
export interface Repeat {
  item: string;
  list: string;
  /** Always dotted from `item`, e.g. `row.id`. */
  key: string;
  line: number;
}

export type TemplateNode =
  | {
      type: 'element';
      tag: string;
      attrs: LiteralAttr[];
      bindings: Binding[];
      repeat?: Repeat;
      /** The binder's address for this element, assigned to every element that
       *  carries a binding or a repeat. Absent means "nothing to wire". */
      marker?: number;
      children: TemplateNode[];
      line: number;
    }
  | { type: 'text'; text: string }
  | { type: 'comment'; text: string };

export interface ParsedTemplate {
  /** `<html lang>`, so the emitted page keeps it. */
  lang: string;
  /** The literal attributes on `<body>`. */
  bodyAttrs: LiteralAttr[];
  /** The original source of everything inside `<head>`, verbatim. */
  headInner: string;
  body: TemplateNode[];
  /** Relative stylesheet hrefs the page linked, in order, without `./`. */
  stylesheets: string[];
  /** Every `kai-*` tag the page renders, sorted and deduped. */
  kaiTags: string[];
  /** Every `#ref` name, in document order. */
  refs: string[];
  markerCount: number;
  /** The one element marked `data-block-root`: what a COMPONENT-framework
   *  renderer emits. The html and cdn forms render the whole `body` instead,
   *  because they are a page and the rest of it is the host stand-in. */
  blockRoot: Extract<TemplateNode, { type: 'element' }>;
}

/** One rendered file of a delivery form.
 *
 *  It lives HERE rather than in src/forms/index.ts so that `html.ts` and
 *  `react.ts` can name it without importing their own barrel: index.ts
 *  re-exports every renderer, so a renderer importing index.ts is a cycle.
 *  `path` is the file name relative to wherever the caller mounts the form;
 *  `target` is the project-relative path from src/targets.ts. */
export interface FormFile {
  path: string;
  content: string;
  target: string;
}

/** What `analyze-controller` reads off `<id>.controller.ts`. */
export interface ControllerShape {
  /** `componentName(block.name)`, the prefix every exported type carries. */
  name: string;
  stateFields: string[];
  actionNames: string[];
  /** How many parameters each action DECLARES, by name.
   *
   *  Only the angular form reads it, and only because an Angular event binding
   *  is a statement: the action is CALLED in the template, and
   *  `strictTemplates` checks that call in both directions. Additive on
   *  purpose: `actionNames` keeps its exact meaning, so html.ts, react.ts and
   *  checkBlockContracts do not move. */
  actionArity: Record<string, number>;
  refNames: string[];
}
