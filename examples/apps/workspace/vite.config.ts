import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// The '.js' is required, not a typo: this file is covered by tsconfig.node.json,
// which is "module": "nodenext", where an extensionless relative import is TS2835.
// TS resolves './vite-chat-api.js' to vite-chat-api.ts, and so does Vite.
import { chatApiPlugin } from './vite-chat-api.js';

// `@kitn.ai/ui` is linked into this app via `workspace:*`, so it resolves through
// node_modules + the package's `exports` map exactly like a published consumer
// would (no aliases, no source stubs). Build the kit first (`nx build ui`).
//
// `chatApiPlugin()` mounts POST /api/chat on the dev server only — `vite build`
// produces a static site with no /api/chat at all; see README "Not production".
// The key is read server-side there and never enters the client bundle.
export default defineConfig({
  plugins: [react(), chatApiPlugin()],
  server: { port: 5180 },
});
