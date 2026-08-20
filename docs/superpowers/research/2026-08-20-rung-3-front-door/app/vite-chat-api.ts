import type { Plugin } from 'vite';
// The '.js' is REQUIRED and is not a typo: tsconfig.node.json sets
// "module": "nodenext", where an extensionless relative import is TS2835. TS
// resolves './server/chat.js' to server/chat.ts, and so does Vite.
import { chatHandler } from './server/chat.js';

/**
 * A Vite SPA has no server routes, so fetch('/api/chat') has nothing to answer
 * it. This plugin mounts the handler on the dev server. DEV ONLY: for
 * production, deploy the handler to a real server (Next, SvelteKit, a Worker,
 * Express) or point the fetch at one.
 */
export function chatApiPlugin(): Plugin {
  return {
    name: 'chat-api',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        let body = '';
        req.setEncoding('utf8');
        for await (const chunk of req) body += chunk;

        const response = await chatHandler(
          new Request('http://localhost/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          }),
        );

        // The STATUS has to survive the bridge: a 401 from the provider that
        // arrives at the browser as a 200 is a blank bubble and no error.
        res.statusCode = response.status;
        // Annotated: a server tsconfig has no DOM lib in play for these params,
        // so they would otherwise be implicitly `any` (TS7006).
        response.headers.forEach((value: string, key: string) => res.setHeader(key, value));
        if (!response.body) {
          res.end();
          return;
        }

        // Write each chunk as it lands — buffering here defeats streaming.
        const reader = response.body.getReader();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      });
    },
  };
}
