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

// MASTRA_URL is required, not defaulted to localhost: a deployed consumer app
// that forgets to set it would otherwise construct a client that silently
// points a production Worker/serverless function at 127.0.0.1, then fail deep
// inside a fetch call with a confusing connection error. Failing at import
// time, with a message that names the fix, is louder and cheaper to debug.
const MASTRA_URL = process.env.MASTRA_URL;
if (!MASTRA_URL) {
  throw new Error('MASTRA_URL is not set. Point it at your Mastra server, e.g. http://localhost:4111 for \`mastra dev\`.');
}

const mastra = new MastraClient({ baseUrl: MASTRA_URL });

// Proxy a Mastra agent to the browser as OpenAI-format SSE.
async function chatHandler(request: Request): Promise<Response> {
  const { messages } = await readChatRequest(request);

  // MastraClient's Agent.stream() takes AI-SDK CoreMessage[], not the OpenAI
  // wire format: each message has ONE literal role (not a union) and content
  // is never null. A 'tool' wire message is OUR client-side tool bookkeeping;
  // this agent owns its tools server-side (forwardsFromClient is empty), so it
  // has no schema for that shape and the entry is dropped rather than guessed.
  type MastraMessage = { role: 'system'; content: string } | { role: 'user'; content: string } | { role: 'assistant'; content: string };
  const mastraMessages: MastraMessage[] = [];
  for (const m of messages) {
    const content = m.content ?? '';
    // Each branch constructs a literal with ONE fixed role, not m.role (which is
    // still typed as the 4-way union): a union-VALUED field on a single object
    // does not structurally match a union of role-discriminated objects, so
    // widening back to m.role here would reintroduce the original TS2345.
    if (m.role === 'system') mastraMessages.push({ role: 'system', content });
    else if (m.role === 'user') mastraMessages.push({ role: 'user', content });
    else if (m.role === 'assistant') mastraMessages.push({ role: 'assistant', content });
  }

  let agentStream: Awaited<ReturnType<ReturnType<typeof mastra.getAgent>['stream']>>;
  try {
    agentStream = await mastra.getAgent('supportAgent').stream(mastraMessages);
  } catch (err) {
    // A REAL status, before a byte is streamed: an unreachable MASTRA_URL or an
    // unknown agent id fails here. Returning 200 would send this JSON out
    // labelled text/event-stream, the SSE reader would find no frame, and the
    // turn would resolve empty with nothing logged and no bubble.
    return new Response(
      JSON.stringify({ error: { message: err instanceof Error ? err.message : 'Mastra agent failed to start' } }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        // The client SDK has no textStream: it hands back a Response wrapped
        // with processDataStream, which replays the agent's SSE body as typed
        // chunks. Only text-delta carries browser-facing content; tool-call and
        // reasoning chunks exist here too but are out of scope for this route
        // (see streamMapping) and are left unhandled rather than half-wired.
        await agentStream.processDataStream({
          onChunk: (chunk) => {
            if (chunk.type === 'text-delta') {
              const openaiChunk = { choices: [{ delta: { content: chunk.payload.text } }] };
              controller.enqueue(encoder.encode(\`data: \${JSON.stringify(openaiChunk)}\\n\\n\`));
            } else if (chunk.type === 'error') {
              // Mastra reports some failures IN BAND as an 'error' chunk instead
              // of rejecting the stream; fold it into the same frame the catch
              // below emits so readOpenAIStream lands it on turn.error either way.
              const message = chunk.payload.error instanceof Error ? chunk.payload.error.message : 'Mastra agent reported an error';
              controller.enqueue(encoder.encode(\`data: \${JSON.stringify({ error: { message } })}\\n\\n\`));
            }
          },
        });
      } catch (err) {
        // The status is spent once the stream started, so report IN BAND:
        // readOpenAIStream lands this on turn.error and keeps what streamed.
        const message = err instanceof Error ? err.message : 'Mastra stream failed';
        controller.enqueue(encoder.encode(\`data: \${JSON.stringify({ error: { message } })}\\n\\n\`));
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
  streamMapping: "Mastra's client SDK has no textStream: agent.stream() returns a Response wrapped with processDataStream({ onChunk }), which replays the agent's SSE body as typed chunks (text-delta, tool-call, reasoning-delta, error, finish, ...). Filter to type === 'text-delta' and emit data: {choices:[{delta:{content:payload.text}}]} frames; close with data: [DONE]. readOpenAIStream from @kitn.ai/ui/wire parses that, including tool calls and reasoning, but this route only wires text-delta: re-frame tool-call/tool-result and reasoning-delta chunks onto delta.tool_calls and delta.reasoning to get them too.",
  runNote: 'Set MASTRA_URL to your Mastra server base URL (mastra dev exposes POST /api/agents/:agentId/stream on port 4111). Install @mastra/client-js.',
  docsSlug: 'integrations/harnesses',
  // Nothing. The Mastra agent owns its model and its tools server-side.
  forwardsFromClient: [],
};

export default mastra;
