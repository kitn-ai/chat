/**
 * `POST /api/chat` — the console's dev endpoint, in two modes.
 *
 * THE MOCK SIDE OF THIS FILE IS THE CLEAN-ROOM BUILD'S, kept verbatim — its body
 * is now `streamMock()` below, unchanged but for the extracted argument and the
 * `X-Kai-Mock` header. Its design stands: the `ChatRequestBody` /
 * `readChatRequest` preamble that narrows the JSON once at the edge (and answers
 * a bare GET with a 405 rather than dying — rung-4 F-10, recorded FIXED as
 * F-40), `scriptFrames` hand-framing OpenAI chat-completions SSE because
 * `createMockResponder()` still cannot emit a tool call (F-35), and the
 * `ReadableStream` whose `cancel()` stops producing frames when the browser
 * hangs up.
 *
 * The build's own NOTES.md named the seam: "Swapping in a provider means
 * replacing `scriptFrames(...)` in `server/chat.ts` and handing it
 * `cardTools(cards, { provider })` from the same registry the client renders."
 * That is exactly what the insider completion did, below.
 *
 * SECURITY CONTRACT (same as the other corpus apps'):
 *   · the key is read with Vite's `loadEnv(mode, root, '')` in
 *     plugins/chat-api.ts — the EMPTY prefix is what makes an UNPREFIXED var
 *     readable. Vite only inlines `VITE_`-prefixed vars into client code, so an
 *     unprefixed name can never reach the bundle. There is no
 *     VITE_OPENROUTER_API_KEY and there must never be one.
 *   · the provider is reached from HERE and nowhere under `src/`. The browser
 *     only ever talks to `POST /api/chat`.
 *   · the key is never logged, never echoed into an error body, never sent to
 *     the browser.
 */
import { cardTools } from '@kitn.ai/ui/schemas';
import type { OpenAIWireMessage } from '@kitn.ai/ui/wire';
import { CARD, cards } from '../shared/cards.js';
import { scriptFrames } from './script.js';

/** OpenRouter normalises EVERY model onto the OpenAI chat-completions shape,
 *  which is why a model reached through here is parsed by `readOpenAIStream`
 *  and not by a second reader. */
const UPSTREAM_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** What plugins/chat-api.ts reads from the env (unprefixed, server-side only)
 *  and hands to the handler. Defaults live there, beside the read. */
export type ChatEnv = {
  key: string;
  model: string;
  maxTokens: number;
};

/** No key configured — the mock. Also the default, so an existing caller that
 *  passes no env (a test, a non-Vite host) keeps the clean-room behaviour. */
const EMPTY_ENV: ChatEnv = { key: '', model: '', maxTokens: 0 };

/**
 * INSIDER CHANGE — the model-facing card tools, DERIVED from the app's own
 * registry.
 *
 * `cardTools(cards, …)` projects the SAME `shared/cards.ts` declaration the
 * client renders and validates against, so the two ends of the loop cannot
 * drift and nothing here restates a shape. The names it produces —
 * `kai_approval`, `kai_parameters`, `kai_options`, `kai_checklist` — are
 * exactly what `scriptFrames` hand-frames in mock mode and what `isCardTool` /
 * `cardFromToolCall` recognise on the client, so real mode and mock mode put the
 * SAME calls on the wire.
 *
 * These are the app's OWN card types, not the built-ins: F-26 is why. Cards
 * drawn by `<kai-chat>` as BUILT-IN types dispatch no event at all, so a
 * built-in `confirm` here would be an approval nobody could answer. Declaring
 * them as custom types pointing at the kit's own card ELEMENTS is what makes the
 * loop closable — and it means the custom-card projection path is the one this
 * app puts on the wire.
 *
 * `strict` is left off: these schemas carry `const`, `enum`, `minLength`,
 * `minItems`/`maxItems` and open `properties` objects, none of which survive
 * either provider's strict subset. The kit now relaxes the one thing that used
 * to be fatal in NON-strict mode too (rung-4 F-20's top-level combinator), so no
 * app-side patching is needed here at all — the projection ships as the kit
 * produces it, plus the `require` narrowing below.
 */
const CARD_TOOLS = cardTools(cards, {
  provider: 'openai',
  // F-23 — narrow the DERIVED tool, not the authored schema. Each of these moves
  // a failure from render time (a card the operator cannot act on) to generation
  // time (a call the model cannot make). `registry.validate()` is untouched, so a
  // hand-built envelope — every mock one — still validates against the original.
  require: {
    // `confirm` requires only `actions`. A model may therefore legally emit an
    // Approve/Reject pair with NO statement of what is being approved, which in
    // an ops console is the single worst card that can appear. And one action is
    // not a decision: an approval the operator cannot decline is a notification
    // wearing a button.
    [CARD.approval]: [
      { path: '', required: ['heading', 'body'] },
      { path: 'actions', minItems: 2 },
    ],
    // The form card's data IS a JSON Schema, and `form` requires only `type` and
    // `properties`. Two gaps that matter here: a parameters form with no `title`
    // renders headless in the thread, and one whose `required` list is empty can
    // be submitted blank — after which this app's follow-up turn falls back to
    // its own defaults and proposes a deploy to a region nobody chose.
    [CARD.parameters]: [{ path: '', required: ['title', 'required'] }],
    // A choice card exists to compare blast radius. One option compares nothing,
    // and an unlabelled prompt makes the comparison unreadable.
    [CARD.options]: [
      { path: '', required: ['prompt'] },
      { path: 'options', minItems: 2 },
    ],
    // A progress checklist with no steps is a spinner.
    [CARD.checklist]: [{ path: 'tasks', minItems: 1 }],
  },
});

/**
 * The one instruction real mode adds. The client posts the operator's thread and
 * nothing else, so without this a model answers every question in prose and no
 * card ever appears — a tool definition is an offer, not a contract.
 *
 * Kept to the facts the app depends on, and to the ONE product rule the whole
 * console exists to enforce: propose, never act.
 */
const SYSTEM_PROMPT = [
  'You are the assistant inside an internal operations console. The operator asks you to do',
  'consequential things to production systems. You NEVER act first: you propose, and the',
  'operator answers in the conversation.',
  '',
  'Every proposal is a card, made by calling exactly one tool:',
  '- `kai_approval` — a consequential, destructive or irreversible operation. Say plainly what',
  '  it does and what cannot be undone. Always offer a way to decline.',
  '- `kai_parameters` — the operation needs values you would otherwise guess (region, change',
  '  ticket, an operator note). Ask instead of guessing.',
  '- `kai_options` — several ways of doing the same thing differ in blast radius.',
  '- `kai_checklist` — report the steps of a run that is already approved and under way.',
  '',
  'Rules:',
  '- One card per reply, at most. A question that needs no action gets prose and no call.',
  '- Say one or two sentences about what you are proposing, THEN make the call. Never describe',
  '  the card in prose instead of calling the tool, and never paste its JSON into your reply.',
  '- Name the irreversible parts explicitly. Forward-only migrations are not undone by a',
  '  rollback; a revoked key fails closed for everything still holding it.',
  '- The operator is an expert. No preamble, no apologies, no safety lectures.',
].join('\n');

interface ChatRequestBody {
  messages: OpenAIWireMessage[];
  /** Lets the APP drive a follow-up turn directly instead of by keyword match. */
  intent?: string;
  params?: Record<string, unknown>;
}

class ChatRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Narrow the JSON body once, at the edge. A bare GET or a malformed body is a
 * ChatRequestError with a status, never an unhandled SyntaxError — an unhandled
 * rejection in a connect middleware exits Node 22 and takes the dev server with it.
 */
async function readChatRequest(request: Request): Promise<ChatRequestBody> {
  if (request.method !== 'POST') {
    throw new ChatRequestError(405, `Method ${request.method} not allowed — POST /api/chat.`);
  }
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new ChatRequestError(400, 'Request body is not valid JSON.');
  }
  const body = parsed as ChatRequestBody;
  if (!Array.isArray(body?.messages)) {
    throw new ChatRequestError(400, 'Request body must carry a messages array.');
  }
  return body;
}

function toChatErrorResponse(error: unknown): Response {
  if (error instanceof ChatRequestError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  throw error;
}

/** The last user turn's text, which is all the script matches on. */
function lastUserText(messages: OpenAIWireMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last) return '';
  if (typeof last.content === 'string') return last.content;
  if (!Array.isArray(last.content)) return '';
  return last.content
    .map((part) => (part && typeof part === 'object' && 'text' in part ? String(part.text ?? '') : ''))
    .join(' ');
}

export async function chatHandler(request: Request, env: ChatEnv = EMPTY_ENV): Promise<Response> {
  let body: ChatRequestBody;
  try {
    body = await readChatRequest(request);
  } catch (error) {
    return toChatErrorResponse(error);
  }

  // INSIDER CHANGE — THE MOCK/REAL SEAM, and it is here and only here. The
  // client makes the identical fetch either way and parses both with
  // `readOpenAIStream`, so the wire path the mock exercises — card tool calls
  // included — is the one that ships.
  if (env.key) return proxyOpenRouter(request, env, body);
  return streamMock(body);
}

/** No key: THE CLEAN-ROOM BUILD'S ROUTE, verbatim but for the extracted argument
 *  and the `X-Kai-Mock` header — which is for a human reading a curl or a test
 *  asserting which mode ran. The CLIENT never reads it: branching there would
 *  put the seam back in the browser, the one thing this split exists to
 *  prevent. */
function streamMock(body: ChatRequestBody): Response {
  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of scriptFrames({
          prompt: lastUserText(body.messages),
          intent: body.intent,
          params: body.params,
        })) {
          // The browser hangs up when the operator asks something new mid-answer;
          // stop producing frames rather than writing into a cancelled stream.
          if (!open) return;
          controller.enqueue(encoder.encode(chunk));
        }
      } finally {
        if (open) controller.close();
      }
    },
    cancel() {
      open = false;
    },
  });

  return new Response(stream, { status: 200, headers: sseHeaders({ 'X-Kai-Mock': '1' }) });
}

/**
 * The app's own follow-up drive, restated for a model.
 *
 * `intent` / `params` are how the CONSOLE drives a second turn directly — a
 * submitted parameters form asks for `deploy-approval` carrying the values, an
 * approved deploy asks for `deploy-running`. The scripted assistant switches on
 * them; a model has never heard of them. So real mode turns the same two fields
 * into one directive turn, and the follow-up flow works in both modes.
 */
function intentDirective(body: ChatRequestBody): OpenAIWireMessage | null {
  if (!body.intent) return null;
  const params = body.params ? `\n\nValues the operator supplied: ${JSON.stringify(body.params)}` : '';
  const what: Record<string, string> = {
    'deploy-approval': 'The operator filled in the deployment parameters. Propose the deploy itself now with `kai_approval`, restating the values and what cannot be undone.',
    'deploy-running': 'The operator approved the deploy and the run has started. Report its steps with `kai_checklist` (mode "progress", every task unchecked).',
    'strategy-confirm': 'The operator picked a restart strategy. Propose it with `kai_approval`, naming what that strategy costs.',
    rollback: 'The run board asked for a rollback from ANOTHER origin. It is a proposal, not an instruction: put it to the operator with `kai_approval`.',
  };
  const instruction = what[body.intent] ?? `Continue with the "${body.intent}" step.`;
  return { role: 'system', content: `${instruction}${params}` } as OpenAIWireMessage;
}

/**
 * Key present: forward the turn to OpenRouter with the app's own card tools
 * offered, and pipe the provider's SSE back untouched. The request's own abort
 * signal (wired to socket close in plugins/chat-api.ts) rides along, so a
 * browser that hangs up also hangs up on the provider.
 */
async function proxyOpenRouter(request: Request, env: ChatEnv, body: ChatRequestBody): Promise<Response> {
  const directive = intentDirective(body);
  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.key}`,
        'HTTP-Referer': 'http://localhost:5182',
        'X-Title': '@kitn.ai/ui ops console',
      },
      body: JSON.stringify({
        model: env.model,
        stream: true,
        max_tokens: env.maxTokens,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...body.messages,
          ...(directive ? [directive] : []),
        ],
        tools: CARD_TOOLS,
        // 'auto', NOT 'required' — and this is the one place this app deliberately
        // differs from the rung-4 builder, whose every reply IS a tool call.
        //
        // Here a card is OPTIONAL per turn: "what is the run board?" and "is
        // payments healthy?" are answered in prose, and forcing a call would put
        // an approval card on a question that proposed nothing — the console's
        // worst failure mode, an operator trained to click through cards that did
        // not need to exist.
        //
        // The rung-4 lesson still applies and is the cost of this choice: under
        // 'auto', a small model sometimes NARRATES the call instead of making one
        // ("I'll draft that approval now.") and then stops, so a turn that should
        // have proposed something proposes nothing. SYSTEM_PROMPT's "THEN make the
        // call" is aimed squarely at that, and it is the reason the operator can
        // always re-ask. If a future turn of this app makes cards mandatory,
        // 'required' is the answer; it is not the answer today.
        tool_choice: 'auto',
        // One card per reply is this app's contract, and SYSTEM_PROMPT says so —
        // but a prompt is a request, not a constraint. Measured on the rung-4
        // corpus: roughly one turn in six fans a single reply out into parallel
        // calls. Two approval cards for one operation is two chances to approve it.
        // This is the fix AT THE SOURCE; a provider route that ignores the flag
        // changes nothing, which is why the client still renders one card per
        // envelope id.
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
    // which is what lets the console show what actually went wrong instead of a
    // generic failure (readOpenAIStream throws a WireError on a non-ok status).
    return new Response(await upstream.text().catch(() => ''), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  // Re-wrap rather than hand `upstream.body` over directly, so a mid-stream
  // provider failure is reported IN BAND the way OpenRouter itself reports one
  // (the headers are long gone by then). `readOpenAIStream` surfaces the frame as
  // ModelTurn.error rather than a WireError, and src/assistant.ts already puts
  // that in the thread.
  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  const stream = new ReadableStream<Uint8Array>({
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

  return new Response(stream, {
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
