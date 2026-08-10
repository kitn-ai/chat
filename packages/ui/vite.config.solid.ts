import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { resolve } from 'node:path';

// The `@kitn.ai/ui/solid` entry (src/solid.ts → dist/solid.js) — the COMPLETE
// SolidJS surface: a writable component for all 79 registered elements plus a
// `<Name>Props` type for every public component.
//
// WHY IT IS ITS OWN BUILD TARGET RATHER THAN PART OF THE BARREL
// ------------------------------------------------------------
// Full Solid coverage costs ~114KB raw / ~23KB gzipped. The root entry "." is
// resolved by EVERY consumer, so carrying that surface there taxed React, Vue,
// Svelte and vanilla users for components only Solid can render. Compiling this
// as a separate lib target keeps that code out of dist/index.js entirely — the
// two bundles share source but no output, so a React consumer's bundler never
// walks into it.
//
// src/solid.ts composes the root barrel (`export * from './index'`) so that
// "./solid ⊇ ." is a compiler invariant instead of a copied list. That is a
// SOURCE-level composition: rollup inlines it here, so dist/solid.js is
// standalone and importing it does not pull in dist/index.js.
//
// Externals and the dts owner are deliberately identical to vite.config.barrel.ts:
// solid-js is the host-provided peer, and dist/solid.d.ts is emitted by the barrel
// build's dts pass (include: src/**/*.ts, entryRoot: src), so this build is JS-only.
//
// emptyOutDir: false — later build in the chain; do NOT clobber earlier output.
export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/solid.ts'),
      formats: ['es'],
      fileName: () => 'solid.js',
    },
    rollupOptions: {
      external: ['solid-js', 'solid-js/web', 'solid-js/store', 'solid-element'],
    },
  },
});
