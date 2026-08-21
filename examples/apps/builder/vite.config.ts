import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Again '.js', for the same reason as inside vite-chat-api.ts: tsconfig.node.json
// is "module": "nodenext", where './vite-chat-api' is TS2835 and fails the build.
import { chatApiPlugin } from './vite-chat-api.js';

// `@kitn.ai/ui` is linked into this app via `workspace:*`, so it resolves through
// node_modules + the package's `exports` map exactly like a published consumer
// would (no aliases, no source stubs). Build the kit first (`nx build ui`).
//
// The port is fixed and unique across `examples/` (5173-5176 are the starters,
// 5178-5180 rungs 1-3). Read every vite.config under examples/ before changing it.
export default defineConfig({
  plugins: [react(), chatApiPlugin()],
  server: { port: 5181 },
  preview: { port: 5181 },
});
