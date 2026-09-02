// Load the kai-* element bundle once (idempotent). Mirrors the docs site's
// example/kit.ts: the bundle registers its elements ASYNCHRONOUSLY (it
// dynamic-imports its impl chunk for SSR-safety), so the import resolving does
// NOT mean elements are defined — wait for kai-chat (the register-all bundle
// registers everything together, so one guard covers every element).
//
// The specifier is the package's own `./elements` export. In the docs site's
// bundle it resolves through the workspace exactly like the docs' own loadKit
// (same resolved module → one registration, no double define). In the
// STANDALONE app build it is external (KAI_BUILD=theme-studio,
// config/vite/page.ts) and
// rewritten to /theme-studio/kit/kai.es.js — the dist bundle, served by the
// construct dev server's /theme-studio/kit/* route — so dist/theme-studio
// never re-bundles the kit.
let kitPromise: Promise<unknown> | undefined;

export function loadKit(): Promise<unknown> {
  // For tsc this specifier resolves through the `paths` mapping in
  // tsconfig.json (export-map self-resolution trips TS2209 on this layout);
  // bundlers never read tsconfig paths and resolve the real export map.
  kitPromise ??= import('@kitn.ai/ui/elements').then(async (mod: unknown) => {
    await customElements.whenDefined('kai-chat');
    return mod;
  });
  return kitPromise;
}
