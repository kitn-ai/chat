// The kai-* autoloader (opt-in, additive — the Web Awesome model).
//
// Include this ONE module (via a CDN/static `<script type="module">` tag) and it
// watches the DOM for undefined kai-* elements and dynamically imports each
// element's module on demand — so a page that only uses <kai-chat> never downloads
// the others. The register-all bundle (@kitn.ai/ui/elements) stays the default;
// this is the delivery for NO-BUILD / CDN / static-served pages.
//
// IMPORTANT — this is a CDN / static-file pattern (it resolves sibling element
// modules relative to its own URL). It is NOT importable through a bundler: Vite /
// webpack relocate `import.meta.url` away from the element files and cannot analyze
// the dynamic import, so it 404s. In a BUNDLED app use per-element imports
// (`import '@kitn.ai/ui/elements/<el>'`) or the register-all bundle. (Advanced: host
// dist/elements/ yourself and call setAutoloaderBasePath('<url>/') before use.)
//
// Tag → module is resolved through the generated manifest (filenames don't always
// equal the tag, and some modules register more than one tag), and modules are
// fetched relative to THIS module's URL.
import manifest from './element-manifest.json';

const tagToModule: Record<string, string> = manifest.tags;
const inFlight = new Set<string>();

// Base = the directory of this module. Computed via string ops on import.meta.url
// (NOT `new URL('./x', import.meta.url)`, which Vite rewrites into a static-asset
// glob that resolves to undefined at runtime).
const BASE = import.meta.url.slice(0, import.meta.url.lastIndexOf('/') + 1);

/** Override where element modules are fetched from (e.g. a CDN). Call before use. */
let baseOverride: string | null = null;
export function setAutoloaderBasePath(path: string): void {
  baseOverride = path.endsWith('/') ? path : path + '/';
}

async function register(tag: string): Promise<void> {
  if (customElements.get(tag) || inFlight.has(tag)) return;
  const file = tagToModule[tag];
  if (!file) return; // not one of ours
  inFlight.add(tag);
  try {
    await import(/* @vite-ignore */ `${baseOverride ?? BASE}${file}.js`);
  } catch (err) {
    inFlight.delete(tag);
    warnOnce(tag, err);
  }
}

// One actionable warning per session (the failure is almost always "imported
// through a bundler" — see the header note), instead of a silent per-tag error.
let warned = false;
function warnOnce(tag: string, err: unknown): void {
  if (warned) return;
  warned = true;
  const msg = (err as { message?: string })?.message ?? String(err);
  // eslint-disable-next-line no-console
  console.warn(
    `[kai-autoloader] could not load "${tag}" (${msg}). The autoloader is a CDN / ` +
      `static-file tool — load it from a <script type="module" src=".../@kitn.ai/ui/dist/elements/autoloader.js">. ` +
      `It is NOT importable through a bundler. In a bundled app, register elements with per-element imports ` +
      `(import '@kitn.ai/ui/elements/<el>') or the register-all bundle (import '@kitn.ai/ui/elements'). To drive ` +
      `the autoloader from a bundler, host dist/elements/ and call setAutoloaderBasePath('<url>/') before use.`,
  );
}

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
 *
 * Exported for its unit test: the walk is the whole rule, and `discover`'s own
 * effect is a dynamic import no test should be made to run.
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

function discover(root: ParentNode | Element): void {
  undefinedAutoloadableTags(root).forEach(register);
}

/** Start watching `root` (default: the whole document) for undefined kai-* elements. */
export function startAutoloader(root: ParentNode = document): void {
  discover(root as Element);
  new MutationObserver((mutations) => {
    for (const m of mutations)
      for (const node of m.addedNodes)
        if (node.nodeType === 1) discover(node as Element);
  }).observe(document.documentElement, { childList: true, subtree: true });
}

// Self-start on import (the <script type="module"> use case). Deferred to a
// microtask so a consumer that calls setAutoloaderBasePath() right after importing
// (the advanced bundler-from-CDN path) takes effect before the first discovery pass.
if (typeof document !== 'undefined') queueMicrotask(() => startAutoloader());
