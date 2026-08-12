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
  webRoute: `import { streamText } from 'ai';
import type { ModelMessage, AssistantContent, UserContent, FilePart, ToolResultPart } from 'ai';

// Next.js only: add \`export const maxDuration = 30\` to the route file to allow
// long streaming responses. It is a Next route-segment config, not part of the
// handler, so it lives in the file rather than in here.

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

async function chatHandler(request: Request): Promise<Response> {
  const { messages } = await readChatRequest(request);

  const result = streamText({
    model: 'openai/gpt-4o', // AI Gateway id; needs AI_GATEWAY_API_KEY
    messages: toModelMessages(messages),
  });

  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(controller) {
      try {
        for await (const delta of result.textStream) {
          const chunk = { choices: [{ delta: { content: delta } }] };
          controller.enqueue(encoder.encode(\`data: \${JSON.stringify(chunk)}\\n\\n\`));
        }
      } catch (err) {
        // The status is spent by the time the SDK fails — the headers went out
        // with the first byte — so report it IN BAND. readOpenAIStream lands
        // this on turn.error and keeps whatever streamed before it. Without it a
        // failed key is an empty bubble and nothing in the console.
        const message = err instanceof Error ? err.message : 'Model stream failed';
        controller.enqueue(encoder.encode(\`data: \${JSON.stringify({ error: { message } })}\\n\\n\`));
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
  streamMapping: "The Vercel AI SDK's toUIMessageStreamResponse() and toTextStreamResponse() don't emit OpenAI-format SSE. Wrap result.textStream manually: iterate text deltas and emit data: {choices:[{delta:{content}}]} frames, closing with data: [DONE]. readOpenAIStream from @kitn.ai/ui/wire parses tool calls and reasoning too, but textStream carries neither: it is text deltas only. Switch to result.fullStream, which yields typed parts, and re-frame its tool-call and reasoning parts onto delta.tool_calls and delta.reasoning to get them.",
  runNote: 'Set AI_GATEWAY_API_KEY for the AI Gateway (string model id form: creator/model-name). For direct provider access, import its provider package (e.g. @ai-sdk/openai) and set the corresponding key (e.g. OPENAI_API_KEY).',
  docsSlug: 'integrations/vercel-ai-sdk',
  // Nothing. The route pins model: 'openai/gpt-4o' in the streamText() call and
  // defines any tools there too, so neither belongs in the front end.
  forwardsFromClient: [],
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
