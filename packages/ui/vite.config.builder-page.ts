import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/postcss';
import { resolve } from 'node:path';

// The kai dev --builder page (B-22..B-24): light-DOM Solid, prebuilt at kit
// build time so the CLI's "second thin server" serves static files and
// compiles nothing at consumer runtime. base './' because dev.ts serves it
// from an arbitrary port's root.
export default defineConfig({
  root: resolve(__dirname, 'src/builder-app'),
  base: './',
  plugins: [solid()],
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    outDir: resolve(__dirname, 'dist/builder-page'),
    emptyOutDir: true,
  },
});
