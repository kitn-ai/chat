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
  const { messages } = await req.json();

  const upstream = await fetch('http://localhost:11434/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama3.2', messages, stream: true }),
  });

  // Ollama returns OpenAI-format SSE. Stream it straight to the browser.
  return new Response(upstream.body, { headers: { 'Content-Type': 'text/event-stream' } });
}`,
    html: `<kai-chat id="chat"></kai-chat>

<script type="module">
  import '@kitn.ai/ui/elements';
  import { createAssistantStream } from '@kitn.ai/ui/state';
  import { readOpenAIStream, toOpenAIMessages } from '@kitn.ai/ui/wire';
  const chat = document.getElementById('chat');

  chat.addEventListener('kai-submit', async (e) => {
    const history = [...chat.messages, { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: e.detail.value }] }];
    chat.messages = history;
    // toOpenAIMessages encodes parts into the { role, content, tool_calls } shape
    // Ollama's OpenAI-compatible endpoint expects, keeping tool calls and results.
    const stream = createAssistantStream((fn) => { chat.messages = fn(chat.messages); });
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: toOpenAIMessages(history) }),
      });
      await readOpenAIStream(res, stream);
    } finally {
      stream.done();
    }
  });
</script>`,
  },
  streamMapping:
    "Ollama's OpenAI-compatible endpoint (http://localhost:11434/v1/chat/completions) returns OpenAI-format SSE. Pipe upstream.body straight to the browser; readOpenAIStream from @kitn.ai/ui/wire parses it, including tool calls and reasoning. No API key needed; pass any string if a client requires one (Ollama ignores it).",
  runNote: 'No API key required. Run: ollama serve (starts on 127.0.0.1:11434), then ollama pull <model>. For browser-direct access, set OLLAMA_ORIGINS to allow the page origin; restart Ollama after any env change.',
  docsSlug: 'integrations/ollama',
};

export default ollama;
