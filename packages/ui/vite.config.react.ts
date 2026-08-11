import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { existsSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

const distRoot = resolve(__dirname, 'dist');
const srcRoot = resolve(__dirname, 'src');

/**
 * Rewrite `'../../src/x'` specifiers in the EMITTED declarations to the compiled
 * `dist/` declaration that corresponds to them.
 *
 * The wrappers must import their types from `src/` in SOURCE: the leaf type modules
 * (chat-types, tool-types, card-contract, …) are the only ones that typecheck under
 * this config's `jsx: react-jsx`, since the `@kitn.ai/ui` barrel drags the whole
 * SolidJS component tree in and every Solid `JSX.Element` then fails against React's.
 *
 * But tsc copies those specifiers into the OUTPUT verbatim, and `dist/react/` sits at
 * the same depth under the package root as `frameworks/react/`, so `../../src/x` kept
 * resolving — purely because the tarball still ships raw `src/`. Drop `src` from
 * "files" (a reasonable size win) and every React type silently dies, which is the
 * same defect that left `@kitn.ai/ui/provider` unable to typecheck at all.
 *
 * So: source imports source, output points at output. `scripts/verify-dts-boundaries.mjs`
 * runs in postbuild and fails the build if any emitted .d.ts still reaches outside
 * dist/ or names a dist path that does not exist.
 */
function srcSpecifiersToDist(filePath: string, content: string): string {
  const outDir = dirname(filePath);
  return content.replace(
    /(['"])(?:\.\.\/)+src\/([^'"]+)\1/g,
    (whole, quote: string, subpath: string) => {
      // Probe the SOURCE tree, not dist/: vite.config.barrel.ts emits the dist
      // declaration tree with `entryRoot: 'src'` (so src/a/b.ts -> dist/a/b.d.ts) and
      // it runs AFTER this build, against a dist/ the main build just emptied. Source
      // layout is what barrel will mirror, and it is available at any point in the chain.
      // Resolve a directory to its explicit `/index` rather than leaving a bare
      // directory import, which `moduleResolution: node16` consumers cannot resolve.
      let target = subpath;
      if (!['.ts', '.tsx'].some((ext) => existsSync(resolve(srcRoot, `${subpath}${ext}`)))) {
        if (['.ts', '.tsx'].some((ext) => existsSync(resolve(srcRoot, subpath, `index${ext}`)))) {
          target = `${subpath}/index`;
        } else {
          return whole; // let the boundary guard report it rather than inventing a path
        }
      }
      let rel = relative(outDir, resolve(distRoot, target)).split(sep).join('/');
      if (!rel.startsWith('.')) rel = `./${rel}`;
      return `${quote}${rel}${quote}`;
    },
  );
}

// Fourth build (after main + provider; the MCP build can follow). Compiles the
// React subpath entry (frameworks/react/index.tsx + its ./runtime) to a compiled
// ESM bundle + generated .d.ts, so consumers resolve `@kitn.ai/ui/react` to
// JS+.d.ts — never the raw .tsx SOURCE (which, when a consumer's tsc walks it,
// would compile the wrapper under the consumer's React/Vue/Svelte JSX config and
// error — see LIB-2). The wrapper + runtime are bundled inline in the JS; only
// React is external (a peer dep the host provides).
//
// tsconfigPath: tsconfig.react.json — frameworks/ is EXCLUDED from the root
// tsconfig (which is Solid-JSX); the react tsconfig includes frameworks/**/*.tsx
// under react-jsx. Without this the dts plugin generates nothing for this build.
//
// We do NOT use rollupTypes here: api-extractor mis-resolves the entry when
// invoked alongside the Solid barrel (it followed package.json/tsconfig and
// emitted the SOLID component surface instead of the React wrappers). Instead we
// emit flat per-file .d.ts into a dedicated dist/react/ dir (entry index.d.ts +
// runtime.d.ts), which sidesteps both the api-extractor bug and any collision
// with the barrel build's dist/index.d.ts. The exports map points
// `./react` "types" at dist/react/index.d.ts.
//
// emptyOutDir: false — the main build (vite.config.ts) ran first with
// emptyOutDir: true; we must NOT clobber its dist output.
export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: 'tsconfig.react.json',
      include: ['frameworks/react/**'],
      outDir: 'dist/react',
      entryRoot: 'frameworks/react',
      // Keep the emitted declarations inside dist/ — see srcSpecifiersToDist above.
      beforeWriteFile: (filePath, content) => ({
        filePath,
        content: srcSpecifiersToDist(filePath, content),
      }),
    }),
  ],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'frameworks/react/index.tsx'),
      formats: ['es'],
      fileName: () => 'react.js',
    },
    rollupOptions: {
      // React is a peer dep. Every @kitn.ai/ui/elements entry (register-all AND the
      // per-element chunks the wrappers lazy-import) is external — it resolves to the
      // consumer's installed dist at runtime, and stays a code-splittable dynamic import.
      external: ['react', 'react-dom', 'react/jsx-runtime', /^@kitn\.ai\/ui\/elements(\/.*)?$/],
      // Re-emit the React Server Components `'use client'` directive: the wrappers are
      // hooks-based client components, required for Next.js App Router (and other RSC
      // bundlers). Rollup strips module-level directives from the source while bundling,
      // so inject it as a banner to guarantee dist/react.js opens with it.
      output: { banner: "'use client';" },
    },
  },
});
