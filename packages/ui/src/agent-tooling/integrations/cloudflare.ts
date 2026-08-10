import type { Integration } from '../types';

const cloudflare: Integration = {
  id: 'cloudflare',
  title: 'Cloudflare AI',
  category: 'provider',
  language: 'ts',
  streamFormat: 'openai-sse',
  envVars: ['CF_ACCOUNT_ID', 'CF_API_TOKEN'],
  routeTemplates: {
    // Kept as a framework-specific template because it cannot be expressed as a
    // portable handler: `env.AI` is a Worker binding, and only a Worker has one.
    // Everything else uses `webRoute` below.
    worker: `// Worker handler: env.AI is bound in wrangler.toml
// env.AI.run emits Cloudflare-native SSE (data: {"response":"<token>"}).
// The TransformStream below re-frames each chunk to OpenAI-format SSE so
// readOpenAIStream reads it without any client-side changes.
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { messages } = await req.json();

    const nativeStream = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages,
      stream: true,
    });

    // Re-frame Cloudflare-native SSE → OpenAI-format SSE
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    (async () => {
      const reader = (nativeStream as ReadableStream<Uint8Array>).getReader();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const s = line.trim();
          if (!s.startsWith('data:')) continue;
          const payload = s.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const { response } = JSON.parse(payload) as { response?: string };
            if (response == null) continue;
            const openaiChunk = JSON.stringify({ choices: [{ delta: { content: response } }] });
            await writer.write(encoder.encode(\`data: \${openaiChunk}\\n\\n\`));
          } catch { /* skip malformed lines */ }
        }
      }
      await writer.write(encoder.encode('data: [DONE]\\n\\n'));
      await writer.close();
    })();

    return new Response(readable, { headers: { 'Content-Type': 'text/event-stream' } });
  },
};`,
  },
  webRoute: `async function chatHandler(request: Request): Promise<Response> {
  // Proxy Workers AI over its OpenAI-compatible HTTP endpoint, token server-side.
  const { messages } = await request.json();

  const upstream = await fetch(
    \`https://api.cloudflare.com/client/v4/accounts/\${process.env.CF_ACCOUNT_ID}/ai/v1/chat/completions\`,
    {
      method: 'POST',
      headers: {
        Authorization: \`Bearer \${process.env.CF_API_TOKEN}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: '@cf/meta/llama-3.1-8b-instruct',
        messages,
        stream: true,
      }),
    },
  );

  // Workers AI returns OpenAI-format SSE. Pass it straight through.
  return new Response(upstream.body, { headers: { 'Content-Type': 'text/event-stream' } });
}`,
  streamMapping:
    "Workers AI via the OpenAI-compatible HTTP endpoint returns OpenAI-format SSE. Pipe upstream.body straight to the browser; readOpenAIStream from @kitn.ai/ui/wire parses it, including tool calls and reasoning. The native env.AI binding streams Cloudflare's own format (data: {\"response\":\"...token...\"}); the worker route template re-frames these chunks to OpenAI-format SSE via a TransformStream before returning.",
  runNote: 'Set CF_ACCOUNT_ID and CF_API_TOKEN. Model ids are prefixed with @cf/, e.g. @cf/meta/llama-3.1-8b-instruct. For the AI binding (worker key), add an [ai] block with binding = "AI" in wrangler.toml.',
  docsSlug: 'integrations/cloudflare-ai',
  // Nothing. Both routes pin '@cf/meta/llama-3.1-8b-instruct' (the generic
  // 'openai/gpt-4o-mini' a scaffold used to default to is not even a valid
  // Workers AI id), and the worker route's re-framing reader forwards only the
  // text `response` field, so a tool call could not reach the browser anyway.
  forwardsFromClient: [],
};

export default cloudflare;
