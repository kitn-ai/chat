import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { resolve } from 'node:path';

// Server-safe twin of vite.config.barrel.ts → dist/index.server.js, wired into the
// package's "." export under the `node` condition.
//
// WHY: vite.config.barrel.ts compiles the barrel with Solid's DOM transform, which
// emits 121 module-scope `template("<div>")` calls and 24 module-scope
// `delegateEvents([...])` calls. It also (correctly) leaves solid-js external. Under
// Node, `solid-js/web` resolves to Solid's SERVER build, where `template` is the
// `notSup` stub — so merely IMPORTING `@kitn.ai/ui` on a server threw
// "Client-only API called on the server side" and hard-failed any SSR/prerender pass
// that touched a value export. Bundling solid-js instead does NOT fix it: the client
// runtime's `delegateEvents(events, doc = window.document)` then throws
// "window is not defined" at module scope, and every Solid consumer gets a duplicated
// reactive runtime. The transform is the problem, not the resolution — so we ship a
// second bundle compiled with Solid's SSR transform, which emits `ssr` template
// strings and no event delegation at all.
//
// hydratable: false — deliberately matched to the DOM build, which vite-plugin-solid
// compiles with hydratable: false. Hydration needs BOTH halves flipped together;
// flipping only this one would emit hydration keys the client build cannot consume.
// This entry exists so a server can IMPORT the barrel (and render static markup),
// not so it can hand off to hydrate().
//
// Externals are identical to the DOM build: the host provides solid-js, and under Node
// that resolves to Solid's server renderer, which is exactly what this output targets.
//
// emptyOutDir: false — later build in the chain; do NOT clobber earlier output.
export default defineConfig({
  plugins: [
    // `solid` overrides the preset options the plugin would otherwise pick from
    // Vite's ssr flag, so the SSR transform applies to a plain (non-build.ssr) lib
    // build and bundling/externalization stay identical to the DOM barrel build.
    solidPlugin({ solid: { generate: 'ssr', hydratable: false } }),
  ],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.server.js',
    },
    rollupOptions: {
      external: ['solid-js', 'solid-js/web', 'solid-js/store', 'solid-element'],
    },
  },
});
