import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/postcss';
import { resolve } from 'node:path';

// The standalone theme studio (dev tool, iframed by the builder page):
// mirrors vite.config.builder-page.ts — light-DOM Solid, prebuilt at kit build
// time so the CLI's thin server serves static files and compiles nothing at
// consumer runtime. base './' because dev.ts serves it under /theme-studio/.
//
// The kai-* element bundle is NOT re-bundled into this app: the one dynamic
// `import('@kitn.ai/ui/elements')` (apps/theme-studio/kit.ts) is external,
// rewritten to the absolute /theme-studio/kit/kai.es.js route, which dev.ts
// maps onto the package's own dist/ — zero duplication, and this build stays
// ordering-independent of build:elements.
export default defineConfig({
  root: resolve(__dirname, 'apps/theme-studio'),
  base: './',
  plugins: [solid()],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    outDir: resolve(__dirname, 'dist/theme-studio'),
    emptyOutDir: true,
    rollupOptions: {
      external: ['@kitn.ai/ui/elements'],
      output: { paths: { '@kitn.ai/ui/elements': '/theme-studio/kit/kai.es.js' } },
    },
  },
});
