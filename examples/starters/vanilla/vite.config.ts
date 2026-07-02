import { defineConfig } from 'vite';

// `@kitn.ai/ui` is linked into this example via `workspace:*`, so it resolves
// through node_modules + the package's `exports` map exactly like a published
// consumer would (no aliases, no source stubs). Build the kit first (`nx build ui`).
//
// No framework plugin here: the browser upgrades the `kai-*` custom elements
// natively, so unlike the React/Vue examples there is nothing for a template
// compiler to learn about the tags. This is the "pure web components, zero
// framework" showcase.
// https://vite.dev/config/
export default defineConfig({
  server: { port: 5176 },
});
