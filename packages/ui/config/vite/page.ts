import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/postcss';
import { resolve } from 'node:path';

// The two prebuilt dev-tool pages, built at kit build time so the `kai dev`
// CLI's thin server serves static files and compiles nothing at consumer
// runtime. Both are light-DOM Solid with their own Tailwind build.
//
// base './' on both because dev.ts serves each from an arbitrary port, the
// builder at the root and the theme studio under /theme-studio/.
//
// Each has its own `root`, which is why these are two INVOCATIONS of one
// config rather than one build: Vite's root is a per-build setting.
//
// This file lives two levels below the package root, so every path below
// resolves from PKG rather than __dirname.
const PKG = resolve(__dirname, '../..');

interface Page {
  /** App root, relative to the package root. */
  root: string;
  /** Output directory, relative to the package root. */
  outDir: string;
  external?: string[];
  paths?: Record<string, string>;
}

const TARGETS: Record<string, Page> = {
  // The kai dev --builder page (B-22..B-24): light-DOM Solid, prebuilt at kit
  // build time so the CLI's "second thin server" serves static files and
  // compiles nothing at consumer runtime. base './' because dev.ts serves it
  // from an arbitrary port's root.
  builder: {
    root: 'apps/builder',
    outDir: 'dist/builder-page',
  },
  // The standalone theme studio (dev tool, iframed by the builder page):
  // mirrors the builder page's build — light-DOM Solid, prebuilt at kit build
  // time so the CLI's thin server serves static files and compiles nothing at
  // consumer runtime. base './' because dev.ts serves it under /theme-studio/.
  //
  // The kai-* element bundle is NOT re-bundled into this app: the one dynamic
  // `import('@kitn.ai/ui/elements')` (apps/theme-studio/kit.ts) is external,
  // rewritten to the absolute /theme-studio/kit/kai.es.js route, which dev.ts
  // maps onto the package's own dist/ — zero duplication, and this build stays
  // ordering-independent of build:elements.
  'theme-studio': {
    root: 'apps/theme-studio',
    outDir: 'dist/theme-studio',
    external: ['@kitn.ai/ui/elements'],
    paths: { '@kitn.ai/ui/elements': '/theme-studio/kit/kai.es.js' },
  },
};

const requested = process.env.KAI_BUILD ?? '';
// Own keys only -- see the note at the same guard in config/vite/lib.ts.
if (!Object.hasOwn(TARGETS, requested)) {
  throw new Error(
    `config/vite/page.ts: KAI_BUILD must be one of [${Object.keys(TARGETS).join(', ')}], got ${JSON.stringify(process.env.KAI_BUILD)}`,
  );
}
const page = TARGETS[requested];

export default defineConfig({
  root: resolve(PKG, page.root),
  base: './',
  plugins: [solid()],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    outDir: resolve(PKG, page.outDir),
    // Each page owns its own subdirectory, so this clobbers only itself.
    emptyOutDir: true,
    ...(page.external
      ? { rollupOptions: { external: page.external, output: { paths: page.paths } } }
      : {}),
  },
});
