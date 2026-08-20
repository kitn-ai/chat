/**
 * The local dev endpoint: POST /api/chat -> a streamed, MOCKED reply.
 *
 * There is no provider and no API key here. `createMockResponder()` is the
 * kit's own mocking facility (from `@kitn.ai/ui/state`): it yields fully framed
 * OpenAI chat-completions SSE strings, so this handler only has to write them
 * to the socket verbatim. The browser then reads them with `readOpenAIStream`
 * from `@kitn.ai/ui/wire` — the same reader a real route's response would go
 * through, so swapping this middleware for a real provider changes nothing on
 * the client.
 *
 * Every frame the responder emits is marked as a mock (a `: kai-mock` SSE
 * banner, a `_kai_mock` field, `model: "kai-mock"`, zero usage), so nothing
 * served from here can be mistaken for a real turn.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createMockResponder } from '@kitn.ai/ui/state';

import { CHAT_ROUTE } from './routes';

/**
 * Canned replies, cycled one per turn by the responder. Deliberately plain
 * prose: this app reads the reply aloud with `speechSynthesis`, which would
 * pronounce markdown punctuation literally.
 */
const REPLIES: readonly string[] = [
  "I heard you. I'm a local mock reply, not a real model — no provider was contacted, and no audio ever left your browser. Your speech was recognised on device, and this sentence is about to be spoken back to you the same way.",
  "Still the mock speaking. Everything you say is transcribed by the browser's own speech recogniser, and everything I say is spoken by the browser's own synthesiser. The only thing crossing the network is this text, streamed from your dev server.",
  'Mock reply number three. The point of this turn is that the transcript above keeps every earlier turn intact, so you can hold a whole conversation and scroll back through it.',
  'One more canned answer. Swap this middleware for a real chat route and the browser code does not change at all: it already fetches an endpoint and parses the stream with the kit’s reader.',
];

/** Pull the user's question out of an OpenAI-shaped request body. */
function lastUserText(body: unknown): string {
  if (typeof body !== 'object' || body === null) return '';
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as { role?: unknown; content?: unknown };
    if (message?.role !== 'user') continue;
    if (typeof message.content === 'string') return message.content;
    // The multimodal shape: an array of content parts.
    if (Array.isArray(message.content)) {
      return message.content
        .filter((part): part is { type: 'text'; text: string } => {
          const candidate = part as { type?: unknown; text?: unknown };
          return candidate?.type === 'text' && typeof candidate.text === 'string';
        })
        .map((part) => part.text)
        .join(' ');
    }
    return '';
  }
  return '';
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void;

export function createMockChatMiddleware(): Middleware {
  const respond = createMockResponder({ replies: REPLIES, delayMs: 28, chunkSize: 1 });

  return (req, res, next) => {
    // On a connect-style middleware `req.url` is the path, query included.
    const path = (req.url ?? '').split('?')[0];
    if (path !== CHAT_ROUTE) {
      next();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'POST' });
      res.end('POST only');
      return;
    }

    void (async () => {
      let prompt = '';
      try {
        const raw = await readBody(req);
        prompt = raw ? lastUserText(JSON.parse(raw)) : '';
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Expected a JSON body');
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Vite's dev server sits behind nothing, but a proxy in front of a
        // preview build would otherwise buffer the whole stream into one lump
        // and the reply would land all at once instead of streaming.
        'X-Accel-Buffering': 'no',
      });

      // The browser hangs up when the user asks a new question mid-answer;
      // stop producing frames rather than writing to a dead socket.
      let closed = false;
      res.on('close', () => {
        closed = true;
      });

      try {
        for await (const frame of respond(prompt)) {
          if (closed) return;
          res.write(frame);
        }
      } catch (err) {
        console.error('[mock-chat] stream failed:', err);
      } finally {
        if (!closed) res.end();
      }
    })();
  };
}
