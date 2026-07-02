import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `@kitn.ai/ui` is linked into this example via `workspace:*`, so it resolves
// through node_modules + the package's `exports` map exactly like a published
// consumer would — no aliases needed. Build the kit first (`nx build ui`).
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
