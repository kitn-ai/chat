import { loadEnv } from 'vite';
import type { Plugin } from 'vite';
// The '.js' is REQUIRED and is not a typo: tsconfig.node.json sets
// "module": "nodenext", where an extensionless relative import is TS2835. TS
// resolves './server/chat.js' to server/chat.ts, and so does Vite.
import { chatHandler } from './server/chat.js';
import type { ChatEnv } from './server/chat.js';

/** Cheap and fast. Override with OPENROUTER_MODEL — see .env.example. */
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';

/** A cost ceiling per reply, not a style choice. */
const DEFAULT_MAX_TOKENS = 1000;

function readChatEnv(root: string, mode: string): ChatEnv {
  // '' = no prefix filter. Without it Vite hands back only VITE_* vars, and the
  // key is deliberately not one of those (see server/chat.ts's security
  // contract: an unprefixed name can never reach the client bundle).
  const env = loadEnv(mode, root, '');
  const pick = (name: string) => env[name] || process.env[name] || '';
  return {
    key: pick('OPENROUTER_API_KEY'),
    model: pick('OPENROUTER_MODEL') || DEFAULT_MODEL,
    maxTokens: Number(pick('OPENROUTER_MAX_TOKENS')) || DEFAULT_MAX_TOKENS,
  };
}

/**
 * A Vite SPA has no server routes, so fetch('/api/chat') has nothing to answer
 * it. This plugin mounts the handler on the dev server. DEV ONLY: for
 * production, deploy the handler to a real server (Next, SvelteKit, a Worker,
 * Express) or point the fetch at one.
 */
export function chatApiPlugin(): Plugin {
  let env: ChatEnv = { key: '', model: DEFAULT_MODEL, maxTokens: DEFAULT_MAX_TOKENS };
  return {
    name: 'chat-api',
    configResolved(config) {
      env = readChatEnv(config.root, config.mode);
    },
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        const method = req.method ?? 'GET';

        // A body only where one is legal: `new Request` throws on GET/HEAD with
        // a body, and the handler's own 405 should answer those, not a crash.
        let body: string | undefined;
        if (method !== 'GET' && method !== 'HEAD') {
          body = '';
          req.setEncoding('utf8');
          for await (const chunk of req) body += chunk;
        }

        // The browser hangs up when the user aborts or deletes the thread
        // mid-answer; this signal rides the Request into the handler so the
        // upstream provider call is dropped too instead of streaming to no one.
        const abort = new AbortController();
        res.on('close', () => abort.abort());

        const response = await chatHandler(
          new Request('http://localhost/api/chat', {
            method,
            headers: { 'Content-Type': 'application/json' },
            body,
            signal: abort.signal,
          }),
          env,
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
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done || abort.signal.aborted) break;
            res.write(value);
          }
        } finally {
          await reader.cancel().catch(() => undefined);
          res.end();
        }
      });
    },
  };
}
