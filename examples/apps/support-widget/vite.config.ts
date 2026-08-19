import { defineConfig } from 'vite';
import { supportChatApi } from './server/chat-api';

// `@kitn.ai/ui` is linked into this app via `workspace:*`, so it resolves through
// node_modules + the package's `exports` map exactly like a published consumer
// would (no aliases, no source stubs). Build the kit first (`nx build ui`).
//
// No framework plugin: the browser upgrades the `kai-*` custom elements natively,
// so there is nothing here for a template compiler to learn about the tags.
//
// `supportChatApi()` is `apply: 'serve'` — it exists only under `vite dev`. The
// key is read server-side there and never enters the client bundle. `vite build`
// produces a static site with no /api/chat at all; see README "Not production".
export default defineConfig({
  plugins: [supportChatApi()],
  server: { port: 5178 },
});
