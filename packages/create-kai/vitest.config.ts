import { defineConfig } from 'vitest/config';
import { CONSTRUCT_SCHEMA_URL } from '@kitn.ai/ui/construct';

export default defineConfig({
  // `src/wizard.ts` references `__CONSTRUCT_SCHEMA_URL__` as a bare global,
  // substituted by `scripts/build.mjs`'s esbuild `define` for the real CLI
  // bundle (see `types/globals.d.ts`'s docblock on that constant for why: the
  // module carrying the real constant also builds a zod schema at load time,
  // which `src/build-guards.ts` bans from the CLI bundle). `index.ts`'s own
  // globals (`__KIT_RANGE__` etc.) never need this because index.ts is
  // "unimportable" (calls `main()` at module scope) and no test loads it —
  // `wizard.ts` IS imported directly by `test/wizard.test.ts`, so vitest has
  // to resolve the same global esbuild does, or every test importing this
  // module throws a bare `ReferenceError` before a single assertion runs.
  define: {
    __CONSTRUCT_SCHEMA_URL__: JSON.stringify(CONSTRUCT_SCHEMA_URL),
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The generate + kit-contract suites read from dist/templates and the kit's
    // built .d.ts, so they are ordinary node tests with real filesystem reads.
    // No mocking: a mocked template copy proves nothing about the copy.
    globals: false,
  },
});
