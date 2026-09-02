import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

// The two node bins: dist/mcp.es.js (the `kai` MCP stdio server, launched by
// bin/mcp.js) and dist/construct-cli.es.js. Both are build.ssr bundles targeting
// node18 with the standard library and zod external, which is the one shape in
// this package that is neither a browser lib build nor a page.
//
// Selected by KAI_BUILD. See config/vite/lib.ts's header for why an env var and
// not --mode.

const NODE_BUILTINS = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

interface Target {
  /** Entry, relative to the Vite root (packages/ui). */
  entry: string;
  /** Emitted filename under dist/. */
  out: string;
  external: (string | RegExp)[];
}

const TARGETS: Record<string, Target> = {
  // Third build (after main + provider). Compiles the stdio MCP entry to a runnable
  // Node ESM bundle so `bin/mcp.js` can `import()` it — a bin runs under plain Node,
  // which can't execute .ts.
  //
  // Approach: an SSR (Node-target) build rather than browser `lib` mode. The brief
  // suggests mirroring vite.config.provider.ts's `lib` config, but `lib` mode is a
  // browser build — it would pull in browser polyfills/conditions. `build.ssr`
  // gives a Node bundle directly (Node export conditions, no polyfills) with one
  // knob, which is cleaner for a tool that only ever runs under Node. We name the
  // output mcp.es.js via output.entryFileNames (build.ssr takes precedence over
  // lib.fileName, so we set the filename on rollup output instead).
  //
  // Other knobs and why:
  //  • emptyOutDir: false — main build (vite.config.ts) ran first with
  //    emptyOutDir: true; we must NOT clobber its dist output.
  //  • external — keep deps the runtime provides out of the bundle: zod, the whole
  //    @modelcontextprotocol/sdk (regex covers its subpaths like /server/stdio.js),
  //    and every Node builtin (bare + node: prefixed). OUR code (registry, tools)
  //    is bundled inline.
  //
  // Note: in this merged file the ordering is no longer "third build after main +
  // provider" -- it now runs after KAI_BUILD=schemas, because this bundle compiles
  // the MCP against the BUILT dist/schemas.js, not against src. vitest.config.ts
  // records the same dependency from the other side. The two files the verbatim
  // text above names are also gone: `vite.config.provider.ts` is the `provider`
  // target in config/vite/lib.ts, and `vite.config.ts` (the main build) is
  // `KAI_BUILD=register vite build --config config/vite/elements.ts`.
  mcp: {
    entry: 'mcp/mcp/stdio.ts',
    out: 'mcp.es.js',
    external: ['zod', /^@modelcontextprotocol\/sdk/, ...NODE_BUILTINS],
  },
  // Sibling of the mcp target above: SSR/Node build, dist kept, zod external,
  // Node builtins external. vite + vite-plugin-solid are NOT bundled — kai
  // dev/compile run them inside the GENERATED project via npm scripts, so this
  // bundle never imports them.
  'construct-cli': {
    entry: 'mcp/construct/cli-entry.ts',
    out: 'construct-cli.es.js',
    external: ['zod', ...NODE_BUILTINS],
  },
};

const requested = process.env.KAI_BUILD ?? '';
// Own keys only -- see the note at the same guard in config/vite/lib.ts.
if (!Object.hasOwn(TARGETS, requested)) {
  throw new Error(
    `config/vite/node.ts: KAI_BUILD must be one of [${Object.keys(TARGETS).join(', ')}], got ${JSON.stringify(process.env.KAI_BUILD)}`,
  );
}
const target = TARGETS[requested];

export default defineConfig({
  build: {
    emptyOutDir: false,
    ssr: target.entry,
    target: 'node18',
    rollupOptions: {
      external: target.external,
      output: { entryFileNames: target.out },
    },
  },
});
