import type { OpenAIWireMessage } from '@kitn.ai/ui/wire';

import { createMockResponder } from '@kitn.ai/ui/state';

// The kit's own mock responder — no provider, no key, no upstream. MODULE
// scope, not per-request: the responder owns the cursor into its canned
// replies, so rebuilding it per turn would answer with the first one forever.
const mockResponse = createMockResponder();

/**
 * What the front end POSTs. `request.json()` is `unknown` (it is whatever the
 * client sent), so the body is narrowed once here instead of at every use.
 * Widen it as you add fields of your own.
 */
type ChatRequestBody = {
  messages: OpenAIWireMessage[];
  model?: string;
  tools?: unknown[];
};

/** Narrow the JSON body once, at the edge. */
async function readChatRequest(request: Request): Promise<ChatRequestBody> {
  return (await request.json()) as ChatRequestBody;
}

async function chatHandler(request: Request): Promise<Response> {
  // The responder cycles its replies whatever you send, so the prompt is a
  // courtesy — but the body is still read exactly the way a real route reads
  // it, so swapping this handler for a provider's changes nothing upstream of
  // this file. The client posts the WHOLE thread (toOpenAIMessages of the
  // conversation), so a rehydrated conversation arrives here with its full
  // history and a real provider would see all of it.
  const { messages } = await readChatRequest(request);
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const prompt = last && typeof last.content === 'string' ? last.content : '';

  // One line so the dev console shows the history actually reached the route —
  // the mock ignores it, a real provider would not.
  console.log(`[api/chat] ${messages.length} message(s) in thread; last user prompt: ${JSON.stringify(prompt)}`);

  // createMockResponder() yields COMPLETE OpenAI chat-completions SSE frames,
  // so this route only writes them out verbatim. No framing is built here; the
  // browser parses them with readOpenAIStream from @kitn.ai/ui/wire, exactly as
  // it would a real route's response. Every frame is marked as a mock (a
  // ': kai-mock' banner, a _kai_mock field, model 'kai-mock', zero usage).
  const encoder = new TextEncoder();
  let open = true;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for await (const frame of mockResponse(prompt)) {
        // The browser hangs up when the user asks a new question mid-answer;
        // stop producing frames rather than writing into a cancelled stream.
        if (!open) return;
        controller.enqueue(encoder.encode(frame));
      }
      controller.close();
    },
    cancel() {
      open = false;
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform stops a proxy buffering the stream into one blob.
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// vite-chat-api.ts imports it from here.
export { chatHandler };
