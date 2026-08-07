// A dev-server-only proxy that keeps OPENROUTER_API_KEY server-side.
//
// SECURITY CONTRACT (the whole point of the file):
//   · the key is read with Vite's `loadEnv(mode, root, '')` — the EMPTY prefix
//     is what makes an UNPREFIXED var readable. Vite only inlines `VITE_`-
//     prefixed vars into client code, so an unprefixed name can never reach the
//     bundle. There is no VITE_OPENROUTER_API_KEY and there must never be one.
//   · `@openrouter/sdk` is imported HERE and nowhere under `src/`. The browser
//     only ever talks to `POST /api/chat`.
//   · the key is never logged, never echoed in an error body, never sent to the
//     browser. `/api/config` reports a boolean.
//   · `apply: 'serve'` — this plugin does not exist in a production build. A
//     `vite build` of this app is a static site with NO server; a real
//     deployment needs its own route. Said again in the README.
import { loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { OpenRouter } from '@openrouter/sdk';
import type { ChatFunctionTool, ChatStreamChunk } from '@openrouter/sdk/models';
import { toModelChunk, toSdkMessages } from './sdk-bridge';
import type { ModelStreamChunk, WireMessage } from '../src/model-stream';
import { REPLY_WITH_CARD_FORMAT } from '../src/card-schema';

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
    // alias — `~deepseek/deepseek-v4-flash-latest` is a real, cheaper slug than
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
    apply: 'serve', // dev only — see the security contract above
    configResolved(config) {
      root = config.root;
      mode = config.mode;
    },
    configureServer(server) {
      // GET /api/config — what the client is allowed to know. NEVER the key.
      server.middlewares.use('/api/config', (_req, res) => {
        const env = readEnv(root, mode);
        json(res, 200, {
          model: env.model,
          reasoningEffort: env.reasoningEffort,
          maxTokens: env.maxTokens,
          hasKey: env.key.length > 0,
        });
      });

      // POST /api/chat — run one turn through the SDK, re-emit our neutral
      // chunk shape as SSE.
      server.middlewares.use('/api/chat', (req, res) => {
        void handleChat(req, res, readEnv(root, mode));
      });
    },
  };
}

interface ChatBody {
  messages?: WireMessage[];
  tools?: ChatFunctionTool[];
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
          '(UNPREFIXED — never VITE_OPENROUTER_API_KEY), then restart the dev server.',
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

  // The client never picks the model or the token cap — the server does, from
  // env. One less thing a public bundle can influence.
  const client = new OpenRouter({ apiKey: env.key });
  const structured = body.cardMode === 'structured';

  let stream: AsyncIterable<ChatStreamChunk>;
  try {
    // VERIFIED against @openrouter/sdk 1.2.11: the payload nests under
    // `chatRequest`. The README's flat `{ messages, model, stream }` does NOT
    // typecheck against the installed version.
    const result = await client.chat.send(
      {
        httpReferer: 'http://localhost:5177',
        appTitle: '@kitn.ai/ui OpenRouter spike',
        chatRequest: {
          model: env.model,
          messages: toSdkMessages(body.messages),
          stream: true,
          maxTokens: env.maxTokens,
          // Tools go out in BOTH card modes on purpose: whether a provider
          // accepts `tools` and `responseFormat` together is one of the things
          // the Path A / Path B comparison is trying to find out. A 4xx here is
          // itself the answer, and it surfaces in the UI banner.
          ...(body.tools?.length ? { tools: body.tools, toolChoice: 'auto' as const } : {}),
          ...(structured ? { responseFormat: REPLY_WITH_CARD_FORMAT } : {}),
          ...(env.reasoningEffort !== 'off' && env.reasoningEffort !== 'none'
            ? { reasoning: { effort: env.reasoningEffort as 'medium' } }
            : {}),
        },
      },
      { fetchOptions: { signal: abort.signal } },
    );

    // The streaming overload resolves to EventStream<ChatStreamChunk>, which is
    // a ReadableStream subclass. A non-streaming ChatResult has `choices` as a
    // plain array, so this narrows safely.
    if (!isAsyncIterable(result)) {
      return json(res, 500, { error: { message: 'Expected a streaming response but got a completed one.' } });
    }
    stream = result;
  } catch (e) {
    // Deliberately does not echo the request — it carries the Authorization header.
    return json(res, 502, { error: { message: `OpenRouter call failed: ${errorText(e)}` } });
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // don't let a proxy buffer the stream
  res.flushHeaders?.();

  const send = (chunk: ModelStreamChunk) => res.write(`data: ${JSON.stringify(chunk)}\n\n`);

  try {
    for await (const raw of stream) {
      const mapped = toModelChunk(raw);
      if (mapped) send(mapped);
    }
  } catch (e) {
    // Headers are already out, so report in-band the way OpenRouter itself does.
    send({ error: { code: 'proxy_stream_error', message: errorText(e) }, finishReason: 'error' });
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

function isAsyncIterable(v: unknown): v is AsyncIterable<ChatStreamChunk> {
  return typeof (v as AsyncIterable<unknown>)?.[Symbol.asyncIterator] === 'function';
}

/** Error text with no chance of leaking the request (and therefore the key). */
function errorText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}
