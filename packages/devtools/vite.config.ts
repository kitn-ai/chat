import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { resolve } from 'node:path';

// The shipped panel: ONE self-contained ES module, delivered by script tag.
//
// NO EXTERNALS. The panel is written in SolidJS against the kit's own
// primitives, and every one of them plus Solid's runtime compiles INTO this
// file. That IS the decoupling: the requirement was never "do not use the kit",
// it was that the panel must not resolve the CONSUMER'S installed copy, because
// it is CDN-delivered and versions independently of whatever the page has.
// Carrying its own copy satisfies that completely.
//
// A CMS script slot has no import map either, so anything left external would
// 404 at the one delivery point that matters. `verify:imports` asserts the built
// file contains zero bare specifiers.
//
// ORDERING: the kit must be built first (`nx build ui`), because
// `@kitn.ai/ui/solid` resolves through its exports map to dist/solid.js.
export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'kai-devtools.es.js',
    },
    rollupOptions: { external: [] },
  },
});
