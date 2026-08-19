import { defineConfig, type Plugin } from 'vite';
// Explicit .ts extension: Vite's native config loader warns without it.
import { mockChatEndpoint } from './server/mock-chat.ts';

/**
 * Mounts the mocked streaming chat route on the dev server AND the preview
 * server, so `npm run dev` and `npm run preview` behave identically. It is a
 * dev-time stand-in for a real route: `npm run build` emits only static assets,
 * and a deployment would put its own /api/chat in front of them.
 */
function mockChatApi(): Plugin {
  return {
    name: 'aurora-mock-chat-api',
    configureServer(server) {
      server.middlewares.use('/api/chat', mockChatEndpoint);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/chat', mockChatEndpoint);
    },
  };
}

export default defineConfig({
  plugins: [mockChatApi()],
  server: { port: 5173 },
});
