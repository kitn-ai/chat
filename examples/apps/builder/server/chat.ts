/**
 * The dev-server half of the page builder: `POST /api/chat`, in two modes.
 *
 * THE MOCK SIDE OF THIS FILE IS THE FRONT-DOOR BUILDER'S, kept verbatim — its
 * body is now `streamMock()` below, unchanged but for the extracted arguments
 * and the `X-Kai-Mock` header. Its design stands: the
 * `ChatRequestBody`/`readChatRequest` preamble that narrows the JSON once at the
 * edge, `mockTurn` (the kit's `createMockResponder()` for the words plus a
 * hand-framed `kai_artifact` tool call for the page — see F-05 for why the
 * second half had to be hand-framed), and the `ReadableStream` whose `cancel()`
 * stops producing frames when the browser hangs up.
 *
 * The insider completion added the request guards (F-10) and the OpenRouter seam
 * below, mirroring examples/apps/workspace/server/chat.ts.
 *
 * SECURITY CONTRACT (same as the other corpus apps'):
 *   · the key is read with Vite's `loadEnv(mode, root, '')` in vite-chat-api.ts —
 *     the EMPTY prefix is what makes an UNPREFIXED var readable. Vite only
 *     inlines `VITE_`-prefixed vars into client code, so an unprefixed name can
 *     never reach the bundle. There is no VITE_OPENROUTER_API_KEY and there
 *     must never be one.
 *   · the provider is reached from HERE and nowhere under `src/`. The browser
 *     only ever talks to `POST /api/chat`.
 *   · the key is never logged, never echoed into an error body, never sent to
 *     the browser.
 *
 * THE MOCK/REAL SEAM IS HERE, AND ONLY HERE. The client makes the identical
 * fetch either way and parses both with `readOpenAIStream`, so the wire path the
 * mock exercises — tool call included — is the one that ships.
 */
import { MOCK_BANNER } from '@kitn.ai/ui/state';
import { cardSchemas, cardTools } from '@kitn.ai/ui/schemas';
import type { OpenAIWireMessage } from '@kitn.ai/ui/wire';

import { mockTurn } from './mock-stream.js';

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

/** Announced once per server process, for the human reading the terminal. */
console.info(`[kai] ${MOCK_BANNER.slice(2)}`);

// INSIDER CHANGE — the model-facing artifact tool, DERIVED from the kit.
//
// `cardTools` projects the card schema the client already validates against
// into a provider tool definition, so the two ends of the loop cannot drift and
// nothing here restates a shape. The name it produces is `kai_artifact`, which
// is exactly what the mock hand-frames and what `isCardTool` /
// `cardFromToolCall` recognise on the client — so real mode and mock mode put
// the SAME call on the wire.
//
// Only `artifact` is offered. `page-version` is this app's own compact card and
// is minted by the HOST from the arriving artifact (src/cards.ts says so); the
// model is never asked for it. The app's registry is not imported here on
// purpose: src/cards.ts pulls in `page-version-card.ts`, a DOM custom element,
// which has no business in a Node process.
//
// `strict` is left off: the artifact schema uses `maxLength`, `format: "uri"`,
// `minimum`, `maxItems` and `oneOf`, none of which survive either provider's
// strict subset — `cardTools(..., { strict: true })` throws and names them.
const ARTIFACT_TOOLS = cardTools({ artifact: cardSchemas.artifact }, { provider: 'openai' }).map(
  (tool) => ({
    ...tool,
    function: { ...tool.function, parameters: demandFileCode(providerSafe(tool.function.parameters)) },
  }),
);

/**
 * INSIDER CHANGE — a NEW gap, found by this app's first real turn, proposed as
 * F-20 for the rung-4 findings.
 *
 * `cardTools(..., { provider: 'openai' })` on the artifact card emits the
 * schema's TOP-LEVEL `anyOf` (`[{required:['src']},{required:['files']}]` — one
 * of the two must be present). Both OpenAI and Anthropic reject that outright,
 * in NON-STRICT mode, before the model ever runs:
 *
 *   OpenAI:    "Invalid schema for function 'kai_artifact': schema must have
 *               type 'object' and not have 'oneOf'/'anyOf'/'allOf'/'enum'/
 *               'const'/'not' at the top level"  (HTTP 400)
 *   Anthropic: "tools.0.custom.input_schema: input_schema does not support
 *               oneOf, allOf, or anyOf at the top level"  (HTTP 400, every
 *               OpenRouter provider route: Anthropic, Bedrock, Google, Azure)
 *
 * Google/Gemini accepts it (verified, HTTP 200). So the kit's own claim that
 * non-strict "is currently the only working mode" (tool-defs.ts) does not hold
 * for the artifact card on the two largest providers, and `strict: false` is
 * exactly the mode this app needs. The strict-subset checker in
 * `provider-subsets.ts` would catch it — but only under `strict: true`, which
 * throws for every built-in card for unrelated reasons, so nobody runs it.
 *
 * The fix is the app's, not the kit's, and it is deliberately narrow: drop the
 * top-level combinator and say the same thing in the description, where a model
 * reads it anyway. Everything else — every property, every type, the
 * description — stays DERIVED from the kit's schema. Nothing is restated here.
 */
function providerSafe(parameters: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const { anyOf, oneOf, allOf, ...rest } = parameters as Record<string, unknown>;
  if (!anyOf && !oneOf && !allOf) return rest;
  const note = 'Supply `files` (and optionally `src`); at least one of the two is required.';
  const description = typeof rest.description === 'string' ? `${rest.description}\n\n${note}` : note;
  return { ...rest, description };
}

/**
 * INSIDER CHANGE — found by the DeepSeek acceptance run, and the reason this app
 * can offer a cheap model at all.
 *
 * The kit's artifact card requires only `path` of each file; `code` is optional,
 * and its own description says "Omit for binary files (image/pdf), which have no
 * code view." That is exactly right for the CARD — an artifact may legitimately
 * be a PDF — and exactly wrong for THIS app, whose entire product is the code.
 *
 * `deepseek/deepseek-v4-flash-0731` reads the schema literally and takes the
 * cheap path: five of six turns came back with a perfectly valid, perfectly
 * useless call —
 *
 *   {"files":[{"path":"index.html","language":"html","type":"html",
 *              "additions":100,"status":"added"}]}
 *
 * — file metadata and no file. Nothing downstream can recover a document from
 * that, and SYSTEM_PROMPT already asked for it in prose, which is evidently not
 * where a small model looks. Raw SSE: w7-evidence/ds-t2-{1,3,4,5,6}.sse.
 *
 * So the app narrows the DERIVED schema instead of restating it: `code` joins
 * `path` in the file's own `required`, and `files` gets a floor of one entry.
 * Every property, type and description still comes from the kit. A model that
 * cannot omit the document stops omitting it.
 */
function demandFileCode(parameters: Record<string, unknown>): Record<string, unknown> {
  const properties = parameters.properties as Record<string, unknown> | undefined;
  const files = properties?.files as Record<string, unknown> | undefined;
  const items = files?.items as Record<string, unknown> | undefined;
  if (!properties || !files || !items) return parameters;
  const required = Array.isArray(items.required) ? (items.required as string[]) : [];
  return {
    ...parameters,
    properties: {
      ...properties,
      files: { ...files, minItems: 1, items: { ...items, required: [...new Set([...required, 'code'])] } },
    },
  };
}

// The one instruction real mode adds. The client posts the user's prompt
// lineage and nothing else, so without this a model answers in prose and no
// version ever appears — the tool definition alone is an offer, not a contract.
// Kept to the facts the app depends on: one call, one complete document, in
// `files[0].code`, which is what `takeToolCall` reads.
const SYSTEM_PROMPT = [
  'You are a page builder. Every reply builds ONE complete, self-contained HTML document',
  'and delivers it by calling the `kai_artifact` tool exactly once.',
  '',
  'Rules:',
  '- The document is a full page: <!doctype html>, <html>, <head> with a <title>, <body>.',
  '- All CSS goes in one <style> in the head. No external stylesheets, fonts, scripts or images;',
  '  the page is framed in a sandboxed iframe with no network origin of its own.',
  '- Put the document in `files[0].code`, with `path: "index.html"`, `language: "html"`, `type: "html"`.',
  '- The user\'s messages are the prompt lineage, oldest first: the last one is the change to apply',
  '  to the page the earlier ones describe. Rebuild the WHOLE page each time, applying every one.',
  '- Say one or two sentences about what you built or changed, then make the call. Never paste the',
  '  HTML into your prose; it belongs in the tool call.',
  '- Call the tool ONCE. One reply builds one page; a second call is discarded.',
  '- `code` is the document itself, not a quoted string: write real line breaks. Never write the',
  '  two characters backslash-n where a newline belongs — they render as visible text on the page.',
].join('\n');

/** What the front end POSTs. `request.json()` is `unknown`, so narrow it once. */
type ChatRequestBody = {
  messages: OpenAIWireMessage[];
  /** This app's own field: how many versions the client already holds. */
  versionCount?: number;
};

async function readChatRequest(request: Request): Promise<ChatRequestBody> {
  return (await request.json()) as ChatRequestBody;
}

/** A wire message's content is a string, or content parts on an attachment turn. */
function textOf(message: OpenAIWireMessage): string {
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join(' ')
      .trim();
  }
  return '';
}

export async function chatHandler(request: Request, env: ChatEnv): Promise<Response> {
  // INSIDER CHANGE (F-10) — the request-guard trio. The builder's route had
  // none: a `GET /api/chat` reached `request.json()`, threw, and took the dev
  // server down with it. A malformed body did the same. Decide loudly, and stay
  // alive.
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

  if (!env.key) return streamMock(messages, body.versionCount);
  return proxyOpenRouter(request, env, messages);
}

/** No key: THE BUILDER'S ROUTE, verbatim but for the extracted arguments and the
 *  `X-Kai-Mock` header — which is for a human reading a curl or a test
 *  asserting which mode ran. The CLIENT never reads it: branching there would
 *  put the seam back in the browser, the one thing this split exists to
 *  prevent. */
function streamMock(messages: OpenAIWireMessage[], versionCount: number | undefined): Response {
  const prompts = messages.filter((m) => m.role === 'user').map(textOf).filter(Boolean);

  const encoder = new TextEncoder();
  let open = true;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const f of mockTurn({ prompts, versionCount: versionCount ?? Math.max(0, prompts.length - 1) })) {
          // The browser hangs up when the user asks a new question mid-answer;
          // stop producing frames rather than writing into a cancelled stream.
          if (!open) return;
          controller.enqueue(encoder.encode(f));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      open = false;
    },
  });

  return new Response(body, { status: 200, headers: sseHeaders({ 'X-Kai-Mock': '1' }) });
}

/** Key present: forward the turn to OpenRouter, with the kit's artifact tool
 *  offered, and pipe the provider's SSE back untouched. The request's own abort
 *  signal (wired to socket close in vite-chat-api.ts) rides along, so a browser
 *  that hangs up also hangs up on the provider. */
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
        'HTTP-Referer': 'http://localhost:5181',
        'X-Title': '@kitn.ai/ui page builder',
      },
      body: JSON.stringify({
        model: env.model,
        stream: true,
        max_tokens: env.maxTokens,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        tools: ARTIFACT_TOOLS,
        // NOT 'auto'. Under 'auto', `openai/gpt-4o-mini` intermittently narrates
        // the call instead of making one — "Now I will provide the complete HTML
        // document. Calling the tool now." — and then stops (`finish_reason:
        // "stop"`, zero tool calls), so the turn produced no version at all. Seen
        // in a browser session and in w7-evidence/t2-16.sse.
        //
        // 'required' is not a workaround, it is this app's contract stated on the
        // wire: SYSTEM_PROMPT's first line is "Every reply builds ONE complete,
        // self-contained HTML document", exactly one tool is offered, and a reply
        // that builds no page has nowhere to go. The prose still streams; the
        // model simply cannot end the turn without the call.
        tool_choice: 'required',
        // One page per turn is this app's contract, and SYSTEM_PROMPT says so —
        // but a prompt is a request, not a constraint. Measured on
        // `openai/gpt-4o-mini`, roughly one turn in six fans the SAME reply out
        // into two or three PARALLEL `kai_artifact` calls carrying byte-identical
        // (or near-identical, equally damaged) documents; the app then minted a
        // version per call. See w7-evidence/t2-8, t2-14, t2-19.
        //
        // This is the fix AT THE SOURCE. It is a request-level flag, so a
        // provider route that ignores it changes nothing — which is why the
        // client keeps its own one-version-per-turn policy in App.tsx as well.
        parallel_tool_calls: false,
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
