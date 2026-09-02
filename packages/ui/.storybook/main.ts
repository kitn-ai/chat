import type { StorybookConfig } from 'storybook-solidjs-vite';
import remarkGfm from 'remark-gfm';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Serve the reference provider example (examples/internal/remote-provider/) under
 * /remote-provider/ THROUGH Storybook's own Vite pipeline, so its `.ts` entry is
 * transformed and runnable in the browser (a raw staticDir can't transform TS).
 *
 * <kai-remote> enforces a cross-origin precondition (providerOrigin !== hostOrigin),
 * so the stories frame the provider via the 127.0.0.1 alias of the SAME Storybook
 * server — a genuinely different origin from the localhost preview, satisfying the
 * precondition without a second server. The real cross-origin SECURITY matrix is
 * the standalone Playwright suite (tests/e2e); these stories are the visual /
 * interaction demos (H-L).
 */
function serveRemoteProvider(): Plugin {
  const dir = resolve(HERE, '../../../examples/internal/remote-provider');
  return {
    name: 'kai-serve-remote-provider',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.startsWith('/remote-provider/')) return next();
        const rel = url.slice('/remote-provider/'.length) || 'index.html';
        try {
          if (rel.endsWith('.html')) {
            const html = await readFile(resolve(dir, rel), 'utf8');
            const transformed = await server.transformIndexHtml(url, html);
            res.setHeader('content-type', 'text/html');
            res.end(transformed);
            return;
          }
          // .ts / .js modules: run through Vite's transform pipeline.
          const result = await server.transformRequest(resolve(dir, rel));
          if (!result) return next();
          res.setHeader('content-type', 'application/javascript');
          res.end(result.code);
          return;
        } catch {
          return next();
        }
      });
    },
  };
}

// NO ROOT VITE CONFIG, DELIBERATELY.
//
// Storybook's Vite builder auto-discovers `vite.config.*` in the project root
// and merges it in before `viteFinal` runs. Until the config consolidation
// there WAS a packages/ui/vite.config.ts -- the register-all LIBRARY build --
// so Storybook was silently inheriting a second `solidPlugin()`, a post-pass
// esbuild minifier that applied to `storybook build`, `build.lib`,
// `treeshake: false` and `emptyOutDir: true`. None of that was ever intended
// for Storybook; it was inherited by accident of filename.
//
// That file is now config/vite/elements.ts behind KAI_BUILD, so there is
// nothing at the root for Storybook to pick up and everything this config
// needs is set explicitly in `viteFinal` below (the Solid plugin comes from the
// `storybook-solidjs-vite` framework). Do NOT reintroduce a vite.config.ts at
// packages/ui/ root: Storybook would start merging it again, silently. Nothing
// enforces this but the absence of the file -- recorded in docs/coupling-map.md.

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)', '../apps/**/*.stories.@(ts|tsx)'],
  framework: 'storybook-solidjs-vite',
  // Serve the generated agent files so the docs can link to them directly.
  staticDirs: [
    { from: '../llms.txt', to: '/llms.txt' },
    { from: '../llms-full.txt', to: '/llms-full.txt' },
    // Sample artifact (cross-linked HTML pages + image + PDF) framed by
    // <kai-artifact> stories at a stable URL — no backend needed.
    { from: '../../../examples/internal/artifact-fixtures', to: '/artifact-fixtures' },
  ],
  addons: [
    'storybook-dark-mode',
    '@storybook/addon-themes',
    '@storybook/addon-vitest',
    // Registers the a11y preview annotations (axe) so accessibility checks run
    // both in the Storybook UI panel and — via @storybook/addon-vitest — as part
    // of the `vitest --project=storybook` test run (SB10 a11y-in-test).
    '@storybook/addon-a11y',
    {
      name: '@storybook/addon-docs',
      options: {
        // MDX is CommonMark by default — enable GitHub-Flavored Markdown so
        // pipe tables (and strikethrough/task lists) render in the docs pages.
        mdxPluginOptions: {
          mdxCompileOptions: {
            remarkPlugins: [remarkGfm],
          },
        },
      },
    },
  ],
  async viteFinal(config) {
    const tailwindcss = (await import('@tailwindcss/postcss')).default;
    config.css = {
      ...config.css,
      postcss: {
        plugins: [tailwindcss()],
      },
    };
    config.plugins = [...(config.plugins ?? []), serveRemoteProvider()];
    return config;
  },
};

export default config;
