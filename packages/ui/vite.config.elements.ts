// Per-element elements build. Entries land in dist/elements/ (one self-registering
// module per element + the autoloader); shared code (Solid runtime,
// defineWebComponent, compiled CSS, marked, …) code-splits into lazy chunks written
// to dist/ itself — NOT dist/elements/chunks/ — deliberately, and is shared across
// entries. outDir is `dist` (not `dist/elements`) precisely so chunkFileNames can
// place those lazy chunks at the SAME level as the earlier lib builds' own dist/
// output: this build runs last in `build` (see package.json), and Rollup names a
// chunk from a hash of its rendered code (computed before our post-pass minifier
// runs), so the on-demand highlighter's grammar/theme chunks — shiki's
// typescript/tsx/javascript/html/css/json/bash/svelte/vue grammars, the github-*
// themes, engine-javascript — hash identically here and in the barrel/solid builds
// that also pull the highlighter in. Same hash + same directory means the file this
// build writes lands on the exact path an earlier build already wrote, so npm packs
// one copy instead of two (this is what verify-pack-weight.mjs's 2026-08-26 dedupe
// fix relies on — see its ceiling-history comment). Chunks unique to this build
// (per-element Solid modules) get unique hashes and just live in dist/ alongside
// everything else; nothing about their content or count changes, only their path.
//   - index.js      — registers ALL elements (the SSR-safe register.ts; the
//                     default @kitn.ai/ui/elements behavior, unchanged)
//   - <file>.js     — one self-registering module per element (@kitn.ai/ui/elements/<file>)
//   - autoloader.js — the opt-in DOM autoloader (@kitn.ai/ui/autoloader)
//
// Everything is bundled (self-contained) so the modules work BOTH for bundler
// tree-shaking (import one element → bundler includes only its chunks) AND for the
// CDN autoloader (no import map needed). Deps are shared across entries, so there
// is no per-element duplication of Solid/CSS/marked.
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { transform } from 'esbuild';
// Via vite's `Rollup` namespace re-export — see the note in vite.config.ts; the
// named form is TS2459 and leaves `chunk` unknown.
import type { Plugin, Rollup } from 'vite';
type OutputBundle = Rollup.OutputBundle;
type OutputChunk = Rollup.OutputChunk;

function libMinifyPlugin(): Plugin {
  return {
    name: 'lib-minify', enforce: 'post', apply: 'build',
    async generateBundle(_o, bundle: OutputBundle) {
      for (const [, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk') {
          const r = await transform((chunk as OutputChunk).code, { minify: true, legalComments: 'none' });
          // esbuild drops /* @vite-ignore */ (not a "legal" comment). Our only template-literal
          // dynamic imports are intentional runtime-only loads (pdf.js CDN, the autoloader) that
          // must stay un-analyzed; re-annotate them so downstream bundlers don't warn.
          (chunk as OutputChunk).code = r.code.replace(/import\(`/g, 'import(/*@vite-ignore*/`');
        }
      }
    },
  };
}

const manifest = JSON.parse(readFileSync(resolve(__dirname, 'src/elements/element-manifest.json'), 'utf8'));

const entry: Record<string, string> = {
  autoloader: resolve(__dirname, 'src/elements/autoloader.ts'),
  // kai-remote is wrapped (React `Remote`) + exported via the `./elements/*` subpath,
  // but it is intentionally NOT in the register-all bundle (register-impl.ts) — it's an
  // opt-in sandboxed cross-origin iframe card. It's therefore absent from
  // element-manifest.json (built from register-impl.ts), so build its per-element module
  // explicitly here so `@kitn.ai/ui/elements/remote` resolves to a real dist file.
  remote: resolve(__dirname, 'src/elements/remote.tsx'),
};
for (const file of Object.keys(manifest.files)) {
  for (const ext of ['tsx', 'ts']) {
    const p = resolve(__dirname, `src/elements/${file}.${ext}`);
    if (existsSync(p)) { entry[file] = p; break; }
  }
}

export default defineConfig({
  plugins: [solidPlugin(), libMinifyPlugin()],
  build: {
    // The per-element + autoloader SPLIT build → dist/elements/ (one self-registering
    // module per element + the autoloader, with shared chunks deduped into dist/ —
    // see the file-header comment for why outDir is `dist` and not `dist/elements`).
    // Runs AFTER the coarse register-all build (vite.config.ts) AND the barrel build,
    // which emits type declarations for ALL of src/** — including dist/elements/*.d.ts
    // (e.g. dist/elements/chat-types.d.ts, referenced by dist/index.d.ts and
    // dist/state/*.d.ts). emptyOutDir MUST stay false so this JS-only build does not
    // wipe those barrel-emitted declarations (or the earlier builds' own dist/*.js)
    // out from under the published type graph (dist is already cleared once at the
    // very start by vite.config.ts).
    outDir: 'dist',
    emptyOutDir: false,
    lib: { entry, formats: ['es'] },
    rollupOptions: {
      output: { entryFileNames: 'elements/[name].js', chunkFileNames: '[name]-[hash].js' },
    },
  },
});
