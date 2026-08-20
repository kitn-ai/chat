import { defineConfig, type Plugin } from 'vite';
import { createMockChatMiddleware } from './mock-chat';

/**
 * Mounts POST /api/chat on the dev server AND on `vite preview`, so the
 * production build is runnable too rather than only the dev one.
 */
function mockChatEndpoint(): Plugin {
  return {
    name: 'mock-chat-endpoint',
    configureServer(server) {
      server.middlewares.use(createMockChatMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createMockChatMiddleware());
    },
  };
}

export default defineConfig({
  plugins: [mockChatEndpoint()],
  server: { port: 5173 },
});
