import type { Integration } from '../types';

/**
 * Anthropic Messages, and NOT a copy of the OpenRouter route.
 *
 * Four constraints established by live testing and recorded in
 * docs/superpowers/HANDOFF-model-driven-components.md §4. Every one of them is a
 * 400 (or worse, a silent 200) if you port an OpenAI-shaped body over verbatim:
 *
 *   1. `system` is a TOP-LEVEL field. A `{ role: 'system' }` entry in `messages`
 *      is rejected.
 *   2. `tool_choice` is an OBJECT, never the bare string OpenAI accepts.
 *   3. `max_tokens` is REQUIRED. OpenAI defaults it; this API does not.
 *   4. Content blocks stream strictly sequentially and are indexed by CONTENT
 *      BLOCK, so a thinking block pushes a tool call from block 0 to block 1.
 *      OpenAI's `tool_calls[].index` counts TOOL CALLS, so the two indices are
 *      not the same number and passing one through as the other is the original
 *      Critical.
 *
 * The thinking constraint in that document has since MOVED, and the route says
 * so rather than repeating it: `budget_tokens` is not a tunable with a floor of
 * 1024 any more, it is REMOVED from the current models and returns a 400. See
 * the block comment beside `thinking` in the emitted body.
 */
const anthropic: Integration = {
  id: 'anthropic',
  title: 'Anthropic',
  category: 'provider',
  language: 'ts',
  // 'native': the Messages API streams its OWN SSE dialect (message_start,
  // content_block_delta, message_stop), not OpenAI's. The route re-frames it —
  // see `reframeToOpenAISse` and the note in streamMapping for why.
  streamFormat: 'native',
  envVars: ['ANTHROPIC_API_KEY'],
  // No per-framework templates: the handler below is web-standard, so the
  // scaffolder wraps it in whatever the target framework routes with.
  routeTemplates: {},
  webRoute: `/** One Anthropic content block. Open union on the wire; these are the four the
 *  scaffold's own thread can produce. */
type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string };

/** Anthropic messages carry ONLY 'user' and 'assistant'. There is no 'system'
 *  role here and no 'tool' role: a system prompt is a top-level field, and a
 *  tool RESULT rides on a user message. Both are handled in toAnthropicBody. */
type AnthropicMessage = { role: 'user' | 'assistant'; content: AnthropicBlock[] };

/** Anthropic calls the JSON Schema \`input_schema\`; OpenAI calls it
 *  \`parameters\`, and nests everything under \`function\`. Handing the OpenAI
 *  shape over unconverted is a 400. */
type AnthropicTool = { name: string; description?: string; input_schema: unknown };

/** The OpenAI tool shape the front end sends, narrowed from \`unknown[]\`. */
type OpenAIFunctionTool = {
  function?: { name?: string; description?: string; parameters?: unknown };
};

/** One decoded Messages-API SSE frame. Every field is optional because this is
 *  a provider-owned union and an unrecognised frame must be skipped, not throw. */
type AnthropicEvent = {
  type?: string;
  index?: number;
  content_block?: { type?: string; id?: string; name?: string };
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  error?: { message?: string };
};

/** Anthropic stop reasons -> OpenAI finish_reason. 'refusal' has no OpenAI
 *  equivalent and is reported in band instead (see the message_delta case). */
const FINISH_REASONS: Record<string, string> = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  max_tokens: 'length',
  tool_use: 'tool_calls',
};

function toAnthropicTools(tools: unknown[] | undefined): AnthropicTool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((raw) => {
    const fn = (raw as OpenAIFunctionTool).function ?? {};
    return {
      name: fn.name ?? '',
      description: fn.description,
      input_schema: fn.parameters ?? { type: 'object', properties: {} },
    };
  });
}

/**
 * The OpenAI-shaped thread the front end posts -> an Anthropic Messages body.
 *
 * \`system\` comes back SEPARATELY because it is a top-level request field here.
 * A \`{ role: 'system' }\` entry left in \`messages\` is a 400, and it is the most
 * common thing to get wrong when porting a route across.
 */
function toAnthropicBody(messages: ChatRequestBody['messages']): {
  system?: string;
  messages: AnthropicMessage[];
} {
  let system: string | undefined;
  const out: AnthropicMessage[] = [];

  // Append to the trailing user message when there is one. A tool result and the
  // user's next turn are one turn on this wire, and several Anthropic-compatible
  // proxies enforce strict alternation.
  const pushUser = (content: AnthropicBlock[]): void => {
    const last = out[out.length - 1];
    if (last?.role === 'user') last.content.push(...content);
    else out.push({ role: 'user', content });
  };

  for (const message of messages) {
    switch (message.role) {
      case 'system': {
        // TOP-LEVEL, not a message. Several system turns concatenate.
        const text = message.content ?? '';
        system = system === undefined ? text : \`\${system}\\n\\n\${text}\`;
        break;
      }
      case 'user': {
        if (message.content) pushUser([{ type: 'text', text: message.content }]);
        break;
      }
      case 'tool': {
        // A tool RESULT is a block on a USER message here, not a role of its own.
        pushUser([
          {
            type: 'tool_result',
            tool_use_id: message.tool_call_id ?? '',
            content: message.content ?? '',
          },
        ]);
        break;
      }
      case 'assistant': {
        const content: AnthropicBlock[] = [];
        if (message.content) content.push({ type: 'text', text: message.content });
        for (const call of message.tool_calls ?? []) {
          content.push({
            type: 'tool_use',
            id: call.id,
            name: call.function.name,
            // \`input\` is a parsed OBJECT here. OpenAI carries the same value as a
            // JSON STRING in \`function.arguments\`; forwarding the string is a 400.
            input: call.function.arguments ? JSON.parse(call.function.arguments) : {},
          });
        }
        // An assistant turn with nothing in it is not a legal message.
        if (content.length > 0) out.push({ role: 'assistant', content });
        break;
      }
    }
  }

  return { system, messages: out };
}

/**
 * Anthropic Messages SSE -> OpenAI-format SSE.
 *
 * WHY THIS EXISTS AT ALL: the front end reads with readOpenAIStream. Handing it
 * Anthropic frames does not throw — it parses to NOTHING, so the turn ends empty
 * with no error anywhere, which is the worst failure this kit has. Re-framing
 * here keeps the browser half of an anthropic scaffold identical to every other
 * integration's, the same way the cloudflare Worker route re-frames env.AI.
 *
 * The alternative, if you would rather keep the native frames: return
 * \`upstream.body\` untouched and read it with readAnthropicStream from
 * '@kitn.ai/ui/wire'. That is also the ONLY way to round-trip thinking blocks
 * verbatim (toAnthropicMessages echoes \`part.raw\` — a rebuilt block is a hard
 * 400), so it is the path to take the moment you enable thinking below.
 */
function reframeToOpenAISse(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  // THE INDEX TRAP. Anthropic's \`index\` counts CONTENT BLOCKS; OpenAI's
  // \`tool_calls[].index\` counts TOOL CALLS. A thinking or text block ahead of a
  // tool call shifts the block index, but the call is still tool call 0 — so the
  // block index is translated through this map rather than passed through.
  const toolIndexOfBlock = new Map<number, number>();
  let toolCount = 0;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: unknown): void => {
        controller.enqueue(encoder.encode(\`data: \${JSON.stringify(chunk)}\\n\\n\`));
      };
      const reader = body.getReader();
      let buffer = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // Split on \\n rather than readline: readline also breaks on the
          // Unicode separators U+2028/U+2029, which appear inside model output.
          const lines = buffer.split('\\n');
          buffer = lines.pop() ?? ''; // hold the partial line for the next chunk
          for (const line of lines) {
            const trimmed = line.trim();
            // \`event:\` lines are redundant — every frame's data carries \`type\`.
            if (!trimmed.startsWith('data:')) continue;
            let event: AnthropicEvent;
            try {
              event = JSON.parse(trimmed.slice(5)) as AnthropicEvent;
            } catch {
              continue; // skip a malformed frame rather than kill the turn
            }

            if (event.type === 'content_block_start') {
              const block = event.content_block;
              if (block?.type !== 'tool_use') continue;
              const index = toolCount;
              toolCount += 1;
              toolIndexOfBlock.set(event.index ?? 0, index);
              send({
                choices: [{
                  delta: {
                    tool_calls: [{
                      index,
                      id: block.id,
                      type: 'function',
                      function: { name: block.name, arguments: '' },
                    }],
                  },
                }],
              });
              continue;
            }

            if (event.type === 'content_block_delta') {
              const delta = event.delta;
              if (delta?.type === 'text_delta') {
                send({ choices: [{ delta: { content: delta.text } }] });
              } else if (delta?.type === 'thinking_delta') {
                send({ choices: [{ delta: { reasoning: delta.thinking } }] });
              } else if (delta?.type === 'input_json_delta') {
                const index = toolIndexOfBlock.get(event.index ?? 0);
                // No entry means these fragments belong to a block that is not a
                // tool_use. Dropping them beats inventing a tool call.
                if (index !== undefined) {
                  send({
                    choices: [{
                      delta: {
                        tool_calls: [{ index, function: { arguments: delta.partial_json } }],
                      },
                    }],
                  });
                }
              }
              continue;
            }

            if (event.type === 'message_delta') {
              const reason = event.delta?.stop_reason;
              if (!reason) continue;
              if (reason === 'refusal') {
                // A safety classifier declined. HTTP 200, no content, so without
                // this the turn just ends blank. Report it IN BAND:
                // readOpenAIStream lands it on turn.error.
                send({ error: { message: 'The model declined this request (stop_reason: refusal).' } });
                continue;
              }
              send({ choices: [{ delta: {}, finish_reason: FINISH_REASONS[reason] ?? 'stop' }] });
              continue;
            }

            if (event.type === 'error') {
              send({ error: { message: event.error?.message ?? 'Anthropic returned an error frame.' } });
            }
          }
        }
      } catch (err) {
        // The headers went out with the first byte, so the status is spent:
        // report IN BAND. readOpenAIStream lands this on turn.error and keeps
        // whatever already streamed.
        const message = err instanceof Error ? err.message : 'Anthropic stream failed';
        send({ error: { message } });
      }
      // Always: an unclosed stream leaves the browser waiting forever.
      controller.enqueue(encoder.encode('data: [DONE]\\n\\n'));
      controller.close();
    },
  });
}

async function chatHandler(request: Request): Promise<Response> {
  // Both model and tools come from the browser. \`tools\` arrives in OpenAI
  // function form and is converted to this API's shape below.
  const { model, messages, tools } = await readChatRequest(request);
  const { system, messages: anthropicMessages } = toAnthropicBody(messages);
  const anthropicTools = toAnthropicTools(tools);

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': \`\${process.env.ANTHROPIC_API_KEY}\`,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // Model ids here are Anthropic's own — 'claude-opus-5', 'claude-sonnet-5',
      // 'claude-haiku-4-5'. An OpenAI id or an OpenRouter 'vendor/model' slug is
      // a 404. The front end's \`model\` const is the one to edit; it is seeded
      // from CLIENT_MODEL_IDS.anthropic.
      model,
      // REQUIRED. OpenAI defaults it; this API 400s without it. It caps thinking
      // AND response text together, so raise it if you turn thinking on.
      max_tokens: 4096,
      // TOP-LEVEL, never a { role: 'system' } entry in \`messages\`.
      ...(system ? { system } : {}),
      messages: anthropicMessages,
      ...(anthropicTools ? { tools: anthropicTools } : {}),
      // tool_choice, if you set one, is an OBJECT: { type: 'auto' } |
      // { type: 'any' } | { type: 'tool', name: 'search' }. OpenAI's bare string
      // ('auto') is a 400 here.
      // tool_choice: { type: 'auto' },
      //
      // THINKING. The rules changed with the model generation, so check yours:
      //   · claude-opus-5 / sonnet-5 / opus-4.8 / opus-4.7 / fable-5 —
      //     \`budget_tokens\` is REMOVED and returns a 400. Use
      //     \`thinking: { type: 'adaptive', display: 'summarized' }\` plus
      //     \`output_config: { effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' }\`.
      //     On claude-opus-5 thinking is already ON by default; what is NOT on is
      //     \`display\`, which defaults to 'omitted' and streams thinking blocks
      //     with EMPTY text. That reads exactly like "this model has no reasoning
      //     mode" — a silent 200 with nothing in the panel — and it is the same
      //     shape of mistake as the budget bug below. Set display explicitly.
      //   · older models (claude-haiku-4-5, claude-sonnet-4-5) — still
      //     \`thinking: { type: 'enabled', budget_tokens: N }\`, with N >= 1024 and
      //     max_tokens STRICTLY GREATER than N. Deriving N as a fraction of a
      //     small max_tokens returns HTTP 200 with no thinking and no error.
      // Either way, once thinking is on a tool loop must echo every thinking
      // block back VERBATIM, which this route cannot do: it re-frames to OpenAI
      // SSE and the thread is re-encoded with toOpenAIMessages each round. Switch
      // to readAnthropicStream + toAnthropicMessages (both from '@kitn.ai/ui/wire')
      // and pass upstream.body through untouched before you enable it.
      stream: true,
    }),
  });

  // FORWARD THE STATUS. Returning 200 here is how a missing key turns into
  // silence: the 401 body is JSON, it goes out labelled text/event-stream, the
  // SSE reader finds no frame, and the turn resolves empty with nothing logged
  // and no bubble. With the status intact readOpenAIStream throws a WireError
  // carrying Anthropic's own message — which for this API is usually the exact
  // field you got wrong.
  if (!upstream.ok) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      },
    });
  }
  if (!upstream.body) {
    return new Response(JSON.stringify({ error: { message: 'Anthropic returned no body to stream.' } }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(reframeToOpenAISse(upstream.body), {
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
    "The Anthropic Messages API streams its OWN SSE dialect: message_start, content_block_start / content_block_delta / content_block_stop, message_delta, message_stop. It is NOT OpenAI-format, and feeding it to readOpenAIStream does not throw — it parses to nothing and the turn ends silently empty. The route therefore re-frames each frame to OpenAI form before it reaches the browser: text_delta -> delta.content, thinking_delta -> delta.reasoning, a tool_use content_block_start plus its input_json_delta fragments -> delta.tool_calls, message_delta.stop_reason -> finish_reason, an error frame -> an in-band {error:{message}}. readOpenAIStream from @kitn.ai/ui/wire then parses it exactly as it does every other integration. Anthropic indexes by CONTENT BLOCK while OpenAI's tool_calls[].index counts TOOL CALLS, so the route keeps a block-index -> tool-index map: a thinking block ahead of a tool call shifts the block index but not the tool index. Usage is the one thing not re-framed (input_tokens arrives on message_start and output_tokens on message_delta, so joining them needs state) — map both onto a {usage:{prompt_tokens,completion_tokens}} frame if you want token counts. To keep the native frames instead, return upstream.body untouched and read it with readAnthropicStream; that is also the only way to round-trip thinking blocks verbatim.",
  runNote:
    "Set ANTHROPIC_API_KEY (console.anthropic.com). The route pins claude-opus-5; claude-sonnet-5 and claude-haiku-4-5 are the cheaper swaps. Four things this API does NOT share with the OpenAI one, all of them 400s: system is a top-level field and not a message, max_tokens is required, tool_choice is an object ({ type: 'auto' }) and not a string, and tool schemas use input_schema rather than function.parameters. Extended thinking: on claude-opus-5 and the other current models budget_tokens is REMOVED (400) — use thinking: { type: 'adaptive', display: 'summarized' } with output_config.effort, and note that display defaults to 'omitted', which streams empty thinking blocks that look exactly like no reasoning at all. On older models (claude-haiku-4-5, claude-sonnet-4-5) budget_tokens still applies and must be >= 1024 with max_tokens strictly greater.",
  docsSlug: 'integrations/connect-any-model',
  // 'model' was withheld until scaffold.ts could seed it correctly: the shared
  // fallback is 'openai/gpt-4o-mini', which api.anthropic.com rejects outright,
  // and shipping an editable const with a broken default is the dead-const defect
  // forwardsFromClient exists to prevent. CLIENT_MODEL_IDS now carries a real
  // Anthropic id, so the const is live and the route reads it.
  forwardsFromClient: ['model', 'tools'],
  // 'openai', NOT 'anthropic' — and this is the counter-intuitive one, so read
  // `toAnthropicTools` above before changing it. This route CONVERTS the array
  // server-side: it reads `raw.function.name` and `raw.function.parameters` off
  // each entry, i.e. the OpenAI envelope, and rebuilds it as
  // `{ name, description, input_schema }`. Sending Anthropic's own shape from the
  // client would leave `.function` undefined, so every tool would go upstream
  // with a blank name and an empty schema. The envelope belongs to the ROUTE's
  // request contract, not to the provider it happens to POST to — which is
  // exactly why this is declared here rather than derived from `streamFormat`.
  clientToolFormat: 'openai',
  // Nothing to install. The route hand-rolls the Messages API over global
  // `fetch` and its own re-framer, so it imports no module — not even
  // @anthropic-ai/sdk.
  deps: { npm: [], pip: [] },
  // The route reads ANTHROPIC_API_KEY into an `x-api-key` header. Note the
  // header is NOT `Authorization`, which is why the schema's detector matches
  // both spellings.
  keyExposure: 'needs-proxy',
};

export default anthropic;
