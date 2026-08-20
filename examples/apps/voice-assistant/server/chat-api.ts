// The dev-server half of the assistant: `POST /api/chat`, in two modes.
//
// THE MOCK SIDE OF THIS FILE IS THE FRONT-DOOR BUILDER'S. The clean-room build
// shipped this middleware as `mock-chat.ts` (405 guard, socket-close detection,
// the anti-buffering header, dev + preview mounts) with no template to copy —
// the `mock` integration's backend section is empty (findings G-04). Its design
// stands; the insider completion added only the OpenRouter seam below, copied
// from examples/apps/support-widget/server/chat-api.ts.
//
// SECURITY CONTRACT (same as the support widget's):
//   · the key is read with Vite's `loadEnv(mode, root, '')` — the EMPTY prefix is
//     what makes an UNPREFIXED var readable. Vite only inlines `VITE_`-prefixed
//     vars into client code, so an unprefixed name can never reach the bundle.
//     There is no VITE_OPENROUTER_API_KEY and there must never be one.
//   · the provider is reached from HERE and nowhere under `src/`. The browser
//     only ever talks to `POST /api/chat`.
//   · the key is never logged, never echoed into an error body, never sent to
//     the browser.
//
// THE MOCK/REAL SEAM IS HERE, AND ONLY HERE. No key: `createMockResponder()`
// from the kit's own state package streams canned OpenAI-shaped SSE frames
// (every frame is marked — a `: kai-mock` banner, a `_kai_mock` field,
// `model: "kai-mock"`, zero usage — so nothing served from here can be mistaken
// for a real turn). Key: the same request goes to OpenRouter and its SSE bytes
// are forwarded untouched. The client makes the identical fetch either way and
// parses both with `readOpenAIStream`, so the wire path the mock exercises is
// the one that ships.
import { loadEnv } from 'vite';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createMockResponder } from '@kitn.ai/ui/state';
import type { OpenAIWireMessage } from '@kitn.ai/ui/wire';

import { CHAT_ROUTE } from '../src/routes';

/** OpenRouter normalises EVERY model onto the OpenAI chat-completions shape,
 *  Anthropic's included — which is why an Anthropic model reached through here
 *  is parsed by `readOpenAIStream` and not the Anthropic reader. */
const UPSTREAM_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Cheap and fast. Override with OPENROUTER_MODEL — see .env.example. */
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';

/** Spoken answers are short. This is a cost ceiling, not a style choice. */
const DEFAULT_MAX_TOKENS = 400;

/** The system turn, real path only; the mock has canned replies. The reply is
 *  read aloud by `speechSynthesis`, which pronounces markdown punctuation
 *  literally — hence the plain-prose demand. */
const SYSTEM_PROMPT =
  'You are a voice assistant. Your reply is read aloud by a speech synthesiser, ' +
  'so answer in one to three short sentences of plain spoken prose: no markdown, ' +
  'no lists, no code blocks, no URLs. If you do not know, say so plainly.';

/**
 * Canned replies for the no-key mode, cycled one per turn by the responder.
 * Deliberately plain prose, for the same reason as the system prompt above.
 *
 * MODULE scope, not per-request: the responder owns the cursor into these
 * replies, so rebuilding it per turn would answer with the first one forever.
 */
const REPLIES: readonly string[] = [
  "I heard you. I'm a local mock reply, not a real model — no provider was contacted, and no audio ever left your browser. Your speech was recognised on device, and this sentence is about to be spoken back to you the same way.",
  "Still the mock speaking. Everything you say is transcribed by the browser's own speech recogniser, and everything I say is spoken by the browser's own synthesiser. The only thing crossing the network is this text, streamed from your dev server.",
  'Mock reply number three. The point of this turn is that the transcript above keeps every earlier turn intact, so you can hold a whole conversation and scroll back through it.',
  'One more canned answer. Put an OpenRouter key in this app’s .env.local and restart the dev server to talk to a real model. The browser code does not change at all: the swap happens in server/chat-api.ts.',
];

const mockResponse = createMockResponder({ replies: REPLIES, delayMs: 28, chunkSize: 1 });

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

/** The body the app posts: the thread, already encoded by the kit's
 *  `toOpenAIMessages`. There is no message mapping left to do here. */
interface ChatRequestBody {
  messages?: OpenAIWireMessage[];
}

/**
 * Mounted on the dev server AND on `vite preview`, so the production build is
 * runnable too rather than only the dev one — the front-door builder's call,
 * kept. The key never enters the client bundle either way: it is read here,
 * server-side, at config-resolve time.
 */
export function voiceChatApi(): Plugin {
  let env: ChatEnv = { key: '', model: DEFAULT_MODEL, maxTokens: DEFAULT_MAX_TOKENS };
  const handler = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    // On a connect-style middleware `req.url` is the path, query included.
    const path = (req.url ?? '').split('?')[0];
    if (path !== CHAT_ROUTE) {
      next();
      return;
    }
    void handleChat(req, res, env);
  };

  return {
    name: 'voice-assistant-chat-api',
    configResolved(config) {
      env = readChatEnv(config.root, config.mode);
    },
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

async function handleChat(req: IncomingMessage, res: ServerResponse, env: ChatEnv): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'POST' });
    res.end('POST only');
    return;
  }

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
 *  `X-Kai-Mock` is for a human reading a curl or a test asserting which mode
 *  ran. The CLIENT never reads it — branching there would put the seam back in
 *  the browser, which is the one thing this split exists to prevent. */
async function streamMock(res: ServerResponse, messages: OpenAIWireMessage[]): Promise<void> {
  openSse(res, { 'X-Kai-Mock': '1' });

  // The browser hangs up when the user asks a new question mid-answer; stop
  // producing frames rather than writing to a dead socket.
  let open = true;
  res.on('close', () => {
    open = false;
  });

  try {
    for await (const frame of mockResponse(lastUserText(messages))) {
      if (!open) return;
      res.write(frame);
    }
  } catch (err) {
    console.error('[voice-assistant chat-api] mock stream failed:', err);
  } finally {
    if (open) res.end();
  }
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
        'HTTP-Referer': 'http://localhost:5179',
        'X-Title': '@kitn.ai/ui voice assistant',
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
    // The provider's own error body passes through unchanged, so the app can
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
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Vite's dev server sits behind nothing, but a proxy in front of a preview
  // build would otherwise buffer the whole stream into one lump and the reply
  // would land all at once instead of streaming.
  res.setHeader('X-Accel-Buffering', 'no');
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
