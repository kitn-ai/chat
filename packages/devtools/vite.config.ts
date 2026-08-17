import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The shipped panel: ONE self-contained ES module, delivered by script tag from
// a CDN.
//
// NO EXTERNALS, deliberately. A CMS script slot has no import map and no
// bundler, so anything left external would 404 at the only delivery point that
// matters. The panel imports nothing from @kitn.ai/ui at runtime either -- it
// talks to `window.__KAI_DEVTOOLS_HOOK__`, and the kit's types are erased at
// build. That is what lets an old panel meet a new kit and vice versa.
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'kai-devtools.es.js',
    },
    rollupOptions: { external: [] },
  },
});
