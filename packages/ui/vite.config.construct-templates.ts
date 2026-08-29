import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'node:path';

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
export default defineConfig({
  plugins: [
    dts({
      include: [
        'src/agent-tooling/construct/templates.ts',
        'src/agent-tooling/construct/schema-url.ts',
      ],
      outDir: 'dist',
      entryRoot: 'src',
    }),
  ],
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/agent-tooling/construct/templates.ts'),
      formats: ['es'],
      fileName: () => 'construct-templates.js',
    },
  },
});
