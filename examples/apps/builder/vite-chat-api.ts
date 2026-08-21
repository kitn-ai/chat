/**
 * A Vite SPA has no server routes, so `fetch('/api/chat')` has nothing to answer
 * it. This plugin mounts the handler on the dev server AND on `vite preview`, so
 * the built app runs too. A real deployment would host `server/chat.ts` on a
 * real server (Express, a Worker, Next) — see README "Not production".
 *
 * THIS FILE IS THE BUILDER'S, with three insider changes, each labeled at its
 * site: the env read (corpus real-mode seam), the real-method forwarding +
 * middleware catch (F-10), and the disconnect propagation (corpus pattern).
 */
import { loadEnv } from 'vite';
import type { Connect, Plugin } from 'vite';

// The '.js' is REQUIRED and is not a typo: tsconfig.node.json is
// "module": "nodenext", where an extensionless relative import is TS2835. TS
// resolves './server/chat.js' to server/chat.ts, and so does Vite.
import { chatHandler } from './server/chat.js';
import type { ChatEnv } from './server/chat.js';

/**
 * Override with OPENROUTER_MODEL — see .env.example.
 *
 * NOT `anthropic/claude-haiku-4.5`, which is the other corpus apps' default.
 * This app's whole reply is a STREAMED tool call, and OpenRouter's streamed
 * `tool_calls` argument deltas come back as invalid JSON on its Anthropic
 * routes: the same request non-streamed parses fine, and OpenAI's streamed
 * deltas parse fine, but the streamed Anthropic ones arrive with a stray `}`
 * near the end and no page can ever be built from them. Verified both ways
 * (see this app's README, "Real mode"). Upstream defect, named here because the
 * default that works everywhere else silently does not work here.
 */
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

/** A cost ceiling per reply, not a style choice. A page is a big reply. */
const DEFAULT_MAX_TOKENS = 8000;

const EMPTY_ENV: ChatEnv = { key: '', model: DEFAULT_MODEL, maxTokens: DEFAULT_MAX_TOKENS };

// INSIDER CHANGE (corpus real-mode seam, not a builder gap — the clean-room
// task was mock-only by design). '' = no prefix filter. Without it Vite hands
// back only VITE_* vars, and the key is deliberately not one of those: see the
// security contract at the top of server/chat.ts.
function readChatEnv(root: string, mode: string): ChatEnv {
  const env = loadEnv(mode, root, '');
  const pick = (name: string) => env[name] || process.env[name] || '';
  return {
    key: pick('OPENROUTER_API_KEY'),
    model: pick('OPENROUTER_MODEL') || DEFAULT_MODEL,
    maxTokens: Number(pick('OPENROUTER_MAX_TOKENS')) || DEFAULT_MAX_TOKENS,
  };
}

function makeMiddleware(getEnv: () => ChatEnv): Connect.NextHandleFunction {
  return async (req, res) => {
    // INSIDER CHANGE (F-10). The builder's middleware had no try/catch, stamped
    // every request POST, and read a body unconditionally — so a single
    // `GET /api/chat` reached `await request.json()` on an empty body, threw,
    // and Node 22 killed the whole dev server on the unhandled rejection
    // (reproduced twice by the comparer). Three things fix it and they belong
    // together: forward the REAL method so the handler's own 405 is reachable,
    // read a body only where one is legal (`new Request` throws on GET/HEAD
    // with a body), and never let a rejection escape this function.
    try {
      const method = req.method ?? 'GET';

      let body: string | undefined;
      if (method !== 'GET' && method !== 'HEAD') {
        body = '';
        req.setEncoding('utf8');
        for await (const chunk of req) body += chunk as string;
      }

      // INSIDER CHANGE (corpus pattern). The browser hangs up when the user
      // asks a new question mid-answer; this signal rides the Request into the
      // handler so the upstream provider call is dropped too instead of
      // streaming to no one.
      const abort = new AbortController();
      res.on('close', () => abort.abort());

      const response = await chatHandler(
        new Request('http://localhost/api/chat', {
          method,
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: abort.signal,
        }),
        getEnv(),
      );

      // The STATUS has to survive the bridge: a 401 that arrives at the browser
      // as a 200 is a blank bubble and no error.
      res.statusCode = response.status;
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
    } catch (error) {
      // Decide loudly: log it, answer with a status, and keep the process alive.
      console.error('[api/chat] request failed:', error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: { message: 'The chat route failed. See the dev-server log.' } }));
        return;
      }
      res.end();
    }
  };
}

export function chatApiPlugin(): Plugin {
  let env: ChatEnv = EMPTY_ENV;
  const middleware = makeMiddleware(() => env);
  return {
    name: 'chat-api',
    configResolved(config) {
      env = readChatEnv(config.root, config.mode);
    },
    configureServer(server) {
      server.middlewares.use('/api/chat', middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/chat', middleware);
    },
  };
}
