import type { Integration } from '../types';

const openai: Integration = {
  id: 'openai',
  title: 'OpenAI',
  category: 'provider',
  language: 'ts',
  streamFormat: 'openai-sse',
  envVars: ['OPENAI_API_KEY'],
  // No per-framework templates: the handler below is web-standard, so the
  // scaffolder wraps it in whatever the target framework routes with.
  routeTemplates: {},
  webRoute: `async function chatHandler(request: Request): Promise<Response> {
  // The model is pinned below, not sent by the browser. tools IS forwarded: it
  // is undefined unless the front end declared any, and JSON.stringify drops it,
  // so the same handler serves a tool archetype and a plain chat.
  const { messages, tools } = await readChatRequest(request);

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${process.env.OPENAI_API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages, tools, stream: true }),
  });

  // FORWARD THE STATUS. Returning 200 here is how a missing key turns into
  // silence: the 401 body is JSON, it goes out labelled text/event-stream, the
  // SSE reader finds no frame, and the turn resolves empty with nothing logged
  // and no bubble. With the status intact readOpenAIStream throws a WireError
  // carrying OpenAI's own message, which is the most useful thing you can be
  // handed on a first run.
  if (!upstream.ok) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      },
    });
  }
  if (!upstream.body) {
    return new Response(JSON.stringify({ error: { message: 'OpenAI returned no body to stream.' } }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // OpenAI IS the format readOpenAIStream parses. Pass it straight through.
  return new Response(upstream.body, {
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
    "OpenAI's /v1/chat/completions is the reference OpenAI-format SSE stream — this is the one integration with no re-framing at all. Pipe upstream.body straight to the browser; readOpenAIStream from @kitn.ai/ui/wire parses it, including tool calls (delta.tool_calls) and reasoning (delta.reasoning on the reasoning models). Set stream_options: { include_usage: true } in the body if you want a final usage frame; readOpenAIStream reads prompt_tokens/completion_tokens off it.",
  runNote:
    "Set OPENAI_API_KEY (platform.openai.com). Model ids have NO vendor prefix: 'gpt-4o-mini', not 'openai/gpt-4o-mini' — the prefixed form is an OpenRouter slug and api.openai.com answers it with a 404. Change the pinned model in the route.",
  docsSlug: 'integrations/connect-any-model',
  // 'tools' only, and the omission of 'model' is deliberate rather than an
  // oversight. The scaffolder's shared default for a forwarded model is
  // 'openai/gpt-4o-mini' (CLIENT_MODEL_IDS in mcp/tools/scaffold.ts), which is
  // an OpenRouter slug: api.openai.com 404s it. Emitting an editable const that
  // ships a broken default is the exact dead-const defect forwardsFromClient was
  // added to kill, so the model stays pinned in the route until scaffold.ts
  // carries a correct per-integration default. 'tools' IS forwarded, which is
  // what lets an agentic scaffold fill its kai-tool panel.
  forwardsFromClient: ['tools'],
};

export default openai;
