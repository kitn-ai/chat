import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { resolve } from 'node:path';

// Server-safe twin of vite.config.solid.ts → dist/solid.server.js, wired into the
// package's "./solid" export under the `node` / `deno` / `worker` conditions.
//
// This exists for exactly the reason vite.config.barrel.server.ts does, and the
// reasoning there is the full story. In short: the DOM build compiles Solid's
// client transform, which emits module-scope `template(...)` and `delegateEvents(...)`
// calls. Under Node, `solid-js/web` resolves to Solid's SERVER build where
// `template` is the `notSup` stub, so merely IMPORTING the entry threw
// "Client-only API called on the server side" and hard-failed any SSR/prerender/RSC
// pass. That bug was live on npm through 0.19.0 for "."; shipping `./solid` without
// a server twin would reintroduce it on a brand-new entry, and `verify:ssr` (which
// derives its entry list from the exports map) would fail the build the day
// "./solid" was added.
//
// hydratable: false — matched to the DOM build, exactly as the barrel pair is.
// This entry exists so a server can IMPORT the Solid surface and render static
// markup, not so it can hand off to hydrate().
//
// emptyOutDir: false — later build in the chain; do NOT clobber earlier output.
export default defineConfig({
  plugins: [
    // `solid` overrides the preset options the plugin would otherwise pick from
    // Vite's ssr flag, so the SSR transform applies to a plain (non-build.ssr) lib
    // build and bundling/externalization stay identical to the DOM build.
    solidPlugin({ solid: { generate: 'ssr', hydratable: false } }),
  ],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/solid.ts'),
      formats: ['es'],
      fileName: () => 'solid.server.js',
    },
    rollupOptions: {
      external: ['solid-js', 'solid-js/web', 'solid-js/store', 'solid-element'],
    },
  },
});
