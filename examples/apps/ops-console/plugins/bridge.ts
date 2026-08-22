/** Shared plumbing between a WHATWG `Response` and a connect-style Node reply. */
import type { IncomingMessage, ServerResponse } from 'node:http';

export async function readBody(req: IncomingMessage): Promise<string> {
  let body = '';
  req.setEncoding('utf8');
  for await (const chunk of req) body += chunk;
  return body;
}

/**
 * Write a `Response` out to a Node reply, chunk by chunk.
 *
 * The STATUS has to survive the bridge — a 400 that arrives at the browser as a
 * 200 is a blank bubble and no error — and each chunk has to be flushed as it
 * lands, or buffering here defeats the streaming the whole thing exists for.
 */
export async function pipeResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value: string, key: string) => res.setHeader(key, value));
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    res.end();
  }
}
