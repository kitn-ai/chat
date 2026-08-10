import type { Integration } from '../types';

const mastra: Integration = {
  id: 'mastra',
  title: 'Mastra',
  category: 'harness',
  language: 'ts',
  streamFormat: 'openai-sse',
  envVars: ['MASTRA_URL'],
  // No per-framework templates. The old `express` entry was a fragment, not a
  // route: it referenced `messages` and `res` without declaring either, and
  // every non-express framework inherited it anyway. The handler below is
  // web-standard, so the scaffolder wraps it per framework.
  routeTemplates: {},
  webRoute: `import { MastraClient } from '@mastra/client-js';

const mastra = new MastraClient({ baseUrl: process.env.MASTRA_URL });

// Proxy a Mastra agent to the browser as OpenAI-format SSE.
async function chatHandler(request: Request): Promise<Response> {
  const { messages } = await request.json();

  const stream = await mastra.getAgent('supportAgent').stream({ messages });

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      for await (const delta of stream.textStream) {
        const chunk = { choices: [{ delta: { content: delta } }] };
        controller.enqueue(encoder.encode(\`data: \${JSON.stringify(chunk)}\\n\\n\`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\\n\\n'));
      controller.close();
    },
  });

  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}`,
  streamMapping: "Mastra agents speak Vercel AI SDK v5 and expose stream.textStream (async iterable of string deltas). Iterate textStream and emit data: {choices:[{delta:{content}}]} frames; close with data: [DONE]. readOpenAIStream from @kitn.ai/ui/wire parses it, including tool calls and reasoning, but textStream carries neither: convert the agent to a UI message stream with @mastra/ai-sdk and re-frame its tool and reasoning events onto delta.tool_calls and delta.reasoning to get them.",
  runNote: 'Set MASTRA_URL to your Mastra server base URL (mastra dev exposes POST /api/agents/:agentId/stream on port 4111). Install @mastra/client-js.',
  docsSlug: 'integrations/harnesses',
  // Nothing. The Mastra agent owns its model and its tools server-side.
  forwardsFromClient: [],
};

export default mastra;
