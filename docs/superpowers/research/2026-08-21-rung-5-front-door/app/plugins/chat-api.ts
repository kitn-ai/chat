/**
 * A Vite SPA has no server routes, so `fetch('/api/chat')` has nothing to answer
 * it. This plugin mounts the handler on the dev server. DEV ONLY: a production
 * deployment puts `chatHandler` on a real server (or points the fetch at one).
 */
import type { Plugin } from 'vite';
import { chatHandler } from '../server/chat.js';
import { pipeResponse, readBody } from './bridge.js';

export function chatApiPlugin(): Plugin {
  return {
    name: 'ops-console-chat-api',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        let response: Response;
        try {
          response = await chatHandler(
            new Request('http://localhost/api/chat', {
              method: req.method ?? 'GET',
              headers: { 'Content-Type': 'application/json' },
              body: req.method === 'POST' ? await readBody(req) : undefined,
            }),
          );
        } catch (error) {
          // An unhandled rejection in an async connect middleware EXITS Node 22.
          server.config.logger.error(`[chat-api] ${String(error)}`);
          response = Response.json({ error: 'Chat handler failed.' }, { status: 500 });
        }
        await pipeResponse(response, res);
      });
    },
  };
}
