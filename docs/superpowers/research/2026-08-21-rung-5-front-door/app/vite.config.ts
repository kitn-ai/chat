import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { chatApiPlugin } from './plugins/chat-api.js';

/** The console. Origin #1. */
export default defineConfig({
  plugins: [react(), chatApiPlugin()],
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist/console', emptyOutDir: true },
});
