import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import solid from 'vite-plugin-solid';

/**
 * Vite config for the remote-provider dev example.
 *
 * Run via:  npm run dev:provider   (serves on http://localhost:6007)
 *
 * This example imports directly from ../../../packages/ui/src/ so it works without a prior
 * `npm run build`. Vite handles TypeScript out-of-the-box.
 *
 * vite-plugin-solid is required because the registered card renderers mount
 * SolidJS-authored elements (e.g. <kai-form> from ../../../packages/ui/src/elements/form): their
 * `.tsx` JSX must be compiled with Solid's transform, not esbuild's default
 * `React.createElement` transform (which would otherwise throw "React is not
 * defined" at runtime and render an empty card). The provider RUNTIME
 * (createCardBridge) is framework-free; the plugin is only here so the demo can
 * mount real kit elements.
 *
 * The root is set to this directory so `index.html` is served at /.
 */
export default defineConfig({
  root: resolve(__dirname),
  plugins: [solid()],
});
