import type { Integration } from '../types';

const langgraph: Integration = {
  id: 'langgraph',
  title: 'LangGraph',
  category: 'framework',
  language: 'ts',
  streamFormat: 'openai-sse',
  envVars: ['OPENAI_API_KEY'],
  routeTemplates: {
    next: `// POST /api/chat: stream a compiled LangGraph agent to the browser
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const getWeather = tool(
  async ({ city }) => \`It's 18°C and clear in \${city}.\`,
  {
    name: 'get_weather',
    description: 'Get the current weather for a city.',
    schema: z.object({ city: z.string() }),
  },
);

const agent = createReactAgent({
  llm: new ChatOpenAI({ model: 'gpt-4o' }),
  tools: [getWeather],
});

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = await agent.stream({ messages }, { streamMode: 'messages' });

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(\`data: \${JSON.stringify(obj)}\\n\\n\`));

      for await (const [chunk] of stream) {
        if (typeof chunk.content === 'string' && chunk.content) {
          send({ choices: [{ delta: { content: chunk.content } }] });
        }
      }
      controller.enqueue(encoder.encode('data: [DONE]\\n\\n'));
      controller.close();
    },
  });

  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}`,
  },
  streamMapping: "Use graph.stream(input, { streamMode: 'messages' }) to get [messageChunk, metadata] tuples. Extract chunk.content (string) and forward as OpenAI-format SSE frames: data: {choices:[{delta:{content}}]}. Close with data: [DONE]. readOpenAIStream from @kitn.ai/ui/wire parses tool calls and reasoning too, but the route template forwards chunk.content only, which is text: the same message chunks carry the tool-call fragments on chunk.tool_call_chunks, so re-frame those onto delta.tool_calls to fill kai-tool.",
  runNote: 'Set OPENAI_API_KEY (or the key for your chosen model provider). Install @langchain/langgraph, @langchain/openai, @langchain/core.',
  docsSlug: 'integrations/langgraph',
  // Nothing. The agent owns both: ChatOpenAI({ model: 'gpt-4o' }) and the tools
  // array passed to createReactAgent are server-side.
  forwardsFromClient: [],
};

export default langgraph;
