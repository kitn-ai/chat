// A dev-server-only proxy that keeps OPENROUTER_API_KEY server-side.
//
// SECURITY CONTRACT (the whole point of the file):
//   · the key is read with Vite's `loadEnv(mode, root, '')`: the EMPTY prefix
//     is what makes an UNPREFIXED var readable. Vite only inlines `VITE_`-
//     prefixed vars into client code, so an unprefixed name can never reach the
//     bundle. There is no VITE_OPENROUTER_API_KEY and there must never be one.
//   · the provider is reached from HERE and nowhere under `src/`. The browser
//     only ever talks to `POST /api/chat`.
//   · the key is never logged, never echoed in an error body, never sent to the
//     browser. `/api/config` reports a boolean.
//   · `apply: 'serve'`: this plugin does not exist in a production build. A
//     `vite build` of this app is a static site with NO server; a real
//     deployment needs its own route. Said again in the README.
//
// There is no provider SDK any more. The upstream is plain HTTP and its SSE
// bytes are forwarded UNTOUCHED, which is what every integration template in the
// kit's catalog tells a consumer to do. `readOpenAIStream` in the browser is
// what parses them.
import { loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { OpenAIWireMessage } from '@kitn.ai/ui/wire';
import type { ToolSpec } from '../src/tools';
import { REPLY_WITH_CARD_FORMAT } from '../src/card-schema';

const UPSTREAM_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = '~deepseek/deepseek-v4-flash-latest';
/** Cost discipline: the spike never needs long answers. */
const DEFAULT_MAX_TOKENS = 900;

interface ProxyEnv {
  key: string;
  model: string;
  /** `off` / `none` omits the reasoning field entirely. */
  reasoningEffort: string;
  maxTokens: number;
}

function readEnv(root: string, mode: string): ProxyEnv {
  // '' = no prefix filter. Without it Vite hands back only VITE_* vars.
  const env = loadEnv(mode, root, '');
  const pick = (name: string) => env[name] || process.env[name] || '';
  return {
    key: pick('OPENROUTER_API_KEY'),
    // Passed through VERBATIM, including the leading `~` of the floating-latest
    // alias: `~deepseek/deepseek-v4-flash-latest` is a real, cheaper slug than
    // the pinned `deepseek/deepseek-v4-flash`.
    model: pick('OPENROUTER_MODEL') || DEFAULT_MODEL,
    reasoningEffort: pick('OPENROUTER_REASONING_EFFORT') || 'medium',
    maxTokens: Number(pick('OPENROUTER_MAX_TOKENS')) || DEFAULT_MAX_TOKENS,
  };
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function openrouterProxy(): Plugin {
  let root = process.cwd();
  let mode = 'development';

  return {
    name: 'openrouter-spike-proxy',
    apply: 'serve', // dev only (see the security contract above)
    configResolved(config) {
      root = config.root;
      mode = config.mode;
    },
    configureServer(server) {
      // GET /api/config: what the client is allowed to know. NEVER the key.
      server.middlewares.use('/api/config', (_req, res) => {
        const env = readEnv(root, mode);
        json(res, 200, {
          model: env.model,
          reasoningEffort: env.reasoningEffort,
          maxTokens: env.maxTokens,
          hasKey: env.key.length > 0,
        });
      });

      // POST /api/chat: add the key, forward the upstream SSE byte for byte.
      server.middlewares.use('/api/chat', (req, res) => {
        void handleChat(req, res, readEnv(root, mode));
      });
    },
  };
}

interface ChatBody {
  /** Already OpenAI-shaped: the client builds it with `toOpenAIMessages`, so
   *  there is no mapping left to do here. */
  messages?: OpenAIWireMessage[];
  tools?: ToolSpec[];
  /** `structured` swaps the tool-driven card for a response_format schema. */
  cardMode?: 'tool' | 'structured';
}

async function handleChat(req: IncomingMessage, res: ServerResponse, env: ProxyEnv): Promise<void> {
  if (req.method !== 'POST') return json(res, 405, { error: { message: 'POST only' } });

  if (!env.key) {
    return json(res, 503, {
      error: {
        code: 'missing_key',
        message:
          'OPENROUTER_API_KEY is not set. Copy .env.example to .env.local and paste your key ' +
          '(UNPREFIXED, never VITE_OPENROUTER_API_KEY), then restart the dev server.',
      },
    });
  }

  let body: ChatBody;
  try {
    body = (await readBody(req)) as ChatBody;
  } catch {
    return json(res, 400, { error: { message: 'Request body was not valid JSON' } });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json(res, 400, { error: { message: '`messages` must be a non-empty array' } });
  }

  const abort = new AbortController();
  req.on('close', () => abort.abort());

  // The client never picks the model or the token cap: the server does, from
  // env. One less thing a public bundle can influence.
  const structured = body.cardMode === 'structured';

  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.key}`,
        'HTTP-Referer': 'http://localhost:5177',
        'X-Title': '@kitn.ai/ui OpenRouter spike',
      },
      body: JSON.stringify({
        model: env.model,
        stream: true,
        messages: body.messages,
        // Tools go out in BOTH card modes on purpose: whether a provider
        // accepts `tools` and `response_format` together is one of the things
        // the Path A / Path B comparison is trying to find out. A 4xx here is
        // itself the answer, and it now reaches the UI as a WireError carrying
        // the provider's own error body.
        ...(body.tools?.length ? { tools: body.tools, tool_choice: 'auto' } : {}),
        ...(structured ? { response_format: REPLY_WITH_CARD_FORMAT } : {}),
        ...(env.reasoningEffort !== 'off' && env.reasoningEffort !== 'none'
          ? { reasoning: { effort: env.reasoningEffort } }
          : {}),
        max_tokens: env.maxTokens,
      }),
      signal: abort.signal,
    });
  } catch (e) {
    // Deliberately does not echo the request: it carries the Authorization header.
    return json(res, 502, { error: { message: `OpenRouter call failed: ${errorText(e)}` } });
  }

  if (!upstream.ok || !upstream.body) {
    // The upstream error body passes through unchanged so WireError can carry it.
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await upstream.text().catch(() => ''));
    return;
  }

  // Forward the bytes UNTOUCHED. Every integration template in the catalog does
  // exactly this, so the spike now exercises the same path a consumer takes.
  res.statusCode = 200;
  res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // don't let a proxy buffer the stream
  res.flushHeaders?.();

  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) res.write(value);
    }
  } catch (e) {
    // Headers are already out, so report in-band the way OpenRouter itself does.
    // readOpenAIStream surfaces this as ModelTurn.error, not as a WireError.
    res.write(
      `data: ${JSON.stringify({
        error: { code: 'proxy_stream_error', message: errorText(e) },
        choices: [{ delta: {}, finish_reason: 'error' }],
      })}\n\n`,
    );
  } finally {
    await reader.cancel().catch(() => undefined);
    res.end();
  }
}

/** Error text with no chance of leaking the request (and therefore the key). */
function errorText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}
