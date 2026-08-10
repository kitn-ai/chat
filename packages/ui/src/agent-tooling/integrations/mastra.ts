import type { Integration } from '../types';

const mastra: Integration = {
  id: 'mastra',
  title: 'Mastra',
  category: 'harness',
  language: 'ts',
  streamFormat: 'openai-sse',
  envVars: ['MASTRA_URL'],
  routeTemplates: {
    express: `// POST /api/chat: your server proxies a Mastra agent to the browser
import { MastraClient } from '@mastra/client-js';

const mastra = new MastraClient({ baseUrl: process.env.MASTRA_URL });

const stream = await mastra.getAgent('supportAgent').stream({ messages });
for await (const delta of stream.textStream) {
  res.write(\`data: \${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\\n\\n\`);
}
res.write('data: [DONE]\\n\\n');`,
  },
  streamMapping: "Mastra agents speak Vercel AI SDK v5 and expose stream.textStream (async iterable of string deltas). Iterate textStream and emit data: {choices:[{delta:{content}}]} frames; close with data: [DONE]. readOpenAIStream from @kitn.ai/ui/wire parses it, including tool calls and reasoning, but textStream carries neither: convert the agent to a UI message stream with @mastra/ai-sdk and re-frame its tool and reasoning events onto delta.tool_calls and delta.reasoning to get them.",
  runNote: 'Set MASTRA_URL to your Mastra server base URL (mastra dev exposes POST /api/agents/:agentId/stream on port 4111). Install @mastra/client-js.',
  docsSlug: 'integrations/harnesses',
  // Nothing. The Mastra agent owns its model and its tools server-side.
  forwardsFromClient: [],
};

export default mastra;
