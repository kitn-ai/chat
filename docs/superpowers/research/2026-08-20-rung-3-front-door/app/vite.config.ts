import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// The '.js' is required, not a typo: this file is covered by tsconfig.node.json,
// which is "module": "nodenext", where an extensionless relative import is TS2835.
// TS resolves './vite-chat-api.js' to vite-chat-api.ts, and so does Vite.
import { chatApiPlugin } from './vite-chat-api.js';

export default defineConfig({
  plugins: [react(), chatApiPlugin()],
});
