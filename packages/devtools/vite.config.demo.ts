import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The demo server. Rooted at demo/ so index.html and main.ts sit together.
//
// The panel is imported from ../dist -- the REAL built artifact, not its source
// -- so the page runs what a CDN would serve. That is also why `fs.allow` has to
// name the package root: the entry lives outside the demo root.
export default defineConfig({
  root: resolve(__dirname, 'demo'),
  server: {
    port: 4330,
    open: false,
    fs: { allow: [resolve(__dirname)] },
  },
});
