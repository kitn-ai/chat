import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { resolve } from 'node:path';

// Server-safe twin of vite.config.define.ts → dist/define.server.js, wired into
// the package's "./define" export under the `node` / `deno` / `worker`
// conditions.
//
// This exists for exactly the reason vite.config.solid.server.ts and
// vite.config.barrel.server.ts do, and the reasoning there is the full story.
// In short: the DOM build compiles Solid's client transform, which emits
// module-scope `template(...)` calls for define.tsx's own JSX (the facade
// wrapper's `<style>` and outer `<div>`) — hoisted to module scope regardless
// of the function they render inside, which is what makes this a MODULE-LOAD
// failure rather than a call-time one. Under Node, `solid-js/web` resolves to
// Solid's SERVER build where `template` is the `notSup` stub, so merely
// IMPORTING the entry threw "Client-only API called on the server side" and
// hard-failed `verify:ssr` (verify-ssr-imports.mjs derives its entry list from
// the exports map, so a new entry with no server twin fails the build the day
// it is added — same shape this repo already hit twice for "." and "./solid").
//
// defineWebComponent() ITSELF is already SSR-safe by construction (`typeof
// customElements === 'undefined'` short-circuits before ever calling
// solid-element's customElement()) — this fix is unrelated to that call-time
// guard. It is purely about the module load succeeding at all.
//
// hydratable: false — matched to the DOM build and the solid.server pair.
//
// emptyOutDir: false — later build in the chain; do NOT clobber earlier output.
export default defineConfig({
  plugins: [
    // `solid` overrides the preset options the plugin would otherwise pick
    // from Vite's ssr flag, so the SSR transform applies to a plain
    // (non-build.ssr) lib build and bundling/externalization stay identical
    // to the DOM build.
    solidPlugin({ solid: { generate: 'ssr', hydratable: false } }),
  ],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/elements/define-entry.ts'),
      formats: ['es'],
      fileName: () => 'define.server.js',
    },
    // solid-element is deliberately NOT external, matching vite.config.define.ts:
    // it is not a declared peer, so this entry bundles it for consumers, same
    // as the DOM twin.
    rollupOptions: { external: ['solid-js', 'solid-js/web', 'solid-js/store'] },
  },
});
