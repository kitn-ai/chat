// What is left of the spike's own wire code, now that the parsing lives in
// `@kitn.ai/ui/wire`: a POST that hands back the Response. These four tests pin
// the two things that are still the spike's job (return the Response unwrapped,
// keep the provider out of the client bundle) and prove the kit's reader takes it
// from there.
import { describe, expect, it } from 'vitest';
import { WireError, readOpenAIStream } from '@kitn.ai/ui/wire';
import { openChatStream } from './transport';

const SSE =
  ': OPENROUTER PROCESSING\n\n' +
  'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\n' +
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
  'data: [DONE]\n\n';

const nullSink = () => ({
  appendText: () => undefined,
  appendReasoning: () => undefined,
  upsertTool: () => undefined,
  addSource: () => undefined,
});

function stubFetch(response: Response): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => response) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

describe('openChatStream', () => {
  it('returns the RESPONSE, so the kit owns the parsing', async () => {
    const restore = stubFetch(new Response(SSE, { status: 200 }));
    try {
      const res = await openChatStream({ messages: [], cardMode: 'tool' });
      expect(res).toBeInstanceOf(Response);
      const turn = await readOpenAIStream(res, nullSink());
      expect(turn.text).toBe('Hi');
      expect(turn.stopReason).toBe('stop');
    } finally {
      restore();
    }
  });

  it('surfaces a proxy failure as a WireError through the reader', async () => {
    const restore = stubFetch(
      new Response(JSON.stringify({ error: { message: 'no key configured' } }), {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    );
    try {
      const res = await openChatStream({ messages: [], cardMode: 'tool' });
      const err = (await readOpenAIStream(res, nullSink()).catch((e: unknown) => e)) as WireError;
      expect(err).toBeInstanceOf(WireError);
      expect(err.status).toBe(500);
      expect(err.message).toContain('no key configured');
    } finally {
      restore();
    }
  });

  it('never mentions the provider host in the client bundle', async () => {
    const src = await import('./transport?raw').then((m) => m.default as string);
    expect(src).not.toContain('openrouter.ai');
    expect(src).not.toContain('API_KEY');
  });

  it('posts to the local proxy with the fields the proxy reads', async () => {
    let seen: RequestInit | undefined;
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      seen = init;
      return new Response(SSE, { status: 200 });
    }) as typeof fetch;
    try {
      await openChatStream({ messages: [{ role: 'user', content: 'hi' }], cardMode: 'tool' });
      expect(JSON.parse(String(seen?.body))).toMatchObject({ cardMode: 'tool' });
    } finally {
      globalThis.fetch = original;
    }
  });
});
