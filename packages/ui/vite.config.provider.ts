import { defineConfig } from 'vite';

// The remote card-protocol provider bundle (@kitn.ai/ui/provider), compiled to
// dist/kai-provider.es.js.
//
// JS-ONLY, deliberately. This build used to run vite-plugin-dts with
// `entryRoot: 'src/remote'`, which FLATTENED every src/remote/*.ts into
// dist/*.d.ts. That was wrong twice over:
//
//   1. It emitted dist/wire.d.ts from src/remote/wire.ts (the remote CARD
//      PROTOCOL). Once @kitn.ai/ui/wire shipped as dist/wire.js + dist/wire/,
//      a sibling-.d.ts lookup for dist/wire.js (a deep import, node10
//      resolution, or editor go-to-definition) silently served card-protocol
//      types for the model-stream adapter.
//   2. The flattened files kept their ORIGINAL relative imports, so
//      dist/provider-runtime.d.ts imported '../primitives/card-contract' and
//      resolved OUTSIDE dist/, where nothing exists. The provider's own public
//      types did not typecheck for a consumer.
//
// The barrel build (vite.config.barrel.ts) already emits every src/**/*.ts
// declaration with `entryRoot: 'src'`, so src/remote/provider.ts lands at
// dist/remote/provider.d.ts with its relative imports intact. The exports map
// points "./provider" at that file. One dts owner, no flattened duplicates, no
// ambiguous dist/wire.d.ts.
export default defineConfig({
  build: {
    emptyOutDir: false, // do NOT clobber dist/kai.es.js (main build runs first)
    lib: { entry: 'src/remote/provider.ts', formats: ['es'], fileName: () => 'kai-provider.es.js' },
    rollupOptions: { external: ['solid-js', '@solidjs/web'] /* V2-PORT: the v2 package split */ },
  },
});
