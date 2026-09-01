import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

// The construct schema as a JS module (@kitn.ai/ui/construct): ConstructSchema,
// validateConstruct, CONSTRUCT_SCHEMA_URL + the Construct/ConstructProblem/
// ValidationOutcome types, re-exported from src/agent-tooling/construct/public.ts.
// Compiled to dist/construct.js. Sibling of vite.config.schemas.ts (read its
// header) but NOT the same entry: that one ships the card JSON Schemas as data
// with a documented size budget zod does not fit, so this is its own exports
// key rather than growing "./schemas".
//
// `zod` is external, matching vite.config.construct-cli.ts's build (the CLI
// bundle over the same source tree) — it's a real runtime `dependencies` entry
// of this package, so any consumer installing @kitn.ai/ui gets it resolved
// normally, and bundling it a second time here would be dead weight.
//
// The .d.ts is NOT emitted by the barrel build (vite.config.barrel.ts): that
// build's dts plugin excludes `src/agent-tooling/**` wholesale (see its own
// comment) because most of agent-tooling is Node/MCP-only tooling that must
// not leak its types into the "." browser entry. So this build carries its
// own vite-plugin-dts pass instead, scoped to just the two files this entry
// needs (public.ts + the schema.ts it re-exports). `entryRoot: 'src'` mirrors
// the barrel config, so declarations land at
// dist/agent-tooling/construct/public.d.ts — the same "types nested, JS flat"
// shape "./schemas" already uses (dist/schemas/index.d.ts next to dist/schemas.js).
//
// rollupTypes is deliberately NOT set: it invokes api-extractor over the whole
// already-emitted dist/**/*.d.ts tree (this build runs after the barrel build
// in the `build` script chain), and it errored trying to resolve dist/state.js
// (JS, not .d.ts — the sibling .d.ts shim is a POSTbuild step) while walking an
// unrelated barrel-emitted file (dist/primitives/create-kai-chat.d.ts). Plain
// per-file declaration emit has no such cross-file dependency and needs none:
// public.d.ts re-exports from './schema', and schema.d.ts is emitted alongside
// it by the same include list, so the reference resolves without bundling.
//
// url-scheme-policy.ts is NOT in `include` — schema.ts imports isSafeUrl from
// it, but the barrel build (which ran earlier in the chain) already emitted
// dist/primitives/url-scheme-policy.d.ts, and schema.d.ts's relative import
// resolves to that existing file.
//
// emptyOutDir: false — the main build ran first; do NOT clobber.
export default defineConfig({
  plugins: [
    dts({
      include: [
        'src/agent-tooling/construct/public.ts',
        'src/agent-tooling/construct/schema.ts',
        'src/agent-tooling/construct/schema-url.ts',
        // The blocks pure-module layer (registry + the shared form renderer).
        // Browser-safe by their own discipline headers (no node:*, no zod-free
        // violation — registry/forms are plain functions over injected data),
        // and needed here because the gallery page's emitted
        // dist/gallery-app/GalleryPage.d.ts imports BLOCK_FORMS types from
        // '../agent-tooling/blocks/forms' — the same reason templates.d.ts is
        // emitted for dist/builder-app/HomeScreen.d.ts. forms.d.ts imports
        // './registry', so both are listed.
        'src/agent-tooling/blocks/registry.ts',
        'src/agent-tooling/blocks/forms.ts',
      ],
      outDir: 'dist',
      entryRoot: 'src',
    }),
  ],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/agent-tooling/construct/public.ts'),
      formats: ['es'],
      fileName: () => 'construct.js',
    },
    rollupOptions: { external: ['zod'] },
  },
});
