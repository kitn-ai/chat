import type { Integration } from '../types';

const openrouter: Integration = {
  id: 'openrouter',
  title: 'OpenRouter',
  category: 'gateway',
  language: 'ts',
  streamFormat: 'openai-sse',
  envVars: ['OPENROUTER_API_KEY'],
  routeTemplates: {
    next: `export async function POST(req: Request) {
  // tools is undefined unless the front end sent one; JSON.stringify drops it,
  // so the same route serves a tool archetype and a plain chat.
  const { model, messages, tools } = await req.json();
  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: \`Bearer \${process.env.OPENROUTER_API_KEY}\`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, tools, stream: true }),
  });
  return new Response(upstream.body, { headers: { 'Content-Type': 'text/event-stream' } });
}`,
  },
  streamMapping:
    'OpenRouter returns OpenAI-format SSE. Pipe upstream.body straight to the browser; readOpenAIStream from @kitn.ai/ui/wire parses it, including tool calls and reasoning.',
  runNote: 'Set OPENROUTER_API_KEY. Model ids are vendor/model, e.g. openai/gpt-4o.',
  docsSlug: 'integrations/connect-any-model',
  // The route forwards both, so a scaffold's editable consts reach the gateway.
  forwardsFromClient: ['model', 'tools'],
};

export default openrouter;
