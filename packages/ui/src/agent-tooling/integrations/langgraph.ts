import type { Integration } from '../types';

const langgraph: Integration = {
  id: 'langgraph',
  title: 'LangGraph',
  category: 'framework',
  language: 'ts',
  streamFormat: 'openai-sse',
  envVars: ['OPENAI_API_KEY'],
  // No per-framework templates: the handler below is web-standard, so the
  // scaffolder wraps it in the target framework's own route declaration.
  routeTemplates: {},
  webRoute: `import { createReactAgent } from '@langchain/langgraph/prebuilt';
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

// Stream a compiled LangGraph agent to the browser as OpenAI-format SSE.
async function chatHandler(request: Request): Promise<Response> {
  const { messages } = await request.json();

  let stream: AsyncIterable<[{ content?: unknown }]>;
  try {
    stream = await agent.stream({ messages }, { streamMode: 'messages' });
  } catch (err) {
    // A REAL status, before a byte is streamed: a missing OPENAI_API_KEY fails
    // here. Returning 200 would send this JSON out labelled text/event-stream,
    // the SSE reader would find no frame, and the turn would resolve empty with
    // nothing logged and no bubble.
    return new Response(
      JSON.stringify({ error: { message: err instanceof Error ? err.message : 'Agent failed to start' } }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(\`data: \${JSON.stringify(obj)}\\n\\n\`));

      try {
        for await (const [chunk] of stream) {
          if (typeof chunk.content === 'string' && chunk.content) {
            send({ choices: [{ delta: { content: chunk.content } }] });
          }
        }
      } catch (err) {
        // The status is spent once the stream started, so report IN BAND:
        // readOpenAIStream lands this on turn.error and keeps what streamed.
        send({ error: { message: err instanceof Error ? err.message : 'Agent stream failed' } });
      }
      controller.enqueue(encoder.encode('data: [DONE]\\n\\n'));
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform stops a proxy buffering the stream into one blob.
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}`,
  streamMapping: "Use graph.stream(input, { streamMode: 'messages' }) to get [messageChunk, metadata] tuples. Extract chunk.content (string) and forward as OpenAI-format SSE frames: data: {choices:[{delta:{content}}]}. Close with data: [DONE]. readOpenAIStream from @kitn.ai/ui/wire parses tool calls and reasoning too, but the route template forwards chunk.content only, which is text: the same message chunks carry the tool-call fragments on chunk.tool_call_chunks, so re-frame those onto delta.tool_calls to fill kai-tool.",
  runNote: 'Set OPENAI_API_KEY (or the key for your chosen model provider). Install @langchain/langgraph, @langchain/openai, @langchain/core.',
  docsSlug: 'integrations/langgraph',
  // Nothing. The agent owns both: ChatOpenAI({ model: 'gpt-4o' }) and the tools
  // array passed to createReactAgent are server-side.
  forwardsFromClient: [],
};

export default langgraph;
