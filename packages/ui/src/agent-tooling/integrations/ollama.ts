import type { Integration } from '../types';

const ollama: Integration = {
  id: 'ollama',
  title: 'Ollama',
  category: 'provider',
  language: 'ts',
  streamFormat: 'openai-sse',
  envVars: [],
  // No per-framework templates. The handler below is web-standard, so the
  // scaffolder wraps it in the target framework's own route declaration.
  //
  // There was never an `html` entry and there must not be one: routeTemplates
  // keyed by 'html' are selected as the BACKEND ROUTE for framework: 'html', and
  // this integration's used to be a second <kai-chat id="chat"> plus a second
  // kai-submit listener, so pasting both blocks gave a duplicate id and two
  // fetches per submit. chooseRoute refuses an 'html' key outright.
  routeTemplates: {},
  webRoute: `async function chatHandler(request: Request): Promise<Response> {
  // The model is pinned here, not sent by the browser. tools IS forwarded:
  // it is undefined unless the front end declared any, and JSON.stringify
  // drops it, so the same handler serves a tool archetype and a plain chat.
  const { messages, tools } = await readChatRequest(request);

  const upstream = await fetch('http://localhost:11434/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama3.2', messages, tools, stream: true }),
  });

  // FORWARD THE STATUS. Returning 200 for a failed upstream is how "ollama is
  // not running" or "that model was never pulled" turns into silence: the error
  // body is JSON, it goes out labelled text/event-stream, the SSE reader finds
  // no frame, and the turn resolves empty with nothing logged and no bubble.
  if (!upstream.ok) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      },
    });
  }
  if (!upstream.body) {
    return new Response(JSON.stringify({ error: { message: 'Ollama returned no body to stream.' } }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Ollama returns OpenAI-format SSE. Stream it straight to the browser.
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
    "Ollama's OpenAI-compatible endpoint (http://localhost:11434/v1/chat/completions) returns OpenAI-format SSE. Pipe upstream.body straight to the browser; readOpenAIStream from @kitn.ai/ui/wire parses it, including tool calls and reasoning. No API key needed; pass any string if a client requires one (Ollama ignores it).",
  runNote: 'No API key required. Run: ollama serve (starts on 127.0.0.1:11434), then ollama pull <model>. For browser-direct access, set OLLAMA_ORIGINS to allow the page origin; restart Ollama after any env change.',
  docsSlug: 'integrations/ollama',
  // No 'model': the route pins llama3.2, so a front-end model const would be an
  // editable value the route throws away. Change the model in the route. 'tools'
  // IS forwarded, which is what lets an agentic scaffold fill its kai-tool panel.
  forwardsFromClient: ['tools'],
  // Ollama's OpenAI-compatible endpoint, and the handler forwards `tools`
  // verbatim into that body — so the client sends OpenAI's function envelope.
  clientToolFormat: 'openai',
};

export default ollama;
