/**
 * The local dev endpoint: POST /api/chat -> mocked OpenAI-shaped SSE.
 *
 * NO PROVIDER IS CONTACTED. The frames come from `mockTurn`, which streams the
 * kit's own `createMockResponder()` text plus a `kai_artifact` tool call
 * carrying the generated page. The browser parses them with `readOpenAIStream`
 * from `@kitn.ai/ui/wire` — the same reader a real route's response would go
 * through, so going live means replacing the responder in this file and nothing
 * else in the client.
 *
 * Mounted on the Vite dev server by ../vite-chat-api.ts.
 */
import { MOCK_BANNER } from '@kitn.ai/ui/state';
import type { OpenAIWireMessage } from '@kitn.ai/ui/wire';

import { mockTurn } from './mock-stream.js';

/** Announced once per server process, for the human reading the terminal. */
console.info(`[kai] ${MOCK_BANNER.slice(2)}`);

/** What the front end POSTs. `request.json()` is `unknown`, so narrow it once. */
type ChatRequestBody = {
  messages: OpenAIWireMessage[];
  /** This app's own field: how many versions the client already holds. */
  versionCount?: number;
};

async function readChatRequest(request: Request): Promise<ChatRequestBody> {
  return (await request.json()) as ChatRequestBody;
}

/** A wire message's content is a string, or content parts on an attachment turn. */
function textOf(message: OpenAIWireMessage): string {
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join(' ')
      .trim();
  }
  return '';
}

export async function chatHandler(request: Request): Promise<Response> {
  const { messages, versionCount } = await readChatRequest(request);
  const prompts = (messages ?? []).filter((m) => m.role === 'user').map(textOf).filter(Boolean);

  const encoder = new TextEncoder();
  let open = true;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const f of mockTurn({ prompts, versionCount: versionCount ?? Math.max(0, prompts.length - 1) })) {
          // The browser hangs up when the user asks a new question mid-answer;
          // stop producing frames rather than writing into a cancelled stream.
          if (!open) return;
          controller.enqueue(encoder.encode(f));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
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
