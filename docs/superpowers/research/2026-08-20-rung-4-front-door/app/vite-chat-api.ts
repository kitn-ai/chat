/**
 * A Vite SPA has no server routes, so `fetch('/api/chat')` has nothing to answer
 * it. This plugin mounts the handler on the dev server AND on `vite preview`, so
 * the built app runs too. A real deployment would host `server/chat.ts` on a
 * real server (Express, a Worker, Next) — see NOTES.md.
 */
import type { Connect, Plugin } from 'vite';

// The '.js' is REQUIRED and is not a typo: tsconfig.node.json is
// "module": "nodenext", where an extensionless relative import is TS2835. TS
// resolves './server/chat.js' to server/chat.ts, and so does Vite.
import { chatHandler } from './server/chat.js';

const chatMiddleware: Connect.NextHandleFunction = async (req, res) => {
  let body = '';
  req.setEncoding('utf8');
  for await (const chunk of req) body += chunk as string;

  const response = await chatHandler(
    new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }),
  );

  // The STATUS has to survive the bridge: a 401 that arrives at the browser as
  // a 200 is a blank bubble and no error.
  res.statusCode = response.status;
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
};

export function chatApiPlugin(): Plugin {
  return {
    name: 'chat-api',
    configureServer(server) {
      server.middlewares.use('/api/chat', chatMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/chat', chatMiddleware);
    },
  };
}
