import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { openrouterProxy } from './server/openrouter-proxy';

// `@kitn.ai/ui` is linked via `workspace:*`, so it resolves through node_modules +
// the package `exports` map exactly like a published consumer. Build the kit first
// (`pnpm build:ui`).
//
// `openrouterProxy()` is `apply: 'serve'` — it exists only in `vite dev`. The key
// is read server-side there and never enters the client bundle. `vite build`
// produces a static site with no /api/chat at all; see README "Not production".
export default defineConfig({
  plugins: [react(), openrouterProxy()],
  server: { port: 5177 },
});
