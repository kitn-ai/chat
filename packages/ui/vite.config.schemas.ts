import { defineConfig } from 'vite';
import solidPlugin from '@solidjs/vite-plugin' // V2-PORT: the Solid 2 compiler plugin;
import { resolve } from 'node:path';

// The card JSON Schemas as a JS module (@kitn.ai/ui/schemas). Data only: the
// schema documents are imported from src/primitives/card-schemas/*.json and
// INLINED by rollup, so the built dist/schemas.js is self-contained — no fs, no
// fetch, no DOM, no Solid runtime. That is what lets a backend route import it.
//
// The raw JSON ships alongside it (dist/schemas/*.schema.json, via
// scripts/copy-card-schemas.mjs and the "./schemas/*" exports key) for Python/Go
// backends. This entry exists because a JS import is the only form that works in
// all 11 framework targets without an import attribute, `resolveJsonModule`, or a
// wrangler rule.
//
// The .d.ts is emitted by the barrel build (vite-plugin-dts over src/**, with
// entryRoot: 'src', so src/schemas/index.ts becomes dist/schemas/index.d.ts, which
// lands in the same directory the JSON is copied into). This build is JS-only.
//
// The solid plugin stays for consistency with the other lib builds; nothing here
// needs it.
//
// emptyOutDir: false — the main build ran first; do NOT clobber.
export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/schemas/index.ts'),
      formats: ['es'],
      fileName: () => 'schemas.js',
    },
    rollupOptions: { external: ['solid-js', '@solidjs/web'] /* V2-PORT: the v2 package split */ },
  },
});
