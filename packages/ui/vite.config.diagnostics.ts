import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { resolve } from 'node:path';

// The devtools recorder hook (@kitn.ai/ui/diagnostics). The browser-only half of
// the diagnostic stream: it installs window.__KAI_DEVTOOLS_HOOK__ and holds the
// session buffer, while src/wire produces the events and touches no global.
// Compiled to dist/diagnostics.js. The .d.ts is emitted by the barrel build
// (entryRoot src -> dist/diagnostics/index.d.ts), so this build is JS-only.
// emptyOutDir:false — the main build ran first; do NOT clobber.
export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/diagnostics/index.ts'),
      formats: ['es'],
      fileName: () => 'diagnostics.js',
    },
    rollupOptions: { external: ['solid-js', 'solid-js/web', 'solid-js/store'] },
  },
});
