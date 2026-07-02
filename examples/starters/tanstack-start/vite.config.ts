import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';

// https://tanstack.com/start/latest — TanStack Start is a full-stack React
// framework: every route is server-rendered, then hydrated on the client.
//
// `@kitn.ai/ui` is built with SolidJS but ships framework-agnostic custom
// elements. `@kitn.ai/ui/react` provides typed React wrappers that register the
// elements **client-only** (inside a layout effect) and assign array/object
// props as live DOM *properties*. SSR emits the bare `<kai-*>` tags; the client
// hydrates, registers and populates them — no work needed on the server.
//
// This is the standard TanStack Start config: the Start plugin first, then
// React's. The kit needs no special handling — leaving `@kitn.ai/ui` external to
// the SSR build (the Vite default) is correct, because the per-element
// registration imports only run in the browser, so the server just renders the
// bare tags.
export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    // TanStack Start's plugin MUST come before React's.
    tanstackStart(),
    viteReact(),
  ],
});
