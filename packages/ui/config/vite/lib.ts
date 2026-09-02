import { defineConfig } from 'vite';
import type { PluginOption } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import dts from 'vite-plugin-dts';
import { relative, resolve } from 'node:path';

// Matches an actual import specifier crossing the mcp/ boundary
// ('../../mcp/...' or import('../../mcp/...')), not any mention of "/mcp/"
// -- a TSDoc comment that merely names the mcp/ directory must not trip the
// rewrite/throw below.
const MCP_SPECIFIER = /(?:from|import\()\s*['"]\.\.\/\.\.\/mcp\//;

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
//
// Note: the per-target comments below moved here VERBATIM from the config files
// they came from, so they still name paths like `vite.config.barrel.ts`. None of
// those files exists any more. To read one: `vite.config.<stem>.ts` is the
// `<stem>` key in the TARGETS table below, except `barrel` (now `index`) and
// `barrel.server` (now `index.server`). `vite.config.construct-cli.ts` is the
// `construct-cli` target in config/vite/node.ts. And `vite.config.ts` -- the
// register-all build that runs first and is the only emptyOutDir:true build
// writing to dist/ root -- is now `KAI_BUILD=register vite build --config
// config/vite/elements.ts`.

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
  // dist/kai-provider.es.js, the "./provider" export. No Solid plugin: the
  // provider is plain TypeScript, and solid-js / solid-js/web are external
  // because the host page supplies them. dist/kai.es.js must not be clobbered:
  // the main build runs first.
  //
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
  provider: {
    entry: 'src/remote/provider.ts',
    fileName: 'kai-provider.es.js',
    transform: 'none',
    external: ['solid-js', 'solid-js/web'],
  },

  // dist/index.js, the "." export under the `browser` and `default` conditions.
  // This is ALSO the only declaration emit over src/**: every other subpath's
  // .d.ts comes from this pass plus scripts/emit-subpath-dts.mjs.
  //
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
  index: {
    entry: 'src/index.ts',
    fileName: 'index.js',
    transform: 'dom',
    external: SOLID_ELEMENT,
    dts: {
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.stories.tsx',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/stories/**',
        // Captured SSE fixtures and their replay harness are TEST DATA. The
        // `files` field already keeps src/wire/fixtures out of the tarball;
        // without this the dts build still emitted type stubs for them into
        // dist/wire/fixtures/, describing modules that do not ship.
        'src/wire/fixtures/**',
        // *.testlib.ts files are TEST-ONLY loaders (node:path / node:url).
        // This tsconfig deliberately has no node types — that absence is what
        // keeps Node imports out of shipped browser code — so including a
        // testlib here logs TS2307 on every build and emits a d.ts for a
        // module that must not ship. Excluded from the tarball by the
        // matching !**/*.testlib.* negations in package.json `files`.
        'src/**/*.testlib.ts',
      ],
      // THE ONE PLACE THE MOVE IS NOT A PURE RELOCATION.
      //
      // A handful of SHIPPED declarations under dist/components/ (three at the
      // time of writing; read the count off the tree with
      // `grep -rln "\.\./agent-tooling/" dist --include='*.d.ts'`, never off
      // this comment) import the construct
      // schema and the template registry across the boundary by a relative
      // path. That worked for free while the source lived at
      // src/agent-tooling/: src/components -> ../agent-tooling and
      // dist/components -> ../agent-tooling are the same string. With the
      // source at mcp/, the source specifier is '../../mcp/construct/schema'
      // and tsc emits it verbatim, where from dist/components/ it points
      // outside dist/ at a directory `files` does not ship. A consumer's tsc
      // then cannot resolve Construct, and the emit itself says nothing: it
      // succeeds and the bytes look plausible. One thing downstream does say
      // so -- `verify:dts` (scripts/verify-dts-boundaries.mjs, self-tested)
      // runs in `postbuild` and fails on any relative specifier resolving
      // outside dist/. That is a backstop, not the mechanism: it fires after
      // the whole emit, names the file rather than the depth, and does not
      // know how to repair it. The rewrite below is what keeps the emit right
      // in the first place.
      //
      // The declarations for those targets ARE emitted, by the construct target
      // below, at dist/agent-tooling/construct/. So the fix is to rewrite the
      // specifier back to the path that already exists.
      //
      // It THROWS rather than no-ops on an unexpected shape, because the
      // rewrite is depth-sensitive: every affected file today sits exactly one
      // directory under dist/, so '../../mcp/' maps to '../agent-tooling/'. A
      // future importer at another depth must fail loudly here instead of
      // silently emitting a path that resolves to nothing.
      beforeWriteFile(filePath: string, content: string) {
        if (!MCP_SPECIFIER.test(content)) return;
        const rel = relative(resolve(PKG, 'dist'), filePath);
        const depth = rel.split(/[\\/]/).length - 1;
        if (depth !== 1) {
          throw new Error(
            `config/vite/lib.ts: ${rel} imports across the mcp/ boundary from depth ${depth}. ` +
              `The rewrite below only knows depth 1 (dist/<dir>/<file>.d.ts). Teach it the new ` +
              `depth or stop importing mcp/ from that file.`,
          );
        }
        return { content: content.replaceAll("'../../mcp/", "'../agent-tooling/") };
      },
      outDir: 'dist',
      entryRoot: 'src',
      // The barrel entry src/index.ts -> dist/index.d.ts. This is the canonical
      // owner of dist/index.d.ts (the react build renames its own entry to
      // react.d.ts to avoid the collision).
    },
  },

  // dist/index.server.js, the "." export under `node` / `deno` / `worker`.
  //
  // Server-safe twin of vite.config.barrel.ts → dist/index.server.js, wired into the
  // package's "." export under the `node` condition.
  //
  // WHY: vite.config.barrel.ts compiles the barrel with Solid's DOM transform, which
  // emits 121 module-scope `template("<div>")` calls and 24 module-scope
  // `delegateEvents([...])` calls. It also (correctly) leaves solid-js external. Under
  // Node, `solid-js/web` resolves to Solid's SERVER build, where `template` is the
  // `notSup` stub — so merely IMPORTING `@kitn.ai/ui` on a server threw
  // "Client-only API called on the server side" and hard-failed any SSR/prerender pass
  // that touched a value export. Bundling solid-js instead does NOT fix it: the client
  // runtime's `delegateEvents(events, doc = window.document)` then throws
  // "window is not defined" at module scope, and every Solid consumer gets a duplicated
  // reactive runtime. The transform is the problem, not the resolution — so we ship a
  // second bundle compiled with Solid's SSR transform, which emits `ssr` template
  // strings and no event delegation at all.
  //
  // hydratable: false — deliberately matched to the DOM build, which vite-plugin-solid
  // compiles with hydratable: false. Hydration needs BOTH halves flipped together;
  // flipping only this one would emit hydration keys the client build cannot consume.
  // This entry exists so a server can IMPORT the barrel (and render static markup),
  // not so it can hand off to hydrate().
  //
  // Externals are identical to the DOM build: the host provides solid-js, and under Node
  // that resolves to Solid's server renderer, which is exactly what this output targets.
  //
  // emptyOutDir: false — later build in the chain; do NOT clobber earlier output.
  'index.server': {
    entry: 'src/index.ts',
    fileName: 'index.server.js',
    transform: 'ssr',
    external: SOLID_ELEMENT,
  },

  // dist/solid.js, the "./solid" export.
  //
  // The `@kitn.ai/ui/solid` entry (src/solid.ts → dist/solid.js) — the COMPLETE
  // SolidJS surface: a writable component for EVERY registered element plus a
  // `<Name>Props` type for every public component. The catalog is
  // src/elements/element-meta.json; `npm run verify:solid-coverage` prints the
  // element count and fails on any gap, so the number is not restated here.
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
  solid: {
    entry: 'src/solid.ts',
    fileName: 'solid.js',
    transform: 'dom',
    external: SOLID_ELEMENT,
  },

  // dist/solid.server.js, the "./solid" server twin.
  //
  // Server-safe twin of vite.config.solid.ts → dist/solid.server.js, wired into the
  // package's "./solid" export under the `node` / `deno` / `worker` conditions.
  //
  // This exists for exactly the reason vite.config.barrel.server.ts does, and the
  // reasoning there is the full story. In short: the DOM build compiles Solid's
  // client transform, which emits module-scope `template(...)` and `delegateEvents(...)`
  // calls. Under Node, `solid-js/web` resolves to Solid's SERVER build where
  // `template` is the `notSup` stub, so merely IMPORTING the entry threw
  // "Client-only API called on the server side" and hard-failed any SSR/prerender/RSC
  // pass. That bug was live on npm through 0.19.0 for "."; shipping `./solid` without
  // a server twin would reintroduce it on a brand-new entry, and `verify:ssr` (which
  // derives its entry list from the exports map) would fail the build the day
  // "./solid" was added.
  //
  // hydratable: false — matched to the DOM build, exactly as the barrel pair is.
  // This entry exists so a server can IMPORT the Solid surface and render static
  // markup, not so it can hand off to hydrate().
  //
  // emptyOutDir: false — later build in the chain; do NOT clobber earlier output.
  'solid.server': {
    entry: 'src/solid.ts',
    fileName: 'solid.server.js',
    transform: 'ssr',
    external: SOLID_ELEMENT,
  },

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

  // dist/wire.js
  //
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
  wire: {
    entry: 'src/wire/index.ts',
    fileName: 'wire.js',
    transform: 'dom',
    external: SOLID,
  },

  // dist/stores.js
  //
  // The conversation stores (@kitn.ai/ui/stores). localStorageStore/fetchStore +
  // the ConversationStore contract helpers — plain solid-free glue (I/O, so NOT
  // part of ./state, whose contract is pure folds) compiled to a self-contained
  // dist/stores.js so a no-bundler CDN page can reach the built-ins the root
  // export (which bare-imports solid-js) denies it. See src/stores/index.ts for
  // the full decision record. solid-js stays external here for symmetry with the
  // other lib builds; the entry must not actually pull it in at runtime, and
  // `verify:cdn-entries` (postbuild) fails the build if any bare import appears
  // in the emitted bundle. The .d.ts is emitted by the barrel build (entryRoot
  // src → dist/stores/index.d.ts), so this build is JS-only.
  // emptyOutDir: false — the main build ran first; do NOT clobber.
  stores: {
    entry: 'src/stores/index.ts',
    fileName: 'stores.js',
    transform: 'dom',
    external: SOLID,
  },

  // dist/define.js. solid-element is deliberately NOT external here: it is not
  // a declared peer, so this entry bundles it for consumers.
  //
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
  define: {
    entry: 'src/elements/define-entry.ts',
    fileName: 'define.js',
    transform: 'dom',
    external: SOLID,
  },

  // dist/define.server.js, matching the DOM twin's externals exactly.
  //
  // Server-safe twin of vite.config.define.ts → dist/define.server.js, wired into
  // the package's "./define" export under the `node` / `deno` / `worker`
  // conditions.
  //
  // This exists for exactly the reason vite.config.solid.server.ts and
  // vite.config.barrel.server.ts do, and the reasoning there is the full story.
  // In short: the DOM build compiles Solid's client transform, which emits
  // module-scope `template(...)` calls for define.tsx's own JSX (the facade
  // wrapper's `<style>` and outer `<div>`) — hoisted to module scope regardless
  // of the function they render inside, which is what makes this a MODULE-LOAD
  // failure rather than a call-time one. Under Node, `solid-js/web` resolves to
  // Solid's SERVER build where `template` is the `notSup` stub, so merely
  // IMPORTING the entry threw "Client-only API called on the server side" and
  // hard-failed `verify:ssr` (verify-ssr-imports.mjs derives its entry list from
  // the exports map, so a new entry with no server twin fails the build the day
  // it is added — same shape this repo already hit twice for "." and "./solid").
  //
  // defineWebComponent() ITSELF is already SSR-safe by construction (`typeof
  // customElements === 'undefined'` short-circuits before ever calling
  // solid-element's customElement()) — this fix is unrelated to that call-time
  // guard. It is purely about the module load succeeding at all.
  //
  // hydratable: false — matched to the DOM build and the solid.server pair.
  //
  // emptyOutDir: false — later build in the chain; do NOT clobber earlier output.
  'define.server': {
    entry: 'src/elements/define-entry.ts',
    fileName: 'define.server.js',
    transform: 'ssr',
    external: SOLID,
  },

  // dist/diagnostics.js
  //
  // The devtools recorder hook (@kitn.ai/ui/diagnostics). The browser-only half of
  // the diagnostic stream: it installs window.__KAI_DEVTOOLS_HOOK__ and holds the
  // session buffer, while src/wire produces the events and touches no global.
  // Compiled to dist/diagnostics.js. The .d.ts is emitted by the barrel build
  // (entryRoot src -> dist/diagnostics/index.d.ts), so this build is JS-only.
  // emptyOutDir:false — the main build ran first; do NOT clobber.
  diagnostics: {
    entry: 'src/diagnostics/index.ts',
    fileName: 'diagnostics.js',
    transform: 'dom',
    external: SOLID,
  },

  // dist/schemas.js. MUST build before the mcp target in config/vite/node.ts:
  // that bundle compiles the MCP against this built file, not against src.
  // vitest.config.ts records the same dependency from the other side.
  //
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
  schemas: {
    entry: 'src/schemas/index.ts',
    fileName: 'schemas.js',
    transform: 'dom',
    external: SOLID,
  },

  // dist/construct.js, the "./construct" export. No Solid plugin.
  //
  // The construct schema as a JS module (@kitn.ai/ui/construct): ConstructSchema,
  // validateConstruct, CONSTRUCT_SCHEMA_URL + the Construct/ConstructProblem/
  // ValidationOutcome types, re-exported from mcp/construct/public.ts.
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
  // build's dts `include` is src/**, and this tree lives at mcp/, so it cannot
  // enter that emit at all. (Before the 2026-09-02 move the same source sat at
  // src/agent-tooling/ and was held out by an explicit exclude; the exclude is
  // gone because it could no longer fire.) Keeping it out is still the point:
  // most of mcp/ is Node/MCP-only tooling that must not leak its types into the
  // "." browser entry. So this build carries its own vite-plugin-dts pass
  // instead, scoped to just the two files this entry needs (public.ts + the
  // schema.ts it re-exports). See the outDir/entryRoot comment on the target
  // below for how declarations still land at
  // dist/agent-tooling/construct/public.d.ts, the same "types nested, JS flat"
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
  // url-scheme-policy.ts is NOT in `include`, and does not need to be: schema.ts
  // imports isSafeUrl for a runtime .refine() only, so no emitted declaration
  // references it. Checked, not assumed:
  //   grep -n "url-scheme" dist/agent-tooling/construct/*.d.ts
  // returns nothing. An earlier version of this comment claimed the emit relied
  // on the barrel build having produced dist/primitives/url-scheme-policy.d.ts
  // first; it does not, and that claim would have made this move look blocked.
  //
  // emptyOutDir: false — the main build ran first; do NOT clobber.
  construct: {
    entry: 'mcp/construct/public.ts',
    fileName: 'construct.js',
    transform: 'none',
    external: ['zod'],
    dts: {
      include: [
        'mcp/construct/public.ts',
        'mcp/construct/schema.ts',
        'mcp/construct/schema-url.ts',
        // The blocks pure-module layer (registry + the shared form renderer).
        // Browser-safe by their own discipline headers (no node:*, no zod-free
        // violation -- registry/forms are plain functions over injected data).
        // Needed here because apps/gallery/GalleryPage.tsx imports BLOCK_FORMS
        // types from '../../mcp/blocks/forms', and (the parallel case)
        // apps/builder/HomeScreen.tsx imports ConstructListing from
        // '../../mcp/construct/templates' -- neither app lives under src/ or
        // the dts include anymore, and public.ts re-exports only from
        // './schema', so these two include entries currently have no in-repo
        // consumer and are kept only pending a separate removal decision.
        // forms.d.ts imports './registry', so both are listed.
        'mcp/blocks/registry.ts',
        'mcp/blocks/forms.ts',
      ],
      // outDir + entryRoot, not outDir alone. vite-plugin-dts writes each file
      // to resolve(outDir, relative(entryRoot, emittedPath)), so this pair is
      // what keeps declarations landing at dist/agent-tooling/construct/... now
      // that the source is at mcp/construct/. That path is NOT cosmetic: it is
      // the literal value of exports["./construct"].types and of the
      // typesVersions entry, both pinned by
      // tests/scripts/construct-export-smoke.test.ts. Changing it is a
      // consumer-visible change; holding it is free.
      outDir: 'dist/agent-tooling',
      entryRoot: 'mcp',
    },
  },

  // dist/construct-templates.js, the "./construct/templates" export. Nothing
  // external: this bundle is self-contained by design.
  //
  // The template registry as its own ZOD-FREE entry
  // (@kitn.ai/ui/construct/templates → dist/construct-templates.js). B-16:
  // the existing ./construct entry is one bundled file with top-level
  // z.discriminatedUnion side effects esbuild cannot tree-shake past (see
  // create-kai's wizard.ts header), so the registry — structured data three
  // surfaces read live — gets its own entry create-kai can bundle.
  // bundleGraphProblem's zod ban in create-kai's build is the enforcement:
  // if this entry ever grows a zod import, that build goes red on its own.
  //
  // No `external` config on purpose: templates.ts's only value import is the
  // schema-url leaf, which inlines to a string. The emitted chunk must have
  // ZERO imports — a zod import appearing here would surface in create-kai's
  // metafile graph and fail its build.
  //
  // dts include mirrors vite.config.construct.ts's pattern (read its header):
  // templates.d.ts's `import type { Construct } from './schema'` resolves to
  // the schema.d.ts that config already emits earlier in the build chain.
  'construct-templates': {
    entry: 'mcp/construct/templates.ts',
    fileName: 'construct-templates.js',
    transform: 'none',
    dts: {
      include: [
        'mcp/construct/templates.ts',
        'mcp/construct/schema-url.ts',
      ],
      // Same outDir/entryRoot pair as the construct target above; read its
      // comment. exports["./construct/templates"].types names
      // dist/agent-tooling/construct/templates.d.ts.
      outDir: 'dist/agent-tooling',
      entryRoot: 'mcp',
    },
  },
};

const requested = process.env.KAI_BUILD ?? '';
// Object.hasOwn, not a truthiness test on the lookup. `TARGETS['constructor']`
// -- and toString, valueOf, hasOwnProperty, __proto__ -- resolves up the
// prototype chain to a truthy value, so `if (!target)` lets those names through
// and the build dies later inside resolve() on an undefined path, naming
// nothing. Own keys only, so an unknown KAI_BUILD is always refused by name.
if (!Object.hasOwn(TARGETS, requested)) {
  throw new Error(
    `config/vite/lib.ts: KAI_BUILD must be one of [${Object.keys(TARGETS).join(', ')}], got ${JSON.stringify(process.env.KAI_BUILD)}`,
  );
}
const target = TARGETS[requested];

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
