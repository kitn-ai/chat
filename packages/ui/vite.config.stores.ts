import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { resolve } from 'node:path';

// The conversation stores (@kitn.ai/ui/stores). localStorageStore/fetchStore +
// the ConversationStore contract helpers — plain solid-free glue (I/O, so NOT
// part of ./state, whose contract is pure folds) compiled to a self-contained
// dist/stores.js so a no-bundler CDN page can reach the built-ins the root
// export (which bare-imports solid-js) denies it. See src/stores/index.ts for
// the full decision record. solid-js stays external here for symmetry with the
// other lib builds; the entry must not actually pull it in at runtime, and
// `verify:cdn-entries` (postbuild) fails the build if any bare import appears
// in the emitted bundle. The .d.ts is emitted by the barrel build (entryRoot
// src → dist/stores/index.d.ts), so this build is JS-only.
// emptyOutDir: false — the main build ran first; do NOT clobber.
export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/stores/index.ts'),
      formats: ['es'],
      fileName: () => 'stores.js',
    },
    rollupOptions: { external: ['solid-js', 'solid-js/web', 'solid-js/store'] },
  },
});
