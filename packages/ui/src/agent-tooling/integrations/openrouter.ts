import type { Integration } from '../types';

const openrouter: Integration = {
  id: 'openrouter',
  title: 'OpenRouter',
  category: 'gateway',
  language: 'ts',
  streamFormat: 'openai-sse',
  envVars: ['OPENROUTER_API_KEY'],
  // No per-framework templates: the handler below is web-standard, so the
  // scaffolder wraps it in whatever the target framework routes with. This used
  // to be a `next`-only entry that every other framework inherited verbatim.
  routeTemplates: {},
  webRoute: `async function chatHandler(request: Request): Promise<Response> {
  // tools is undefined unless the front end sent one; JSON.stringify drops it,
  // so the same handler serves a tool archetype and a plain chat.
  const { model, messages, tools } = await readChatRequest(request);

  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${process.env.OPENROUTER_API_KEY}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, tools, stream: true }),
  });

  // FORWARD THE STATUS. Returning 200 here is how a missing key turns into
  // silence: the 401 body is JSON, it goes out labelled text/event-stream, the
  // SSE reader finds no frame, and the turn resolves empty with nothing logged
  // and no bubble. With the status intact readOpenAIStream throws a WireError
  // carrying the provider's own message.
  if (!upstream.ok) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      },
    });
  }
  if (!upstream.body) {
    return new Response(JSON.stringify({ error: { message: 'The provider returned no body to stream.' } }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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
    'OpenRouter returns OpenAI-format SSE. Pipe upstream.body straight to the browser; readOpenAIStream from @kitn.ai/ui/wire parses it, including tool calls and reasoning.',
  runNote: 'Set OPENROUTER_API_KEY. Model ids are vendor/model, e.g. openai/gpt-4o.',
  docsSlug: 'integrations/connect-any-model',
  // The route forwards both, so a scaffold's editable consts reach the gateway.
  forwardsFromClient: ['model', 'tools'],
};

export default openrouter;
