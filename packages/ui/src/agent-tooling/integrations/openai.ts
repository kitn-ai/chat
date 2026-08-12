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
  // Both model and tools come from the browser. \`tools\` is undefined unless the
  // front end declared any, and JSON.stringify drops it, so the same handler
  // serves a tool archetype and a plain chat.
  const { model, messages, tools } = await readChatRequest(request);

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${process.env.OPENAI_API_KEY}\`,
      'Content-Type': 'application/json',
    },
    // Model ids here carry NO vendor prefix: 'gpt-4o-mini', never
    // 'openai/gpt-4o-mini' — the prefixed form is an OpenRouter slug and this
    // host answers it with a 404. The front end's \`model\` const is the one to
    // edit; it is seeded from CLIENT_MODEL_IDS.openai.
    body: JSON.stringify({ model, messages, tools, stream: true }),
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
  // 'model' was withheld until scaffold.ts could seed it correctly: the shared
  // fallback is 'openai/gpt-4o-mini', an OpenRouter slug that api.openai.com
  // 404s, and shipping an editable const with a broken default is the exact
  // dead-const defect forwardsFromClient exists to prevent. CLIENT_MODEL_IDS now
  // carries a per-integration entry ('gpt-4o-mini'), so the const is real and the
  // route reads it. 'tools' is what lets an agentic scaffold fill its kai-tool
  // panel.
  forwardsFromClient: ['model', 'tools'],
  // The handler forwards `tools` unconverted to /v1/chat/completions — this IS
  // the OpenAI wire, so the client sends OpenAI's own function envelope.
  clientToolFormat: 'openai',
  // Nothing to install. The route is global `fetch` and imports no module at all.
  deps: { npm: [], pip: [] },
  // The route reads OPENAI_API_KEY and puts it in an `Authorization: Bearer`
  // header. A static bundle carrying that is a published key.
  keyExposure: 'needs-proxy',
  // A remote HTTPS endpoint and a key. Nothing to install, nothing to start.
  outOfBand: 'none',
};

export default openai;
