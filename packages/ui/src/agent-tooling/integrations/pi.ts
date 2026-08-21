import type { Integration } from '../types';

const pi: Integration = {
  id: 'pi',
  title: 'Pi',
  category: 'harness',
  language: 'ts',
  streamFormat: 'native',
  envVars: [],
  routeTemplates: {
    // Express only, and genuinely so: the bridge spawns a local process, which a
    // Worker or an edge runtime cannot do. Every other framework gets this under
    // the scaffolder's "cannot host" warning, the same way pydantic-ai emits a
    // whole FastAPI service.
    express: `// server.ts
import express from 'express';
import { spawn } from 'node:child_process';
import type { OpenAIWireMessage } from '@kitn.ai/ui/wire';

const app = express();
app.use(express.json());

class ChatRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

/** Narrow the JSON body once, at the edge. A bare GET or a missing messages
 *  array is a ChatRequestError with a status — NEVER an unhandled throw
 *  (findings F-10). Malformed JSON is rejected upstream by express.json(),
 *  which the error handler below turns into a JSON 400. */
function readChatRequest(req: express.Request): { messages: OpenAIWireMessage[] } {
  if (req.method !== 'POST') {
    throw new ChatRequestError(405, \`Method \${req.method} not allowed — POST /api/chat.\`);
  }
  const body = (req.body ?? {}) as { messages?: OpenAIWireMessage[] };
  if (!Array.isArray(body.messages)) {
    throw new ChatRequestError(400, 'Request body must carry a messages array.');
  }
  return body as { messages: OpenAIWireMessage[] };
}

/** Map a guard rejection to the response its status demands; rethrow anything
 *  else — an unexpected error should be loud, not laundered into a 400. */
function toChatErrorResponse(error: unknown, res: express.Response): void {
  if (error instanceof ChatRequestError) {
    res.status(error.status).json({ error: { message: error.message } });
    return;
  }
  throw error;
}

// express.json() rejects a malformed body at the MIDDLEWARE level, before any
// handler runs — without this it surfaces as Express's default HTML error page.
app.use(
  (
    err: { status?: number; message?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(err?.status ?? 500).json({ error: { message: err?.message ?? 'Request failed.' } });
  },
);

// A bare GET is a 405 with the method named, not Express's default 404 —
// the resource exists, the verb is wrong.
app.get('/api/chat', (_req, res) => {
  res.status(405).json({ error: { message: 'Method not allowed — POST /api/chat.' } });
});

// POST /api/chat: bridge a Pi RPC session to the browser as SSE.
app.post('/api/chat', (req, res) => {
  let chatBody: { messages: OpenAIWireMessage[] };
  try {
    chatBody = readChatRequest(req);
  } catch (error) {
    toChatErrorResponse(error, res);
    return;
  }
  const { messages } = chatBody;
  const last = messages.at(-1)?.content;
  // \`content\` is a plain string until the turn carries an attachment, at which
  // point it is an ARRAY of content parts. Pi's RPC mode takes a TEXT prompt and
  // has no channel for a file, so an attachment is REFUSED here. Passing the
  // array straight through would JSON.stringify an object graph into the prompt
  // — no type error, no crash, just a model reading serialised noise.
  if (Array.isArray(last) && last.some((part) => part.type !== 'text')) {
    res.status(400).json({
      error: {
        message:
          'This Pi bridge forwards a text prompt only and has no channel for an attachment. Extract the file content into the message text, or send it through a tool.',
      },
    });
    return;
  }
  const prompt =
    typeof last === 'string'
      ? last
      : (last ?? []).map((part) => (part.type === 'text' ? part.text : '')).join('');

  // Headers before the first frame: without text/event-stream the browser
  // buffers the body and readOpenAIStream never sees a frame.
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  // no-transform stops a proxy buffering the stream into one blob.
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  // ONE PROCESS PER REQUEST. Pi in RPC mode holds conversation state, so a
  // module-level process would leak one caller's turns into the next caller's
  // reply and serialise every request behind a single stdin.
  const pi = spawn('pi', ['--mode', 'rpc', '--no-session']);

  // A spawn failure (pi not on PATH) arrives asynchronously, by which point the
  // SSE headers are out and the status is spent, so report IN BAND:
  // readOpenAIStream lands this on turn.error instead of leaving a blank bubble.
  pi.on('error', (err) => {
    res.write(\`data: \${JSON.stringify({ error: { message: err.message } })}\\n\\n\`);
    res.write('data: [DONE]\\n\\n');
    res.end();
  });

  // Send the user's turn. Pi commands are { type, message }.
  pi.stdin.write(JSON.stringify({ type: 'prompt', message: prompt }) + '\\n');

  let buffer = '';
  pi.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    // Split on \\n rather than readline: readline also breaks on the Unicode
    // separators U+2028/U+2029, which appear inside model output.
    const lines = buffer.split('\\n');
    // pop() is \`string | undefined\`, and the buffer has to stay a string.
    buffer = lines.pop() ?? ''; // hold the partial line for the next chunk
    for (const line of lines) {
      if (!line) continue;
      const event = JSON.parse(line);
      const part = event.assistantMessageEvent;
      if (event.type === 'message_update' && part?.type === 'text_delta') {
        res.write(\`data: \${JSON.stringify({ choices: [{ delta: { content: part.delta } }] })}\\n\\n\`);
      }
    }
  });
  pi.on('close', () => { res.write('data: [DONE]\\n\\n'); res.end(); });
});

app.listen(3001, () => console.log('chat api: http://localhost:3001/api/chat'));
// The front end fetches a RELATIVE /api/chat, so proxy that path to this port
// from your dev server, or serve both from one origin.`,
  },
  streamMapping: "Pi runs as a local stdio process in RPC mode (pi --mode rpc --no-session). It emits newline-delimited JSON events on stdout. Map message_update events where assistantMessageEvent.type === 'text_delta' to data: {choices:[{delta:{content:part.delta}}]} SSE frames; send data: [DONE] on close. Split stdout on \\n (not readline, which breaks on Unicode separators U+2028/U+2029). Pi also emits thinking_delta and toolcall_* events; re-frame them onto delta.reasoning and delta.tool_calls in the same frames. readOpenAIStream from @kitn.ai/ui/wire parses it, including tool calls and reasoning.",
  runNote: "Pi must be installed locally and available on PATH as 'pi'. No API key is required by the bridge itself; Pi uses its own credentials. Pi runs with full user permissions, so sandbox it before exposing to a public endpoint. See the RPC reference: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md",
  docsSlug: 'integrations/harnesses',
  // Nothing. Pi runs with its own credentials, model and tools; the bridge
  // forwards a prompt, not a model id.
  forwardsFromClient: [],
  // `express` only. The bridge's other two imports are excluded by the rule:
  // `node:child_process` is a builtin and '@kitn.ai/ui/wire' is the kit. Pi
  // itself is NOT an npm dep of the app — runNote requires it on PATH, and the
  // route reaches it with spawn('pi'), not an import.
  deps: { npm: ['express'], pip: [] },
  // No key anywhere: envVars is empty and Pi uses its own credentials on disk.
  // This is 'needs-proxy' for the OTHER reason the flag covers — a server-only
  // capability. The bridge calls spawn(), which no browser can do, and runNote
  // warns that Pi runs with full user permissions and wants sandboxing before it
  // is exposed. "No key" is not the same fact as "safe in the browser", and
  // collapsing the two is exactly how this flag would be got wrong.
  keyExposure: 'needs-proxy',
  // Not 'local-server': nothing is listening in advance. The bridge spawns
  // `pi --mode rpc` per request, so what the developer supplies is an EXECUTABLE
  // on PATH ("Pi must be installed locally and available on PATH as 'pi'"), and
  // "start the server first" would be the wrong instruction to print. Pi is not
  // in `deps` for the same reason — the route reaches it with spawn(), not an
  // import. The schema's SPAWNS_PROCESS net catches this one independently.
  outOfBand: 'local-binary',
};

export default pi;
