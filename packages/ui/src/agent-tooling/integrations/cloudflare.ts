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
import type { OpenAIWireMessage } from '@kitn.ai/ui/wire';

/**
 * What the front end POSTs. \`req.json()\` is \`unknown\` (it is whatever the
 * client sent), so the body is narrowed once here instead of at every use —
 * without it this Worker does not compile. Widen it as you add fields.
 */
type ChatRequestBody = { messages: OpenAIWireMessage[] };

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { messages } = (await req.json()) as ChatRequestBody;

    let nativeStream: ReadableStream<Uint8Array>;
    try {
      // env.AI.run is typed to return the non-streaming shape; \`stream: true\`
      // makes it a ReadableStream at runtime, which the types cannot express, so
      // the hop through \`unknown\` is required rather than cosmetic.
      nativeStream = (await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages,
        stream: true,
      })) as unknown as ReadableStream<Uint8Array>;
    } catch (err) {
      // A REAL status, before a byte is streamed. Returning 200 here would send
      // a JSON error labelled text/event-stream: the reader finds no frame and
      // the turn resolves empty, with nothing logged and no bubble.
      return new Response(
        JSON.stringify({ error: { message: err instanceof Error ? err.message : 'Workers AI call failed' } }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Re-frame Cloudflare-native SSE → OpenAI-format SSE
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    (async () => {
      const reader = nativeStream.getReader();
      let buffer = '';
      try {
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
      } catch (err) {
        // The response is already streaming, so the status is spent: report the
        // failure IN BAND. readOpenAIStream lands this on turn.error and keeps
        // whatever already streamed.
        const message = err instanceof Error ? err.message : 'Workers AI stream failed';
        await writer.write(encoder.encode(\`data: \${JSON.stringify({ error: { message } })}\\n\\n\`));
      } finally {
        // Always: an unclosed writer leaves the browser waiting forever.
        await writer.write(encoder.encode('data: [DONE]\\n\\n'));
        await writer.close();
      }
    })();

    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  },
};`,
  },
  webRoute: `async function chatHandler(request: Request): Promise<Response> {
  // Proxy Workers AI over its OpenAI-compatible HTTP endpoint, token server-side.
  const { messages } = await readChatRequest(request);

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

  // FORWARD THE STATUS. A wrong CF_API_TOKEN is a 401/403: returning 200 sends
  // its JSON body out labelled text/event-stream, the SSE reader finds no frame,
  // and the turn resolves empty with nothing logged and no bubble.
  if (!upstream.ok) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      },
    });
  }
  if (!upstream.body) {
    return new Response(JSON.stringify({ error: { message: 'Workers AI returned no body to stream.' } }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Workers AI returns OpenAI-format SSE. Pass it straight through.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
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
  // Nothing. The webRoute is global `fetch`, and the worker template's only
  // import is a type from '@kitn.ai/ui/wire' — the kit itself, which every
  // scaffold already depends on. Its `Env` is an ambient wrangler type, not an
  // import, and the Worker skeleton owns wrangler/@cloudflare/workers-types.
  deps: { npm: [], pip: [] },
  // The webRoute reads CF_API_TOKEN into an `Authorization: Bearer` header.
  //
  // The two routes differ and the stricter one governs: the worker template uses
  // the `env.AI` binding and holds no token in code at all, but a binding is a
  // Worker capability, not a browser one. Either way a server is required.
  keyExposure: 'needs-proxy',
  // Workers AI is a remote HTTPS endpoint (the REST route) or a platform binding
  // (the worker route) — either way there is nothing on the developer's machine
  // to install or run. `wrangler` is a devDependency of a Worker app, not an
  // out-of-band prerequisite of this integration.
  outOfBand: 'none',
};

export default cloudflare;
