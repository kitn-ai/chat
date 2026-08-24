/**
 * A Vite SPA has no server routes, so `fetch('/api/chat')` has nothing to answer
 * it. This plugin mounts the handler on the dev server. DEV ONLY: a production
 * deployment puts `chatHandler` on a real server (or points the fetch at one).
 *
 * THIS FILE IS THE CLEAN-ROOM BUILD'S, with two insider changes, each labeled at
 * its site: the env read (corpus real-mode seam) and the disconnect propagation
 * (corpus pattern). The request guards it already had are rung-4 F-10's fix
 * arriving in a fresh build on its own — recorded as F-40, a non-finding.
 */
import { loadEnv } from 'vite';
import type { Plugin } from 'vite';
import { chatHandler } from '../server/chat.js';
import type { ChatEnv } from '../server/chat.js';
import { pipeResponse, readBody } from './bridge.js';

/**
 * INSIDER CHANGE (corpus real-mode seam — NOT a builder gap; the clean-room task
 * was mock-only by design, and the build's own NOTES.md names swapping
 * `scriptFrames(...)` for a provider call as the intended seam).
 *
 * Override with OPENROUTER_MODEL — see .env.example.
 *
 * NOT an `anthropic/*` route. Every card this console emits is a STREAMED tool
 * call, and OpenRouter's streamed `tool_calls` argument deltas come back as
 * invalid JSON on its Anthropic routes (rung-4 F-21: a stray `}` near the end;
 * the same request non-streamed parses fine and OpenAI's streamed deltas parse
 * fine). On an Anthropic model this app produces no cards at all — only prose.
 */
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash-0731';

/** A cost ceiling per reply. A card is a small reply; a form definition is the
 *  largest thing the model here ever writes. */
const DEFAULT_MAX_TOKENS = 2000;

const EMPTY_ENV: ChatEnv = { key: '', model: DEFAULT_MODEL, maxTokens: DEFAULT_MAX_TOKENS };

// '' = no prefix filter. Without it Vite hands back only VITE_* vars, and the key
// is deliberately not one of those: see the security contract in server/chat.ts.
function readChatEnv(root: string, mode: string): ChatEnv {
  const env = loadEnv(mode, root, '');
  const pick = (name: string): string => env[name] || process.env[name] || '';
  return {
    key: pick('OPENROUTER_API_KEY'),
    model: pick('OPENROUTER_MODEL') || DEFAULT_MODEL,
    maxTokens: Number(pick('OPENROUTER_MAX_TOKENS')) || DEFAULT_MAX_TOKENS,
  };
}

export function chatApiPlugin(): Plugin {
  let env: ChatEnv = EMPTY_ENV;
  return {
    name: 'ops-console-chat-api',
    configResolved(config) {
      env = readChatEnv(config.root, config.mode);
    },
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        let response: Response;
        try {
          // INSIDER CHANGE (corpus pattern). The operator asks something new
          // mid-answer and the browser hangs up; this signal rides the Request
          // into the handler so the upstream provider call is dropped too
          // instead of streaming to nobody and still being billed.
          const abort = new AbortController();
          res.on('close', () => abort.abort());

          response = await chatHandler(
            new Request('http://localhost/api/chat', {
              method: req.method ?? 'GET',
              headers: { 'Content-Type': 'application/json' },
              body: req.method === 'POST' ? await readBody(req) : undefined,
              signal: abort.signal,
            }),
            env,
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
