// The apps/docs suite. jsdom because the /blocks island renders Solid into a
// document; vite-plugin-solid because the island is .tsx compiled for Solid,
// the same compiler @astrojs/solid-js uses at build time.
//
// `globals: true` for the same reason packages/ui's config sets it:
// @solidjs/testing-library registers its own afterEach(cleanup) only when the
// globals are installed, and later suites here rely on that cleanup.
//
// `@kitn.ai/blocks` exports .ts and pnpm symlinks it, so its realpath is
// OUTSIDE this project's root. That resolves with no help today (PR A proved
// it across four toolchains). If it ever stops, the fallback is
// `test.server.deps.inline: ['@kitn.ai/blocks']` here, and the standing
// witness for this class is packages/ui/mcp/tests/blocks-artifacts.test.ts.
import { defineConfig } from 'vitest/config';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});
