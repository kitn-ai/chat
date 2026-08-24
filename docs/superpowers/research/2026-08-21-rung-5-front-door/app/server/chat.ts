/**
 * `POST /api/chat` — the console's dev endpoint.
 *
 * The seam a real provider would slot into: the body is narrowed exactly the way
 * a live route narrows it, and only the frame SOURCE is mocked. Going live means
 * replacing `scriptFrames(...)` with a provider call and leaving everything
 * upstream of this file alone.
 */
import type { OpenAIWireMessage } from '@kitn.ai/ui/wire';
import { scriptFrames } from './script.js';

interface ChatRequestBody {
  messages: OpenAIWireMessage[];
  /** Lets the APP drive a follow-up turn directly instead of by keyword match. */
  intent?: string;
  params?: Record<string, unknown>;
}

class ChatRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Narrow the JSON body once, at the edge. A bare GET or a malformed body is a
 * ChatRequestError with a status, never an unhandled SyntaxError — an unhandled
 * rejection in a connect middleware exits Node 22 and takes the dev server with it.
 */
async function readChatRequest(request: Request): Promise<ChatRequestBody> {
  if (request.method !== 'POST') {
    throw new ChatRequestError(405, `Method ${request.method} not allowed — POST /api/chat.`);
  }
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new ChatRequestError(400, 'Request body is not valid JSON.');
  }
  const body = parsed as ChatRequestBody;
  if (!Array.isArray(body?.messages)) {
    throw new ChatRequestError(400, 'Request body must carry a messages array.');
  }
  return body;
}

function toChatErrorResponse(error: unknown): Response {
  if (error instanceof ChatRequestError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  throw error;
}

/** The last user turn's text, which is all the script matches on. */
function lastUserText(messages: OpenAIWireMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last) return '';
  if (typeof last.content === 'string') return last.content;
  if (!Array.isArray(last.content)) return '';
  return last.content
    .map((part) => (part && typeof part === 'object' && 'text' in part ? String(part.text ?? '') : ''))
    .join(' ');
}

export async function chatHandler(request: Request): Promise<Response> {
  let body: ChatRequestBody;
  try {
    body = await readChatRequest(request);
  } catch (error) {
    return toChatErrorResponse(error);
  }

  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of scriptFrames({
          prompt: lastUserText(body.messages),
          intent: body.intent,
          params: body.params,
        })) {
          // The browser hangs up when the operator asks something new mid-answer;
          // stop producing frames rather than writing into a cancelled stream.
          if (!open) return;
          controller.enqueue(encoder.encode(chunk));
        }
      } finally {
        if (open) controller.close();
      }
    },
    cancel() {
      open = false;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
