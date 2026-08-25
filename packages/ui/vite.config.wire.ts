import { defineConfig } from 'vite';
import solidPlugin from '@solidjs/vite-plugin' // V2-PORT: the Solid 2 compiler plugin;
import { resolve } from 'node:path';

// The wire adapter (@kitn.ai/ui/wire). Reads a Response / ReadableStream /
// AsyncIterable and drives an AssistantStreamSink. No provider SDK and no Solid
// runtime, but the plugin stays for consistency with the other lib builds and
// because it imports src/state/parts.ts, which lives in a Solid-compiled tree.
// Compiled to dist/wire.js.
//
// The .d.ts is emitted by the barrel build (vite-plugin-dts over src/**, with
// entryRoot: 'src', so src/wire/index.ts becomes dist/wire/index.d.ts). This
// build is JS-only.
//
// emptyOutDir: false -- the main build ran first; do NOT clobber.
export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/wire/index.ts'),
      formats: ['es'],
      fileName: () => 'wire.js',
    },
    rollupOptions: { external: ['solid-js', '@solidjs/web'] /* V2-PORT: the v2 package split */ },
  },
});
