import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Again '.js', for the same reason as inside vite-chat-api.ts: tsconfig.node.json
// is "module": "nodenext", where './vite-chat-api' is TS2835 and fails the build.
import { chatApiPlugin } from './vite-chat-api.js';

export default defineConfig({
  plugins: [react(), chatApiPlugin()],
});
