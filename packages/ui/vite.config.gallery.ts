import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/postcss';
import { resolve } from 'node:path';

// The blocks gallery page (Task 5.1, blocks-and-parts plan): light-DOM Solid,
// prebuilt at kit build time exactly like vite.config.builder-page.ts /
// vite.config.theme-studio.ts, so the CLI's thin server serves static files
// and compiles nothing at consumer runtime. base './' because dev.ts serves
// it under /gallery/.
export default defineConfig({
  root: resolve(__dirname, 'apps/gallery'),
  base: './',
  plugins: [solid()],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    outDir: resolve(__dirname, 'dist/gallery'),
    emptyOutDir: true,
  },
});
