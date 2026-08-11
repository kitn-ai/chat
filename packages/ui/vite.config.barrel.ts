import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

// Fifth build (after main + provider + react). Compiles the root entry
// (src/index.ts — the SolidJS primitives/components barrel) to a compiled ESM
// bundle + generated .d.ts, so consumers resolve `@kitn.ai/ui` (".") to
// JS+.d.ts — never the raw src/*.ts(x) SOURCE. Shipping source on "." is the
// core of LIB-2: a consumer's tsc resolves src/index.ts, then compiles the
// library's SolidJS internals under the consumer's React/Vue/Svelte JSX config
// and emits dozens of errors inside node_modules/@kitn.ai/ui/src.
//
// solid-js / solid-js/web are external (peer dep the host provides). Everything
// else (the component tree) is bundled inline.
//
// emptyOutDir: false — the main build (vite.config.ts) ran first; do NOT clobber.
export default defineConfig({
  plugins: [
    solidPlugin(),
    dts({
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.stories.tsx',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/agent-tooling/**',
        'src/stories/**',
        // Captured SSE fixtures and their replay harness are TEST DATA. The
        // `files` field already keeps src/wire/fixtures out of the tarball;
        // without this the dts build still emitted type stubs for them into
        // dist/wire/fixtures/, describing modules that do not ship.
        'src/wire/fixtures/**',
      ],
      outDir: 'dist',
      entryRoot: 'src',
      // The barrel entry src/index.ts -> dist/index.d.ts. This is the canonical
      // owner of dist/index.d.ts (the react build renames its own entry to
      // react.d.ts to avoid the collision).
    }),
  ],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['solid-js', 'solid-js/web', 'solid-js/store', 'solid-element'],
    },
  },
});
