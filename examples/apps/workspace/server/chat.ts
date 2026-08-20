// The dev-server half of the workspace: `POST /api/chat`, in two modes.
//
// THE MOCK SIDE OF THIS FILE IS THE FRONT-DOOR BUILDER'S, adopted from the kai
// scaffolder's block 2 near-verbatim (the first rung where the `mock`
// integration shipped a backend template at all — findings G-04, fixed by
// #298). Its design stands: the `ChatRequestBody`/`readChatRequest` preamble
// that narrows the JSON once at the edge, the module-scope responder that owns
// the cursor into its canned replies, and the `ReadableStream` whose `cancel()`
// stops producing frames when the browser hangs up. The insider completion
// added only the request guards and the OpenRouter seam below, mirroring
// examples/apps/voice-assistant/server/chat-api.ts.
//
// SECURITY CONTRACT (same as the other corpus apps'):
//   · the key is read with Vite's `loadEnv(mode, root, '')` in vite-chat-api.ts —
//     the EMPTY prefix is what makes an UNPREFIXED var readable. Vite only
//     inlines `VITE_`-prefixed vars into client code, so an unprefixed name can
//     never reach the bundle. There is no VITE_OPENROUTER_API_KEY and there
//     must never be one.
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
import type { OpenAIWireMessage } from '@kitn.ai/ui/wire';

import { createMockResponder } from '@kitn.ai/ui/state';

/** OpenRouter normalises EVERY model onto the OpenAI chat-completions shape,
 *  Anthropic's included — which is why an Anthropic model reached through here
 *  is parsed by `readOpenAIStream` and not the Anthropic reader. */
const UPSTREAM_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** What vite-chat-api.ts reads from the env (unprefixed, server-side only)
 *  and hands to the handler. Defaults live there, beside the read. */
export type ChatEnv = {
  key: string;
  model: string;
  maxTokens: number;
};

// The kit's own mock responder — no provider, no key, no upstream. MODULE
// scope, not per-request: the responder owns the cursor into its canned
// replies, so rebuilding it per turn would answer with the first one forever.
const mockResponse = createMockResponder();

/**
 * What the front end POSTs. `request.json()` is `unknown` (it is whatever the
 * client sent), so the body is narrowed once here instead of at every use.
 * Widen it as you add fields of your own.
 */
type ChatRequestBody = {
  messages: OpenAIWireMessage[];
  model?: string;
  tools?: unknown[];
};

/** Narrow the JSON body once, at the edge. */
async function readChatRequest(request: Request): Promise<ChatRequestBody> {
  return (await request.json()) as ChatRequestBody;
}

async function chatHandler(request: Request, env: ChatEnv): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('POST only', {
      status: 405,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'POST' },
    });
  }

  let body: ChatRequestBody;
  try {
    body = await readChatRequest(request);
  } catch {
    return jsonError(400, 'Request body was not valid JSON');
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonError(400, '`messages` must be a non-empty array');
  }

  if (!env.key) return streamMock(messages);
  return proxyOpenRouter(request, env, messages);
}

/** No key: the kit's own mock, streamed frame by frame. THIS IS THE BUILDER'S
 *  ROUTE, verbatim but for the extracted `messages` argument and the
 *  `X-Kai-Mock` header — which is for a human reading a curl or a test
 *  asserting which mode ran. The CLIENT never reads it: branching there would
 *  put the seam back in the browser, the one thing this split exists to
 *  prevent. */
function streamMock(messages: OpenAIWireMessage[]): Response {
  // The responder cycles its replies whatever you send, so the prompt is a
  // courtesy — but the body is still read exactly the way a real route reads
  // it, so swapping the mock for the provider below changes nothing upstream
  // of this file. The client posts the WHOLE thread (toOpenAIMessages of the
  // conversation), so a rehydrated conversation arrives here with its full
  // history and a real provider would see all of it.
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const prompt = last && typeof last.content === 'string' ? last.content : '';

  // One line so the dev console shows the history actually reached the route —
  // the mock ignores it, a real provider would not.
  console.log(`[api/chat] ${messages.length} message(s) in thread; last user prompt: ${JSON.stringify(prompt)}`);

  // createMockResponder() yields COMPLETE OpenAI chat-completions SSE frames,
  // so this route only writes them out verbatim. No framing is built here; the
  // browser parses them with readOpenAIStream from @kitn.ai/ui/wire, exactly as
  // it would a real route's response. Every frame is marked as a mock (a
  // ': kai-mock' banner, a _kai_mock field, model 'kai-mock', zero usage).
  const encoder = new TextEncoder();
  let open = true;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const frame of mockResponse(prompt)) {
        // The browser hangs up when the user asks a new question mid-answer;
        // stop producing frames rather than writing into a cancelled stream.
        if (!open) return;
        controller.enqueue(encoder.encode(frame));
      }
      controller.close();
    },
    cancel() {
      open = false;
    },
  });

  return new Response(body, { status: 200, headers: sseHeaders({ 'X-Kai-Mock': '1' }) });
}

/** Key present: forward the turn to OpenRouter and pipe its SSE back untouched.
 *  Every integration template in the kit's catalog does exactly this. The
 *  request's own abort signal (wired to socket close in vite-chat-api.ts) rides
 *  along, so a browser that hangs up also hangs up on the provider. */
async function proxyOpenRouter(
  request: Request,
  env: ChatEnv,
  messages: OpenAIWireMessage[],
): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.key}`,
        'HTTP-Referer': 'http://localhost:5180',
        'X-Title': '@kitn.ai/ui chat workspace',
      },
      body: JSON.stringify({
        model: env.model,
        stream: true,
        max_tokens: env.maxTokens,
        messages,
      }),
      signal: request.signal,
    });
  } catch (error) {
    // Deliberately does not echo the request: it carries the Authorization header.
    return jsonError(502, `OpenRouter call failed: ${errorText(error)}`);
  }

  if (!upstream.ok || !upstream.body) {
    // The provider's own error body passes through unchanged — STATUS included,
    // which is what lets the app show what actually went wrong instead of a
    // generic failure (readOpenAIStream throws a WireError on a non-ok status).
    return new Response(await upstream.text().catch(() => ''), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  // Re-wrap rather than hand upstream.body over directly, so a mid-stream
  // provider failure is reported IN BAND the way OpenRouter itself reports one
  // (headers are long gone by then). `readOpenAIStream` surfaces the frame as
  // ModelTurn.error rather than a WireError.
  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              error: { code: 'proxy_stream_error', message: errorText(error) },
              choices: [{ delta: {}, finish_reason: 'error' }],
            })}\n\n`,
          ),
        );
      } finally {
        await reader.cancel().catch(() => undefined);
        controller.close();
      }
    },
    async cancel() {
      await reader.cancel().catch(() => undefined);
    },
  });

  return new Response(body, {
    status: 200,
    headers: sseHeaders({
      'Content-Type': upstream.headers.get('content-type') ?? 'text/event-stream; charset=utf-8',
    }),
  });
}

function sseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    // no-transform stops a proxy buffering the stream into one blob.
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...extra,
  };
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** Error text with no chance of leaking the request (and therefore the key). */
function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

// vite-chat-api.ts imports it from here.
export { chatHandler };
