import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// `@kitn.ai/ui` is linked into this example via `workspace:*`, so it resolves
// through node_modules + the package's `exports` map exactly like a published
// consumer would — no aliases, no source stubs. Build the kit first (`nx build ui`).
//
// Unlike Vue, Svelte needs no `isCustomElement` config: the compiler already
// treats any hyphenated tag (`kai-*`) as a native custom element and passes
// props/events straight through to the DOM.
// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  server: { port: 5175 },
});
