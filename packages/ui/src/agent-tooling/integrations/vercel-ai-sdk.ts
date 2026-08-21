import type { Integration } from '../types';

const vercelAiSdk: Integration = {
  id: 'vercel-ai-sdk',
  title: 'Vercel AI SDK',
  category: 'framework',
  language: 'ts',
  streamFormat: 'ai-sdk',
  envVars: ['AI_GATEWAY_API_KEY'],
  // No per-framework templates: the handler below is web-standard, so the
  // scaffolder wraps it in the target framework's own route declaration.
  routeTemplates: {},
  webRoute: `import { dynamicTool, jsonSchema, streamText } from 'ai';
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

// Next.js only: add \`export const maxDuration = 30\` to the route file to allow
// long streaming responses. It is a Next route-segment config, not part of the
// handler, so it lives in the file rather than in here.

/**
 * The model, PINNED — and deliberately NOT read off the request body.
 *
 * Change THIS LINE to change the model; it is the only place one is named. The
 * AI Gateway takes a \`creator/model-name\` string, so any id it routes works
 * here without touching another import.
 *
 * Why it is not forwarded from the client, unlike the openai / openrouter /
 * anthropic routes:
 *
 *   · Those three POST to ONE host with ONE id space, so the scaffold can seed a
 *     valid default. The Gateway is a router across every vendor's id space at
 *     once, so there is no default that is right for it — only one vendor's guess
 *     baked into a provider-agnostic template.
 *   · A forwarded model id on a \`needs-proxy\` route is a spend lever handed to
 *     anything that can POST here, and the Gateway bills per token per model.
 *
 * WHY THIS ID. It is the one this route has actually been driven against live —
 * text, a single tool call and a multi-round tool loop, through the Gateway —
 * and, unlike a frontier default, it ANSWERS ON A FREE GATEWAY ACCOUNT. A paid
 * id fails a first \`npm run dev\` with
 * \`Free tier users do not have access to this model\`, which reads as a broken
 * scaffold rather than as a billing setting. It also supports tools and
 * reasoning, so the two things this route re-frames are reachable by default,
 * and it is cheaper than gpt-4o by roughly two orders of magnitude.
 */
const MODEL = 'openai/gpt-oss-120b';

/**
 * One attachment to an AI SDK FilePart.
 *
 * \`data\` takes the BARE shorthand — a base64 string, or a URL object for a
 * remote file — rather than the newer tagged \`{ type: 'data' | 'url' }\` form.
 * Both are accepted by the installed SDK; the shorthand is also what AI SDK v5
 * and v6 accept, so this route keeps compiling if the app pins an older \`ai\`.
 *
 * Images arrive as \`image_url\` and become FileParts too. \`ImagePart\` still
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
 *  \`unknown[]\`. Declared as this integration's \`clientToolFormat\`. */
type OpenAIFunctionTool = {
  function?: { name?: string; description?: string; parameters?: unknown };
};

/**
 * OpenAI function schemas -> the AI SDK's own ToolSet.
 *
 * \`dynamicTool\` is the helper for a schema known only at RUNTIME. The ordinary
 * \`tool()\` infers its input type from a Zod schema written in the route, which
 * a list arriving in the request body cannot have.
 *
 * NO \`execute\`, deliberately. A tool the SDK can run makes the ROUTE the loop
 * owner: streamText would call it, feed the result back and answer in a single
 * response, so the tool call would never reach the browser and \`<kai-tool>\`
 * would have nothing to render. Without \`execute\` the SDK emits the call and
 * stops, which is the contract the kit's front end already implements — run the
 * tool, \`applyToolOutput\`, POST the thread again.
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

async function chatHandler(request: Request): Promise<Response> {
  let chatBody: ChatRequestBody;
  try {
    chatBody = await readChatRequest(request);
  } catch (error) {
    return toChatErrorResponse(error);
  }
  const { messages, tools } = chatBody;
  const toolSet = toToolSet(tools);
  const prompt = toModelMessages(messages);

  // THE SYSTEM TURN DOES NOT GO IN \`messages\`, and this is the one that costs a
  // live run to find. \`SystemModelMessage\` is still part of the \`ModelMessage\`
  // union, so a system entry in this array TYPECHECKS — and then \`ai\` v7's
  // \`standardizePrompt\` throws \`InvalidPromptError: System messages are not
  // allowed in the prompt or messages fields. Use the instructions option
  // instead.\` The kit's own encoder puts the system prompt at \`messages[0]\`, so
  // that is every single turn of a scaffolded app, not an edge case.
  //
  // Hoisted rather than joined into a string: \`instructions\` takes the message
  // array, so several system turns keep their order and their count.
  //
  // On \`ai\` v5/v6 there is no \`instructions\` option and a system message in
  // \`messages\` is correct — drop this split and pass \`prompt\` straight through
  // if you pin an older SDK.
  const instructions = prompt.filter((m): m is SystemModelMessage => m.role === 'system');
  const conversation = prompt.filter((m) => m.role !== 'system');

  // \`streamText\` is not awaited: it returns synchronously and does its work as
  // the stream is iterated. Prompt validation is part of that work, so an
  // invalid prompt surfaces from \`for await (… of result.fullStream)\` below
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
  // How many argument characters a call streamed. \`tool-call\` re-sends the whole
  // input at the end, so emitting it unconditionally would DOUBLE the arguments
  // of every call that streamed — and skipping it unconditionally would empty
  // the arguments of any provider that does not stream them. Neither is safe to
  // assume, so the decision is made per call from what actually arrived.
  const streamedArgs = new Map<string, number>();

  const sse = new ReadableStream({
    async start(controller) {
      const send = (chunk: unknown): void => {
        controller.enqueue(encoder.encode(\`data: \${JSON.stringify(chunk)}\\n\\n\`));
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
              // Only when nothing streamed: see \`streamedArgs\`.
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
            // \`reasoning_tokens\` is the number that proves thinking happened even
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
            // and is dropped. \`source\` is the one worth knowing about: map it to
            // \`delta.annotations[].url_citation\` if your model cites its sources.
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
      controller.enqueue(encoder.encode('data: [DONE]\\n\\n'));
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
}`,
  streamMapping:
    "The Vercel AI SDK's toUIMessageStreamResponse() and toTextStreamResponse() don't emit OpenAI-format SSE, so the route re-frames the stream itself and readOpenAIStream from @kitn.ai/ui/wire parses it exactly as it does every other integration. Iterate result.fullStream, NOT result.textStream: textStream carries text deltas only, so a route built on it emits a plain answer however the model replied and drops every tool call and every reasoning block silently. fullStream yields typed parts: text-delta.text -> delta.content, reasoning-delta.text -> delta.reasoning, tool-input-start plus its tool-input-delta fragments -> delta.tool_calls, finish -> finish_reason plus a usage frame, error -> an in-band {error:{message}}. Two traps. (1) OpenAI correlates tool-call fragments by their POSITION in the tool_calls array and the SDK only ever gives an id, so the route keeps an id -> index map; passing anything else through as the index splices one call's arguments into another. (2) fullStream sends the complete input AGAIN on the tool-call part after streaming it in fragments, so emitting both doubles the arguments — the route tracks how much each call streamed and emits the tool-call part only for a provider that streamed none. Parts with no OpenAI spelling (text-start/end, tool-input-end, step boundaries, raw) are dropped; source parts have one — delta.annotations[].url_citation — and are left unmapped because the SDK's Source union carries document sources a url_citation cannot express. On the REQUEST side the trap that only a live run finds: ai v7 REFUSES a system message inside `messages` (InvalidPromptError, 'Use the instructions option instead') even though SystemModelMessage is still in the ModelMessage union and therefore typechecks — and the kit's encoder puts the system prompt at messages[0], so that is every turn. Hoist system turns into `instructions` and pass the rest as `messages`. That failure arrives from ITERATING fullStream, not from the streamText() call — streamText returns synchronously and validates as the stream is read — so the in-band catch around the loop is what reports it, and it reaches the browser as an error frame rather than as a 500.",
  runNote:
    "Set AI_GATEWAY_API_KEY for the AI Gateway (string model id form: creator/model-name). The route pins `const MODEL = 'openai/gpt-oss-120b'` — one line, at the top, and any id the Gateway routes works in it. That id is pinned because it answers on a FREE Gateway account: most ids (deepseek/*, meta/*, anthropic/*) return `Free tier users do not have access to this model` or a free-tier rate limit until the account has paid credits, which looks like a broken scaffold rather than a billing setting. For direct provider access, import its provider package (e.g. @ai-sdk/openai) and set the corresponding key (e.g. OPENAI_API_KEY). The tools the front end posts become `dynamicTool`s with NO `execute`, which is what keeps the tool loop in the app: the SDK emits the call and stops, the app runs it, renders it in <kai-tool> and posts the thread back. Give a tool an `execute` and the SDK runs the whole loop server-side, so nothing reaches the browser but the final sentence.",
  docsSlug: 'integrations/vercel-ai-sdk',
  // `tools` only. `model` is deliberately NOT forwarded — the route pins it in
  // one named const, and see that const's comment for why the Gateway is the one
  // host where a client-supplied id has no correct default. The catalog check
  // agrees from the other direction: `every integration that forwards a model
  // emits one valid for the host it POSTs to` reads the host off the route's own
  // fetch(), and this route makes no fetch call at all — the SDK owns the
  // transport — so a forwarded model here could not be validated against
  // anything.
  forwardsFromClient: ['tools'],
  // 'openai': the ROUTE's request contract, not the SDK's own. `toToolSet` reads
  // `raw.function.name` / `.function.parameters` off each entry — the OpenAI
  // function-calling envelope — and rebuilds it as a `dynamicTool` with a
  // `jsonSchema()` input. Sending the SDK's own tool shape from the client would
  // leave `.function` undefined and every tool would arrive nameless.
  clientToolFormat: 'openai',
  // `ai` only. A direct provider (e.g. @ai-sdk/openai) is the alternative path
  // described in runNote, not what this route imports, so it is not listed: the
  // rule is what the emitted code actually imports.
  deps: { npm: ['ai'], pip: [] },
  // Grep the route for a key and you find NOTHING — no header, no process.env.
  // The AI SDK reads AI_GATEWAY_API_KEY out of the environment itself, inside
  // streamText(). This is the case that makes inference from route source
  // unsafe and the declaration necessary; `envVars` is what the schema's safety
  // net can still see.
  keyExposure: 'needs-proxy',
  // The AI Gateway is a remote HTTPS endpoint reached through the `ai` package,
  // which is an ordinary npm dependency (see `deps`). Nothing to start.
  outOfBand: 'none',
};

export default vercelAiSdk;
