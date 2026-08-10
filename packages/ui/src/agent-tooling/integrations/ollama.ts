import type { Integration } from '../types';

const ollama: Integration = {
  id: 'ollama',
  title: 'Ollama',
  category: 'provider',
  language: 'ts',
  streamFormat: 'openai-sse',
  envVars: [],
  routeTemplates: {
    next: `// app/api/chat/route.ts: proxy the browser to local Ollama
export async function POST(req: Request) {
  // The model is pinned here, not sent by the browser. tools IS forwarded:
  // it is undefined unless the front end declared any, and JSON.stringify
  // drops it, so the same route serves a tool archetype and a plain chat.
  const { messages, tools } = await req.json();

  const upstream = await fetch('http://localhost:11434/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama3.2', messages, tools, stream: true }),
  });

  // Ollama returns OpenAI-format SSE. Stream it straight to the browser.
  return new Response(upstream.body, { headers: { 'Content-Type': 'text/event-stream' } });
}`,
  },
  // No `html` entry on purpose. routeTemplates keyed by 'html' would be selected
  // as the BACKEND ROUTE for framework: 'html', and this integration's used to be
  // a second <kai-chat id="chat"> plus a second kai-submit listener: pasting both
  // blocks gave you a duplicate id and two fetches per submit. The front-end block
  // already emits that wiring, and chooseRoute now refuses an 'html' key outright.
  streamMapping:
    "Ollama's OpenAI-compatible endpoint (http://localhost:11434/v1/chat/completions) returns OpenAI-format SSE. Pipe upstream.body straight to the browser; readOpenAIStream from @kitn.ai/ui/wire parses it, including tool calls and reasoning. No API key needed; pass any string if a client requires one (Ollama ignores it).",
  runNote: 'No API key required. Run: ollama serve (starts on 127.0.0.1:11434), then ollama pull <model>. For browser-direct access, set OLLAMA_ORIGINS to allow the page origin; restart Ollama after any env change.',
  docsSlug: 'integrations/ollama',
  // No 'model': the route pins llama3.2, so a front-end model const would be an
  // editable value the route throws away. Change the model in the route. 'tools'
  // IS forwarded, which is what lets an agentic scaffold fill its kai-tool panel.
  forwardsFromClient: ['tools'],
};

export default ollama;
