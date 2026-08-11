import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      // Vendored upstream files import each other with the shadcn "@/" shape.
      { find: /^@\/components\/agents-ui\//, replacement: path.resolve(here, 'src/vendor/components/agents-ui/') + '/' },
      { find: /^@\/hooks\/agents-ui\//, replacement: path.resolve(here, 'src/vendor/hooks/agents-ui/') + '/' },
      { find: /^@\/lib\//, replacement: path.resolve(here, 'src/lib/') + '/' },
      // Our kit: built element bundle (dist) + plain-TS primitives (src).
      { find: /^@kit-dist\//, replacement: path.resolve(repoRoot, 'packages/ui/dist/') + '/' },
      { find: /^@kit-src\//, replacement: path.resolve(repoRoot, 'packages/ui/src/') + '/' },
    ],
  },
  server: {
    port: 6021,
    strictPort: true,
    fs: { allow: [repoRoot] },
  },
});
