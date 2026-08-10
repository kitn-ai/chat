import type { Integration } from '../types';

const vercelAiSdk: Integration = {
  id: 'vercel-ai-sdk',
  title: 'Vercel AI SDK',
  category: 'framework',
  language: 'ts',
  streamFormat: 'ai-sdk',
  envVars: ['AI_GATEWAY_API_KEY'],
  routeTemplates: {
    next: `// app/api/chat/route.ts
import { streamText } from 'ai';

export const maxDuration = 30; // allow long streaming responses

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: 'openai/gpt-4o', // AI Gateway id; needs AI_GATEWAY_API_KEY
    messages,
  });

  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(controller) {
      for await (const delta of result.textStream) {
        const chunk = { choices: [{ delta: { content: delta } }] };
        controller.enqueue(encoder.encode(\`data: \${JSON.stringify(chunk)}\\n\\n\`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\\n\\n'));
      controller.close();
    },
  });

  return new Response(sse, { headers: { 'Content-Type': 'text/event-stream' } });
}`,
  },
  streamMapping: "The Vercel AI SDK's toUIMessageStreamResponse() and toTextStreamResponse() don't emit OpenAI-format SSE. Wrap result.textStream manually: iterate text deltas and emit data: {choices:[{delta:{content}}]} frames, closing with data: [DONE]. Read it on the client with readOpenAIStream from '@kitn.ai/ui/wire'.",
  runNote: 'Set AI_GATEWAY_API_KEY for the AI Gateway (string model id form: creator/model-name). For direct provider access, import its provider package (e.g. @ai-sdk/openai) and set the corresponding key (e.g. OPENAI_API_KEY).',
  docsSlug: 'integrations/vercel-ai-sdk',
};

export default vercelAiSdk;
