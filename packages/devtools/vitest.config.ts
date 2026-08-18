import { defineConfig } from 'vitest/config';
import solidPlugin from 'vite-plugin-solid';
import { readFileSync } from 'node:fs';

// `*.css?inline` must return the real file, not an empty string. Vitest ships a
// post-enforce plugin that blanks every CSS import outside a browser env, which
// would hand the panel an empty stylesheet and hide any styling regression. The
// kit solves this the same way for its own suite.
function cssRawPlugin() {
  return {
    name: 'css-raw-for-vitest',
    enforce: 'post' as const,
    transform(_code: string, id: string) {
      if (/\.css\?(raw|inline)(&|$)/.test(id)) {
        const file = id.replace(/\?(raw|inline).*$/, '');
        return { code: `export default ${JSON.stringify(readFileSync(file, 'utf-8'))};`, map: null };
      }
    },
  };
}

export default defineConfig({
  plugins: [cssRawPlugin(), solidPlugin()],
  // Solid must resolve its BROWSER build under jsdom; without this the runtime
  // renders nothing and every view assertion sees an empty shadow root.
  resolve: { conditions: ['development', 'browser'] },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
