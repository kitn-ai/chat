// `wire.open` and the connection it opened.
//
// A content-type of `text/html` or `application/json` where SSE was expected is
// the classic proxy/misconfiguration tell, and it is invisible from inside the
// parse: the frames simply never arrive. The response knows, so the event says.
//
// THE QUERY STRING NEVER TRAVELS, on any switch. It is where a key ends up when
// somebody puts one there (`?api_key=`), and a credential is not conversation
// content -- so it is not payload either, it is just out. `hasQuery` carries the
// one bit a reader actually needs: whether there was one at all.
import { afterEach, describe, expect, it } from 'vitest';
import { readOpenAIStream } from './read';
import { subscribeWireDiagnostics, type WireDiagnosticEvent } from './diagnostics';

const nullSink = () =>
  ({
    appendText: () => {},
    appendReasoning: () => {},
    upsertTool: () => {},
    addSource: () => {},
  }) as any;

const BODY = [
  'data: {"choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":"stop"}]}',
  '',
  'data: [DONE]',
  '',
  '',
].join('\n');

/** A constructed `Response` reports `url: ''` -- only a fetched one carries the
 *  URL -- so the field is defined here to stand in for what fetch would give. */
function respondFrom(url: string, init?: ResponseInit): Response {
  const res = new Response(BODY, init);
  Object.defineProperty(res, 'url', { value: url, configurable: true });
  return res;
}

let off: (() => void) | undefined;
afterEach(() => {
  off?.();
  off = undefined;
});

describe('wire.open connection identity', () => {
  it('reports origin+path, hasQuery and contentType, and the query string appears NOWHERE', async () => {
    const events: WireDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    await readOpenAIStream(
      respondFrom('https://gateway.example.com/v1/chat/completions?api_key=sk-live-SECRET&x=1', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
      nullSink(),
    );

    const open = events.find((e) => e.type === 'wire.open') as any;
    expect(open.url).toBe('https://gateway.example.com/v1/chat/completions');
    expect(open.hasQuery).toBe(true);
    expect(open.status).toBe(200);
    expect(open.contentType).toBe('text/html; charset=utf-8');

    // Not just the open event: nothing this read emitted may carry it.
    const json = JSON.stringify(events);
    expect(json).not.toContain('api_key');
    expect(json).not.toContain('sk-live-SECRET');
    expect(json).not.toContain('?');
  });

  it('hasQuery is false, not absent, when the URL had no query string', async () => {
    const events: WireDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    await readOpenAIStream(
      respondFrom('https://api.openai.com/v1/chat/completions', {
        headers: { 'content-type': 'text/event-stream' },
      }),
      nullSink(),
    );
    const open = events.find((e) => e.type === 'wire.open') as any;
    expect(open.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(open.hasQuery).toBe(false);
    expect(open.contentType).toBe('text/event-stream');
  });

  it('absent fields stay ABSENT for a non-Response source -- never invented', async () => {
    const events: WireDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(BODY));
        c.close();
      },
    });
    await readOpenAIStream(stream, nullSink());

    const open = events.find((e) => e.type === 'wire.open') as any;
    expect(open.source).toBe('stream');
    // `in`, not `=== undefined`: a key present with an undefined value is a
    // confident "we looked and there is none", which is a different claim.
    expect('url' in open).toBe(false);
    expect('hasQuery' in open).toBe(false);
    expect('status' in open).toBe(false);
    expect('contentType' in open).toBe(false);
  });

  it('a Response with no URL omits url/hasQuery rather than reporting an empty string', async () => {
    const events: WireDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    // A bare constructed Response reports `url: ''`. Reporting that verbatim
    // would read as "served from the origin root", which is a confident wrong
    // answer, so both fields go absent together.
    await readOpenAIStream(new Response(BODY), nullSink());
    const open = events.find((e) => e.type === 'wire.open') as any;
    expect(open.status).toBe(200); // a Response always has one
    expect('url' in open).toBe(false);
    expect('hasQuery' in open).toBe(false);
    // The runtime gives a constructed Response a default content-type, and that
    // IS what the response states, so it is reported verbatim like any other.
    expect(open.contentType).toMatch(/^text\/plain/);
  });

  it('an unparseable URL is reported as absent rather than as a broken string', async () => {
    const events: WireDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    await readOpenAIStream(respondFrom('not a url at all'), nullSink());
    const open = events.find((e) => e.type === 'wire.open') as any;
    expect('url' in open).toBe(false);
    expect('hasQuery' in open).toBe(false);
    expect(open.status).toBe(200);
  });
});
