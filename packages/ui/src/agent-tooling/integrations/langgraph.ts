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
  const { messages } = await readChatRequest(request);

  // agent.stream() coerces plain {role, content} objects into BaseMessage
  // instances itself, including OpenAI-shaped tool_calls, so the wire messages
  // can be passed through almost as-is. The one incompatible bit is content:
  // OpenAI represents a tool-calls-only assistant turn as content: null, and
  // LangChain's MessageContent type (and runtime coercion) only accepts string.
  const agentMessages = messages.map((m) => ({ ...m, content: m.content ?? '' }));

  // Let TS infer the stream's element type from this call instead of hand
  // writing it: the real type is a [BaseMessage, metadata] tuple, keyed off the
  // streamMode: 'messages' literal, not the plain object shape it looks like.
  const startStream = () => agent.stream({ messages: agentMessages }, { streamMode: 'messages' });

  let stream: Awaited<ReturnType<typeof startStream>>;
  try {
    stream = await startStream();
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
  // No install list here: `deps` below is the one, and the scaffolder emits it.
  // This sentence used to end "Install @langchain/langgraph, @langchain/openai,
  // @langchain/core." — three of the four packages, for as long as nobody was
  // comparing it to anything.
  runNote: 'Set OPENAI_API_KEY (or the key for your chosen model provider).',
  docsSlug: 'integrations/langgraph',
  // Nothing. The agent owns both: ChatOpenAI({ model: 'gpt-4o' }) and the tools
  // array passed to createReactAgent are server-side.
  forwardsFromClient: [],
  // Four, one per import in the route above. `zod` is the one the deleted prose
  // forgot: the tool's `schema:` is a z.object(), so an app installed from that
  // sentence alone fails to build. Deriving this from the imports rather than
  // from a sentence is the point of the field.
  deps: { npm: ['@langchain/langgraph', '@langchain/openai', '@langchain/core', 'zod'], pip: [] },
  // No key appears in the route: `new ChatOpenAI(...)` reads OPENAI_API_KEY from
  // the environment itself. Same invisible-key shape as vercel-ai-sdk.
  keyExposure: 'needs-proxy',
  // 'none', and this is the entry most likely to be "corrected" to something
  // else, so the reason is here rather than assumed. The create-kai spec lists
  // LangGraph under "Bring a server or runtime". That is WRONG for this route:
  // the graph is built and compiled IN PROCESS above (`createReactAgent` over a
  // `new ChatOpenAI(...)`), so there is no LangGraph server, no port and no
  // second process — the four packages in `deps` are the whole install and
  // `runNote` asks for a key and nothing else.
  //
  // LangGraph Platform / `langgraph dev` IS a server, and an integration that
  // talked to one over HTTP would be 'local-server'. That is a different route
  // than the one above, and if it is ever added it must be added as its own
  // catalog entry rather than by changing this line.
  outOfBand: 'none',
};

export default langgraph;
