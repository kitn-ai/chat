import { defineConfig } from 'vite';
import type { PluginOption } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

// One config for every library subpath bundle. Selected by KAI_BUILD, one value
// per emitted file, named after the output stem so the mapping needs no lookup.
//
// WHY A TABLE AND NOT 14 FILES: they differed on four axes only (which Solid
// transform runs, the externals list, the emitted filename, and whether a
// declaration emit rides along). Everything else was copy-paste. The four axes
// are the four columns below.
//
// WHY NOT ONE MULTI-ENTRY BUILD: rollup hoists code shared between entries into
// a separate chunk, and dist/state.js, dist/wire.js and dist/stores.js are
// promised self-contained by scripts/verify-cdn-entries.mjs so a no-build page
// can load them from a raw CDN URL. A hoisted chunk is a RELATIVE specifier, so
// that guard would stay green while the promise got weaker. Every target here
// keeps its own single-entry invocation.
//
// WHY AN ENV VAR AND NOT `vite build --mode <target>`: --mode also drives
// .env.<mode> loading and Vite's isProduction determination, which feeds
// `define` replacement of process.env.NODE_ENV inside bundled dependencies.
// Any of that flipping would change emitted bytes, which is the one thing this
// consolidation must not do. KAI_BUILD touches nothing Vite reads.

// This file lives two levels below the package root, so entries resolve from
// PKG rather than __dirname. Vite's `root` is process.cwd(), always packages/ui
// via the npm script, so build.outDir 'dist' is unaffected by this file's
// location: only explicitly resolved paths are.
const PKG = resolve(__dirname, '../..');

const SOLID = ['solid-js', 'solid-js/web', 'solid-js/store'];
const SOLID_ELEMENT = [...SOLID, 'solid-element'];

interface Target {
  /** Entry module, relative to the package root. */
  entry: string;
  /** Emitted filename under dist/. */
  fileName: string;
  /** 'dom' = Solid's client transform, 'ssr' = the server transform, 'none' = no Solid plugin. */
  transform: 'dom' | 'ssr' | 'none';
  external?: (string | RegExp)[];
  /** vite-plugin-dts options, for the targets that own a declaration emit. */
  dts?: Parameters<typeof dts>[0];
}

const TARGETS: Record<string, Target> = {
  // dist/state.js
  //
  // Framework-neutral state core (@kitn.ai/ui/state). Pure functions over
  // ChatMessage[] — no React/Solid runtime — compiled to dist/state.js. The .d.ts
  // is emitted by the barrel build (entryRoot src → dist/state/index.d.ts), so this
  // build is JS-only. emptyOutDir:false — the main build ran first; do NOT clobber.
  state: {
    entry: 'src/state/index.ts',
    fileName: 'state.js',
    transform: 'dom',
    external: SOLID,
  },
};

const requested = process.env.KAI_BUILD ?? '';
const target = TARGETS[requested];
if (!target) {
  throw new Error(
    `config/vite/lib.ts: KAI_BUILD must be one of [${Object.keys(TARGETS).join(', ')}], got ${JSON.stringify(process.env.KAI_BUILD)}`,
  );
}

const plugins: PluginOption[] = [];
if (target.transform === 'dom') plugins.push(solidPlugin());
// `solid` overrides the preset options the plugin would otherwise pick from
// Vite's ssr flag, so the SSR transform applies to a plain (non-build.ssr) lib
// build and bundling/externalization stay identical to the DOM build.
if (target.transform === 'ssr') plugins.push(solidPlugin({ solid: { generate: 'ssr', hydratable: false } }));
if (target.dts) plugins.push(dts(target.dts));

export default defineConfig({
  plugins,
  build: {
    // Every target here is a LATER build in the chain than the register-all
    // bundle, which is the only emptyOutDir:true build writing to dist/ root.
    emptyOutDir: false,
    lib: {
      entry: resolve(PKG, target.entry),
      formats: ['es'],
      fileName: () => target.fileName,
    },
    rollupOptions: { external: target.external ?? [] },
  },
});
