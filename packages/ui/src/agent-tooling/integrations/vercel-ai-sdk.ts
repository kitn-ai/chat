import type { Integration } from '../types';

const vercelAiSdk: Integration = {
  id: 'vercel-ai-sdk',
  title: 'Vercel AI SDK',
  category: 'framework',
  language: 'ts',
  streamFormat: 'ai-sdk',
  envVars: ['AI_GATEWAY_API_KEY'],
  // No per-framework templates: the handler below is web-standard, so the
  // scaffolder wraps it in the target framework's own route declaration.
  routeTemplates: {},
  webRoute: `import { streamText } from 'ai';

// Next.js only: add \`export const maxDuration = 30\` to the route file to allow
// long streaming responses. It is a Next route-segment config, not part of the
// handler, so it lives in the file rather than in here.

async function chatHandler(request: Request): Promise<Response> {
  const { messages } = await request.json();

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
  streamMapping: "The Vercel AI SDK's toUIMessageStreamResponse() and toTextStreamResponse() don't emit OpenAI-format SSE. Wrap result.textStream manually: iterate text deltas and emit data: {choices:[{delta:{content}}]} frames, closing with data: [DONE]. readOpenAIStream from @kitn.ai/ui/wire parses tool calls and reasoning too, but textStream carries neither: it is text deltas only. Switch to result.fullStream, which yields typed parts, and re-frame its tool-call and reasoning parts onto delta.tool_calls and delta.reasoning to get them.",
  runNote: 'Set AI_GATEWAY_API_KEY for the AI Gateway (string model id form: creator/model-name). For direct provider access, import its provider package (e.g. @ai-sdk/openai) and set the corresponding key (e.g. OPENAI_API_KEY).',
  docsSlug: 'integrations/vercel-ai-sdk',
  // Nothing. The route pins model: 'openai/gpt-4o' in the streamText() call and
  // defines any tools there too, so neither belongs in the front end.
  forwardsFromClient: [],
};

export default vercelAiSdk;
