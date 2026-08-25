import { defineConfig } from 'vite';
import solidPlugin from '@solidjs/vite-plugin' // V2-PORT: the Solid 2 compiler plugin;
import { resolve } from 'node:path';

// Framework-neutral state core (@kitn.ai/ui/state). Pure functions over
// ChatMessage[] — no React/Solid runtime — compiled to dist/state.js. The .d.ts
// is emitted by the barrel build (entryRoot src → dist/state/index.d.ts), so this
// build is JS-only. emptyOutDir:false — the main build ran first; do NOT clobber.
export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/state/index.ts'),
      formats: ['es'],
      fileName: () => 'state.js',
    },
    rollupOptions: { external: ['solid-js', '@solidjs/web'] /* V2-PORT: the v2 package split */ },
  },
});
