import { defineConfig } from 'vite';

// `@kitn.ai/ui` is linked into this app via `workspace:*`, so it resolves through
// node_modules + the package's `exports` map exactly like a published consumer
// would (no aliases, no source stubs). Build the kit first (`nx build ui`).
//
// No framework plugin: the browser upgrades the `kai-*` custom elements natively,
// so there is nothing here for a template compiler to learn about the tags.
//
// No server plugin either — the mock responder runs entirely in the browser
// (`createMockResponder` from `@kitn.ai/ui/state`), so there is no /api/chat.
export default defineConfig({
  server: { port: 5184 },
  preview: { port: 5184 },
});
