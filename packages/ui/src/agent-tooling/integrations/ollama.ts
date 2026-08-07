import type { Integration } from '../types';

const ollama: Integration = {
  id: 'ollama',
  title: 'Ollama',
  category: 'provider',
  language: 'ts',
  streamFormat: 'openai-sse',
  envVars: [],
  routeTemplates: {
    next: `// app/api/chat/route.ts — proxy the browser to local Ollama
export async function POST(req: Request) {
  const { messages } = await req.json();

  const upstream = await fetch('http://localhost:11434/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama3.2', messages, stream: true }),
  });

  // Ollama returns OpenAI-format SSE — stream it straight to the browser.
  return new Response(upstream.body, { headers: { 'Content-Type': 'text/event-stream' } });
}`,
    html: `<kai-chat id="chat"></kai-chat>

<script type="module">
  import '@kitn.ai/ui/elements';
  const chat = document.getElementById('chat');

  chat.addEventListener('kai-submit', async (e) => {
    const history = [...chat.messages, { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: e.detail.value }] }];
    chat.messages = [...history, { id: crypto.randomUUID(), role: 'assistant', parts: [] }];
    await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The route (and Ollama's OpenAI-compatible endpoint) speak flat
      // { role, content } pairs, so reduce each message's parts to text.
      body: JSON.stringify({
        messages: history.map((m) => ({
          role: m.role,
          content: m.parts.map((p) => (p.type === 'text' ? p.text : '')).join(''),
        })),
      }),
    });
    // stream the reply into the last message — see the Streaming recipe
  });
</script>`,
  },
  streamMapping: "Ollama's OpenAI-compatible endpoint (http://localhost:11434/v1/chat/completions) returns OpenAI-format SSE — pipe upstream.body straight to the browser; kai-chat's reader handles it. No API key needed; pass any string if a client requires one (Ollama ignores it).",
  runNote: 'No API key required. Run: ollama serve (starts on 127.0.0.1:11434), then ollama pull <model>. For browser-direct access, set OLLAMA_ORIGINS to allow the page origin; restart Ollama after any env change.',
  docsSlug: 'integrations/ollama',
};

export default ollama;
