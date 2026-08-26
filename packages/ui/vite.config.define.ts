import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { resolve } from 'node:path';

// The facade seam (@kitn.ai/ui/define). Sibling of vite.config.state.ts: one
// small public entry, browser lib build, solid-js external (the consumer
// project provides it), emptyOutDir false because the main build already
// populated dist/.
//
// The .d.ts is NOT emitted here. The barrel build (vite-plugin-dts over
// src/**, entryRoot: 'src') already emits dist/elements/define-entry.d.ts —
// but this subpath's declared `types` is the flat dist/define.d.ts, matching
// the flat dist/define.js this build produces, so scripts/emit-subpath-dts.mjs
// generates dist/define.d.ts as a shim onto the barrel's real declarations
// (see REAL_TYPES_SOURCE in that script). This build is JS-only.
export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/elements/define-entry.ts'),
      formats: ['es'],
      fileName: () => 'define.js',
    },
    rollupOptions: { external: ['solid-js', 'solid-js/web', 'solid-js/store'] },
  },
});
