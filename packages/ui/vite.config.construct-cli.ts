import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

// Sibling of vite.config.mcp.ts (read its header): SSR/Node build, dist kept,
// zod external, Node builtins external. vite + vite-plugin-solid are NOT
// bundled — kai dev/compile run them inside the GENERATED project via npm
// scripts, so this bundle never imports them.
const external = ['zod', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

export default defineConfig({
  build: {
    emptyOutDir: false,
    ssr: 'src/agent-tooling/construct/cli-entry.ts',
    target: 'node18',
    rollupOptions: { external, output: { entryFileNames: 'construct-cli.es.js' } },
  },
});
