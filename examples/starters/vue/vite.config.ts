import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// `@kitn.ai/ui` is linked into this example via `workspace:*`, so it resolves
// through node_modules + the package's `exports` map exactly like a published
// consumer would — no aliases, no source stubs. Build the kit first (`nx build ui`).
//
// The one Vue-specific bit: tell the template compiler that every `kai-*` tag is a
// native custom element. Without this Vue tries to resolve them as Vue components
// (warning "unknown custom element"); with it, Vue leaves them alone and passes
// props/events straight through to the DOM.
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('kai-'),
        },
      },
    }),
  ],
  server: { port: 5174 },
});
