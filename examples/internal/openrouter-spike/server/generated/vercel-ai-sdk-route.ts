// GENERATED — DO NOT EDIT. Run `pnpm gateway:route` (or any `conformance:gateway*`
// script, which runs it first) to regenerate.
//
// Source: the `vercel-ai-sdk` integration's `webRoute`, wrapped by the scaffolder's
// `next` adapter — i.e. byte for byte what `kai` scaffold hands a consumer.
// It is committed so the code this spike drove live is readable without running
// anything; harness/emit-gateway-route.mjs explains why it is generated at all.
// app/api/chat/route.ts
import type { OpenAIWireMessage } from '@kitn.ai/ui/wire';

import { dynamicTool, jsonSchema, streamText } from 'ai';
import type {
  AssistantContent,
  FilePart,
  JSONSchema7,
  ModelMessage,
  SystemModelMessage,
  ToolResultPart,
  ToolSet,
  UserContent,
} from 'ai';

// Next.js only: add `export const maxDuration = 30` to the route file to allow
// long streaming responses. It is a Next route-segment config, not part of the
// handler, so it lives in the file rather than in here.

/**
 * The model, PINNED — and deliberately NOT read off the request body.
 *
 * Change THIS LINE to change the model; it is the only place one is named. The
 * AI Gateway takes a `creator/model-name` string, so any id it routes works
 * here without touching another import.
 *
 * Why it is not forwarded from the client, unlike the openai / openrouter /
 * anthropic routes:
 *
 *   · Those three POST to ONE host with ONE id space, so the scaffold can seed a
 *     valid default. The Gateway is a router across every vendor's id space at
 *     once, so there is no default that is right for it — only one vendor's guess
 *     baked into a provider-agnostic template.
 *   · A forwarded model id on a `needs-proxy` route is a spend lever handed to
 *     anything that can POST here, and the Gateway bills per token per model.
 *
 * WHY THIS ID. It is the one this route has actually been driven against live —
 * text, a single tool call and a multi-round tool loop, through the Gateway —
 * and, unlike a frontier default, it ANSWERS ON A FREE GATEWAY ACCOUNT. A paid
 * id fails a first `npm run dev` with
 * `Free tier users do not have access to this model`, which reads as a broken
 * scaffold rather than as a billing setting. It also supports tools and
 * reasoning, so the two things this route re-frames are reachable by default,
 * and it is cheaper than gpt-4o by roughly two orders of magnitude.
 */
const MODEL = 'openai/gpt-oss-120b';

/**
 * One attachment to an AI SDK FilePart.
 *
 * `data` takes the BARE shorthand — a base64 string, or a URL object for a
 * remote file — rather than the newer tagged `{ type: 'data' | 'url' }` form.
 * Both are accepted by the installed SDK; the shorthand is also what AI SDK v5
 * and v6 accept, so this route keeps compiling if the app pins an older `ai`.
 *
 * Images arrive as `image_url` and become FileParts too. `ImagePart` still
 * exists but is deprecated in favour of exactly this.
 */
function toFilePart(part: Extract<WirePart, { kind: 'file' }>): FilePart {
  return {
    type: 'file',
    mediaType: part.mediaType,
    ...(part.filename === undefined ? {} : { filename: part.filename }),
    data: part.source.type === 'data' ? part.source.data : new URL(part.source.url),
  };
}

// The kit's wire format is OpenAI-shaped (tool_calls on the assistant message,
// a flat content string on the tool message). The AI SDK's ModelMessage is not:
// a tool call is a CONTENT PART on the assistant message, and a tool result is a
// tagged output union, not a bare string. Converting rather than casting is the
// point — a cast would compile but hand the SDK the wrong shape at runtime.
function toModelMessages(messages: ChatRequestBody['messages']): ModelMessage[] {
  return messages.map((message): ModelMessage => {
    switch (message.role) {
      // A system prompt is text-only on every wire, so the array form collapses.
      case 'system':
        return { role: 'system', content: wireText(message.content) };
      case 'user': {
        const parts = wireParts(message.content);
        // Plain string for an ordinary turn: identical to what this route sent
        // before attachments existed, and the shape the SDK docs lead with.
        if (parts.every((p) => p.kind === 'text')) {
          return { role: 'user', content: wireText(message.content) };
        }
        const content: UserContent = parts.map((p) =>
          p.kind === 'text' ? { type: 'text' as const, text: p.text } : toFilePart(p),
        );
        return { role: 'user', content };
      }
      case 'tool': {
        const result: ToolResultPart = {
          type: 'tool-result',
          toolCallId: message.tool_call_id ?? '',
          toolName: message.name ?? '',
          output: { type: 'text', value: wireText(message.content) },
        };
        return { role: 'tool', content: [result] };
      }
      case 'assistant': {
        const text = wireText(message.content);
        if (!message.tool_calls?.length) return { role: 'assistant', content: text };
        const content: AssistantContent = [];
        if (text) content.push({ type: 'text', text });
        for (const call of message.tool_calls) {
          content.push({
            type: 'tool-call',
            toolCallId: call.id,
            toolName: call.function.name,
            input: JSON.parse(call.function.arguments),
          });
        }
        return { role: 'assistant', content };
      }
    }
  });
}

/** The OpenAI function-calling envelope the front end sends, narrowed from
 *  `unknown[]`. Declared as this integration's `clientToolFormat`. */
type OpenAIFunctionTool = {
  function?: { name?: string; description?: string; parameters?: unknown };
};

/**
 * OpenAI function schemas -> the AI SDK's own ToolSet.
 *
 * `dynamicTool` is the helper for a schema known only at RUNTIME. The ordinary
 * `tool()` infers its input type from a Zod schema written in the route, which
 * a list arriving in the request body cannot have.
 *
 * NO `execute`, deliberately. A tool the SDK can run makes the ROUTE the loop
 * owner: streamText would call it, feed the result back and answer in a single
 * response, so the tool call would never reach the browser and `<kai-tool>`
 * would have nothing to render. Without `execute` the SDK emits the call and
 * stops, which is the contract the kit's front end already implements — run the
 * tool, `applyToolOutput`, POST the thread again.
 */
function toToolSet(tools: ChatRequestBody['tools']): ToolSet | undefined {
  if (!tools?.length) return undefined;
  const out: ToolSet = {};
  for (const raw of tools) {
    const fn = (raw as OpenAIFunctionTool).function;
    if (!fn?.name) continue;
    out[fn.name] = dynamicTool({
      description: fn.description ?? '',
      inputSchema: jsonSchema((fn.parameters as JSONSchema7 | undefined) ?? { type: 'object' }),
    });
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** AI SDK finish reasons -> OpenAI's spelling. They agree on 'stop', 'length'
 *  and 'error' and disagree on the other two, and readOpenAIStream's table reads
 *  OpenAI's — so an unmapped 'tool-calls' normalises to 'other' and the turn
 *  stops saying why it stopped. */
const FINISH_REASONS: Record<string, string> = {
  'tool-calls': 'tool_calls',
  'content-filter': 'content_filter',
};

/**
 * What the front end POSTs. `request.json()` is `unknown` (it is whatever the
 * client sent), so the body is narrowed once here instead of at every use —
 * without it this route does not compile under a server tsconfig. Widen it as
 * you add fields of your own.
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

/** Where an attachment's bytes are: inline base64, or an address the PROVIDER
 *  fetches. Never both. */
type WireFileSource = { type: 'data'; data: string } | { type: 'url'; url: string };

/** One piece of a turn, with the string and array content forms flattened into
 *  a single shape. */
type WirePart =
  | { kind: 'text'; text: string }
  | { kind: 'file'; mediaType: string; filename?: string; source: WireFileSource };

const DATA_URI = /^data:([^;,]+);base64,([\s\S]*)$/;

/**
 * Flatten a wire message's content into parts.
 *
 * An image sent by URL has no media type here — `image_url` carries only the
 * address — so it reports the top-level segment `'image'`, which is all a URL
 * source needs. Only images can reach that branch: the kit refuses to encode a
 * remote PDF rather than guess at one.
 */
function wireParts(content: OpenAIWireMessage['content']): WirePart[] {
  if (content == null) return [];
  if (typeof content === 'string') return content === '' ? [] : [{ kind: 'text', text: content }];
  return content.map((part): WirePart => {
    if (part.type === 'text') return { kind: 'text', text: part.text };
    if (part.type === 'image_url') {
      const asData = DATA_URI.exec(part.image_url.url);
      return asData
        ? { kind: 'file', mediaType: asData[1], source: { type: 'data', data: asData[2] } }
        : { kind: 'file', mediaType: 'image', source: { type: 'url', url: part.image_url.url } };
    }
    const asData = DATA_URI.exec(part.file.file_data);
    if (!asData) {
      // LOUD on purpose. `file_data` is a data URI on this wire; anything else
      // cannot be turned into bytes without fetching it, and forwarding a turn
      // with the attachment quietly missing is the bug this whole path exists
      // to prevent.
      throw new Error(
        'Unsupported file content part: file_data must be a data: URI of the form data:<media type>;base64,<data>.',
      );
    }
    return {
      kind: 'file',
      mediaType: asData[1],
      filename: part.file.filename,
      source: { type: 'data', data: asData[2] },
    };
  });
}

/** Just the text of a turn. System, assistant and tool messages are text-only
 *  on this wire, so this collapses the array form for them. */
function wireText(content: OpenAIWireMessage['content']): string {
  return wireParts(content)
    .map((p) => (p.kind === 'text' ? p.text : ''))
    .join('');
}

async function chatHandler(request: Request): Promise<Response> {
  const { messages, tools } = await readChatRequest(request);
  const toolSet = toToolSet(tools);
  const prompt = toModelMessages(messages);

  // THE SYSTEM TURN DOES NOT GO IN `messages`, and this is the one that costs a
  // live run to find. `SystemModelMessage` is still part of the `ModelMessage`
  // union, so a system entry in this array TYPECHECKS — and then `ai` v7's
  // `standardizePrompt` throws `InvalidPromptError: System messages are not
  // allowed in the prompt or messages fields. Use the instructions option
  // instead.` The kit's own encoder puts the system prompt at `messages[0]`, so
  // that is every single turn of a scaffolded app, not an edge case.
  //
  // Hoisted rather than joined into a string: `instructions` takes the message
  // array, so several system turns keep their order and their count.
  //
  // On `ai` v5/v6 there is no `instructions` option and a system message in
  // `messages` is correct — drop this split and pass `prompt` straight through
  // if you pin an older SDK.
  const instructions = prompt.filter((m): m is SystemModelMessage => m.role === 'system');
  const conversation = prompt.filter((m) => m.role !== 'system');

  // `streamText` is not awaited: it returns synchronously and does its work as
  // the stream is iterated. Prompt validation is part of that work, so an
  // invalid prompt surfaces from `for await (… of result.fullStream)` below
  // rather than from this line — which is why the catch that reports it lives
  // in the stream and not around this call. Confirmed by observation: a rejected
  // prompt reached the browser as an in-band error frame, not as a 500.
  const result = streamText({
    model: MODEL, // AI Gateway id; needs AI_GATEWAY_API_KEY
    ...(instructions.length > 0 ? { instructions } : {}),
    messages: conversation,
    ...(toolSet ? { tools: toolSet } : {}),
  });

  const encoder = new TextEncoder();

  // OpenAI correlates tool-call fragments by their POSITION in the tool_calls
  // array; the SDK identifies each call by id and never sends a position. So one
  // is derived from the other, in first-seen order, and every fragment of a call
  // carries the same number. Getting this wrong does not throw — the fragments
  // land on the wrong call and the arguments come out as spliced JSON.
  const toolIndex = new Map<string, number>();
  const indexOf = (id: string): number => {
    const known = toolIndex.get(id);
    if (known !== undefined) return known;
    const next = toolIndex.size;
    toolIndex.set(id, next);
    return next;
  };
  // How many argument characters a call streamed. `tool-call` re-sends the whole
  // input at the end, so emitting it unconditionally would DOUBLE the arguments
  // of every call that streamed — and skipping it unconditionally would empty
  // the arguments of any provider that does not stream them. Neither is safe to
  // assume, so the decision is made per call from what actually arrived.
  const streamedArgs = new Map<string, number>();

  const sse = new ReadableStream({
    async start(controller) {
      const send = (chunk: unknown): void => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      };
      try {
        // fullStream, NOT textStream. textStream is text deltas only: a tool call
        // or a reasoning block goes past it silently, so a route built on it
        // emits a plain answer and nothing else however the model replied.
        for await (const part of result.fullStream) {
          switch (part.type) {
            case 'text-delta':
              send({ choices: [{ delta: { content: part.text } }] });
              break;

            case 'reasoning-delta':
              send({ choices: [{ delta: { reasoning: part.text } }] });
              break;

            // The call is ANNOUNCED here, before its arguments exist, which is
            // what lets <kai-tool> open a panel with the tool's name in it while
            // the arguments are still being written.
            case 'tool-input-start':
              streamedArgs.set(part.id, 0);
              send({
                choices: [{
                  delta: {
                    tool_calls: [{
                      index: indexOf(part.id),
                      id: part.id,
                      type: 'function',
                      function: { name: part.toolName, arguments: '' },
                    }],
                  },
                }],
              });
              break;

            case 'tool-input-delta':
              streamedArgs.set(part.id, (streamedArgs.get(part.id) ?? 0) + part.delta.length);
              send({
                choices: [{
                  delta: { tool_calls: [{ index: indexOf(part.id), function: { arguments: part.delta } }] },
                }],
              });
              break;

            case 'tool-call':
              // Only when nothing streamed: see `streamedArgs`.
              if ((streamedArgs.get(part.toolCallId) ?? 0) === 0) {
                send({
                  choices: [{
                    delta: {
                      tool_calls: [{
                        index: indexOf(part.toolCallId),
                        id: part.toolCallId,
                        type: 'function',
                        function: {
                          name: part.toolName,
                          arguments: JSON.stringify(part.input ?? {}),
                        },
                      }],
                    },
                  }],
                });
              }
              break;

            // One frame carries both, the way chat-completions sends them.
            // `reasoning_tokens` is the number that proves thinking happened even
            // when the provider streamed no reasoning text.
            case 'finish':
              send({
                choices: [{
                  delta: {},
                  finish_reason: FINISH_REASONS[part.finishReason] ?? part.finishReason,
                }],
                usage: {
                  prompt_tokens: part.totalUsage.inputTokens,
                  completion_tokens: part.totalUsage.outputTokens,
                  total_tokens: part.totalUsage.totalTokens,
                  completion_tokens_details: {
                    reasoning_tokens: part.totalUsage.outputTokenDetails.reasoningTokens,
                  },
                },
              });
              break;

            // An error the SDK caught mid-stream. The status is long spent, so it
            // goes IN BAND like the catch below.
            case 'error':
              send({
                error: {
                  message: part.error instanceof Error ? part.error.message : String(part.error),
                },
              });
              break;

            // Everything else — text-start/end, tool-input-end, sources, files,
            // step boundaries, raw provider frames — has no OpenAI-wire spelling
            // and is dropped. `source` is the one worth knowing about: map it to
            // `delta.annotations[].url_citation` if your model cites its sources.
            default:
              break;
          }
        }
      } catch (err) {
        // The status is spent by the time the SDK fails — the headers went out
        // with the first byte — so report it IN BAND. readOpenAIStream lands
        // this on turn.error and keeps whatever streamed before it. Without it a
        // failed key is an empty bubble and nothing in the console.
        const message = err instanceof Error ? err.message : 'Model stream failed';
        send({ error: { message } });
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(sse, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform stops a proxy buffering the stream into one blob.
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

// Next.js App Router: the file exports the HTTP method.
export async function POST(req: Request): Promise<Response> {
  return chatHandler(req);
}
