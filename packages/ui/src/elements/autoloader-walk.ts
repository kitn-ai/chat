/**
 * The autoloader's tag walk. INTERNAL: this module is not in the package's
 * `exports` map and is re-exported from no entry, so nothing here is part of
 * the published surface of `@kitn.ai/ui/autoloader` (whose declarations are
 * the two functions `scripts/gen-element-dts.mjs` emits, and stay that way).
 * It exists as its own file so the walk has a unit test that imports it
 * directly, rather than the walk becoming a public export for a test's sake.
 *
 * `autoloader.ts` keeps `discover()` two lines over it: the walk decides
 * WHICH tags, `discover` does the registering.
 */
import manifest from './element-manifest.json';

const tagToModule: Record<string, string> = manifest.tags;

/**
 * Every kai-* tag under `root` (root included) that this autoloader knows and
 * that is not defined yet.
 *
 * `<template>` CONTENT COUNTS, and that is the part that is easy to get wrong.
 * A template's children live on its `.content` DocumentFragment rather than in
 * the tree, so `querySelectorAll` walks straight past them -- and a generated
 * block page ships its repeated row markup inside a template, where the row's
 * tag is often its only occurrence on the page. Missing it is a DEADLOCK
 * rather than a slow path: a page that awaits `customElements.whenDefined`
 * before its first render never reaches the render that would have put a row
 * in the live DOM for the MutationObserver to see.
 *
 * `:not(:defined)` is not used for the template pass, because a fragment's
 * elements are not upgraded regardless; the defined check is explicit here so
 * both passes answer the same question.
 */
export function undefinedAutoloadableTags(root: ParentNode | Element): string[] {
  const tags = new Set<string>();
  const add = (tag: string): void => {
    if (tag in tagToModule && !customElements.get(tag)) tags.add(tag);
  };
  const walk = (node: ParentNode | Element): void => {
    const self = (node as Element).tagName?.toLowerCase?.();
    if (self) add(self);
    if (self === 'template') {
      walk((node as HTMLTemplateElement).content);
      return;
    }
    node.querySelectorAll?.('*').forEach((el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'template') walk(el as HTMLTemplateElement);
      else add(tag);
    });
  };
  walk(root);
  return [...tags];
}
