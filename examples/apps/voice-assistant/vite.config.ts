import { defineConfig } from 'vite';
import { voiceChatApi } from './server/chat-api';

// `@kitn.ai/ui` is linked into this app via `workspace:*`, so it resolves through
// node_modules + the package's `exports` map exactly like a published consumer
// would (no aliases, no source stubs). Build the kit first (`nx build ui`).
//
// No framework plugin: the browser upgrades the `kai-*` custom elements natively,
// so there is nothing here for a template compiler to learn about the tags.
//
// `voiceChatApi()` mounts POST /api/chat on the dev server AND on `vite preview`
// (the front-door builder's design, kept), so the production build is runnable
// too. The key is read server-side and never enters the client bundle.
export default defineConfig({
  plugins: [voiceChatApi()],
  server: { port: 5179 },
  preview: { port: 5179 },
});
