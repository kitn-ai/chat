// The dev-server half of the widget: `POST /api/chat`, in two modes.
//
// SECURITY CONTRACT (copied from examples/internal/openrouter-spike, which is
// where this pattern was worked out):
//   · the key is read with Vite's `loadEnv(mode, root, '')` — the EMPTY prefix is
//     what makes an UNPREFIXED var readable. Vite only inlines `VITE_`-prefixed
//     vars into client code, so an unprefixed name can never reach the bundle.
//     There is no VITE_OPENROUTER_API_KEY and there must never be one.
//   · the provider is reached from HERE and nowhere under `src/`. The browser
//     only ever talks to `POST /api/chat`.
//   · the key is never logged, never echoed into an error body, never sent to
//     the browser.
//   · `apply: 'serve'`: this plugin does not exist in a production build. A
//     `vite build` of this app is a static site with NO server, and its
//     `/api/chat` 404s until you give it a real route. Said again in the README.
//
// THE MOCK/REAL SEAM IS HERE, AND ONLY HERE. No key: `createMockResponder()`
// from the kit's own state package streams canned OpenAI-shaped SSE frames. Key:
// the same request goes to OpenRouter and its SSE bytes are forwarded untouched.
// The client makes the identical fetch either way and parses both with
// `readOpenAIStream`, so the wire path the mock exercises is the one that ships.
import { loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createMockResponder } from '@kitn.ai/ui/state';
import type { OpenAIWireMessage } from '@kitn.ai/ui/wire';

/** OpenRouter normalises EVERY model onto the OpenAI chat-completions shape,
 *  Anthropic's included — which is why an Anthropic model reached through here
 *  is parsed by `readOpenAIStream` and not the Anthropic reader. */
const UPSTREAM_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Cheap and fast, which is what a support widget wants. Override with
 *  OPENROUTER_MODEL — see .env.example. */
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';

/** Support answers are short. This is a cost ceiling, not a style choice. */
const DEFAULT_MAX_TOKENS = 600;

/** The system turn. Sent on the real path only; the mock has canned replies. */
const SYSTEM_PROMPT =
  'You are the support assistant for Meridian, a fictional invoicing product. ' +
  'Answer in two or three sentences. Markdown is rendered, so use it sparingly. ' +
  'If you do not know something about this account, say so and offer to hand over to a human.';

/**
 * What the no-key mode answers with.
 *
 * MODULE scope, not per-request: the responder owns the cursor into these
 * replies, so rebuilding it per turn would answer with the first one forever.
 * `announce: false` because this runs in the dev server's terminal rather than
 * the browser console — the banner frame and the `_kai_mock` marker on every
 * frame are the tells that reach the person reading the stream.
 */
const mockResponse = createMockResponder({
  announce: false,
  replies: [
    'This reply came from `createMockResponder()` in `@kitn.ai/ui/state` — no provider was contacted, ' +
      'and no key is set. Put an `OPENROUTER_API_KEY` in `.env.local` and restart the dev server to ' +
      'talk to a real model. **The browser code does not change**: the swap happens in this app’s ' +
      '`server/chat-api.ts`.',
    "Your last invoice lives under **Billing → History**. Every invoice is a permalink, so you can send " +
      'finance the link rather than a PDF attachment.',
    'Plan changes take effect immediately and we prorate to the day. The adjustment shows up as its own ' +
      'line on the next invoice, so nothing is silently rolled into the subtotal.',
    'Add a VAT number under **Billing → Tax details**. It is validated against VIES before it is stored, ' +
      'and it appears on every invoice issued after that.',
  ],
});

interface ChatEnv {
  key: string;
  model: string;
  maxTokens: number;
}

function readChatEnv(root: string, mode: string): ChatEnv {
  // '' = no prefix filter. Without it Vite hands back only VITE_* vars, and the
  // key is deliberately not one of those.
  const env = loadEnv(mode, root, '');
  const pick = (name: string) => env[name] || process.env[name] || '';
  return {
    key: pick('OPENROUTER_API_KEY'),
    model: pick('OPENROUTER_MODEL') || DEFAULT_MODEL,
    maxTokens: Number(pick('OPENROUTER_MAX_TOKENS')) || DEFAULT_MAX_TOKENS,
  };
}

/** The body the widget posts: the thread, already encoded by the kit's
 *  `toOpenAIMessages`. There is no message mapping left to do here. */
interface ChatRequestBody {
  messages?: OpenAIWireMessage[];
}

export function supportChatApi(): Plugin {
  let root = process.cwd();
  let mode = 'development';

  return {
    name: 'support-widget-chat-api',
    apply: 'serve', // dev only (see the security contract above)
    configResolved(config) {
      root = config.root;
      mode = config.mode;
    },
    configureServer(server) {
      server.middlewares.use('/api/chat', (req, res) => {
        void handleChat(req, res, readChatEnv(root, mode));
      });
    },
  };
}

async function handleChat(req: IncomingMessage, res: ServerResponse, env: ChatEnv): Promise<void> {
  if (req.method !== 'POST') return json(res, 405, { error: { message: 'POST only' } });

  let body: ChatRequestBody;
  try {
    body = (await readBody(req)) as ChatRequestBody;
  } catch {
    return json(res, 400, { error: { message: 'Request body was not valid JSON' } });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json(res, 400, { error: { message: '`messages` must be a non-empty array' } });
  }

  if (!env.key) return streamMock(res, messages);
  return proxyOpenRouter(req, res, env, messages);
}

/** No key: the kit's own mock, streamed frame by frame.
 *
 *  `X-Kai-Mock` is for a human reading a curl or a test asserting which mode ran.
 *  The CLIENT never reads it — branching there would put the seam back in the
 *  browser, which is the one thing this split exists to prevent. */
async function streamMock(res: ServerResponse, messages: OpenAIWireMessage[]): Promise<void> {
  openSse(res, { 'X-Kai-Mock': '1' });

  let open = true;
  res.on('close', () => {
    open = false;
  });

  for await (const frame of mockResponse(lastUserText(messages))) {
    if (!open) break;
    res.write(frame);
  }
  res.end();
}

/** Key present: forward the turn to OpenRouter and pipe its SSE back untouched.
 *  Every integration template in the kit's catalog does exactly this. */
async function proxyOpenRouter(
  req: IncomingMessage,
  res: ServerResponse,
  env: ChatEnv,
  messages: OpenAIWireMessage[],
): Promise<void> {
  const abort = new AbortController();
  req.on('close', () => abort.abort());

  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.key}`,
        'HTTP-Referer': 'http://localhost:5178',
        'X-Title': '@kitn.ai/ui support widget',
      },
      body: JSON.stringify({
        model: env.model,
        stream: true,
        max_tokens: env.maxTokens,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      }),
      signal: abort.signal,
    });
  } catch (error) {
    // Deliberately does not echo the request: it carries the Authorization header.
    return json(res, 502, { error: { message: `OpenRouter call failed: ${errorText(error)}` } });
  }

  if (!upstream.ok || !upstream.body) {
    // The provider's own error body passes through unchanged, so the widget can
    // show what actually went wrong instead of a generic failure.
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await upstream.text().catch(() => ''));
    return;
  }

  openSse(res, { 'Content-Type': upstream.headers.get('content-type') ?? 'text/event-stream' });

  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) res.write(value);
    }
  } catch (error) {
    // Headers are long gone, so report in band the way OpenRouter itself does.
    // `readOpenAIStream` surfaces this as ModelTurn.error rather than a WireError.
    res.write(
      `data: ${JSON.stringify({
        error: { code: 'proxy_stream_error', message: errorText(error) },
        choices: [{ delta: {}, finish_reason: 'error' }],
      })}\n\n`,
    );
  } finally {
    await reader.cancel().catch(() => undefined);
    res.end();
  }
}

function openSse(res: ServerResponse, headers: Record<string, string> = {}): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // don't let a proxy buffer the stream
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.flushHeaders?.();
}

/** The prompt the mock is handed. It cycles its replies regardless, so this is
 *  only ever a courtesy to a responder that wanted to look at the question. */
function lastUserText(messages: OpenAIWireMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== 'user') continue;
    return typeof message.content === 'string'
      ? message.content
      : (message.content ?? [])
          .map((part) => (part.type === 'text' ? part.text : ''))
          .join(' ')
          .trim();
  }
  return '';
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/** Error text with no chance of leaking the request (and therefore the key). */
function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
