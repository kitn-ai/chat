// THE METADATA/PAYLOAD BOUNDARY, asserted structurally rather than by eye.
//
// The rule, from the spec: if a value comes from the model, the end user, or the
// app's data, it is PAYLOAD; if it describes the shape, size, timing or identity
// of that value, it is METADATA. The default stream is metadata only, so a
// stranger who guesses `?kai-devtools=1` on a production site sees the shape of
// a conversation and not one word of it.
//
// What makes that reviewable is that every content-bearing value lives under ONE
// optional `payload` key. So the test is not "grep the field names": it walks
// every event, DELETES the payload key, and asserts no sentinel survives in the
// remainder. A new field that leaked content beside the metadata would fail this
// without anyone having to remember to check it.
import { afterEach, describe, expect, it } from 'vitest';
import { readOpenAIStream } from './read';
import { toOpenAIMessages } from './encode';
import {
  setWirePayloadCapture,
  subscribeWireDiagnostics,
  type WireDiagnosticEvent,
} from './diagnostics';
import type { AttachmentData } from '../components/attachment-types';
import type { ChatMessage } from '../elements/chat-types';

const nullSink = () =>
  ({
    appendText: () => {},
    appendReasoning: () => {},
    upsertTool: () => {},
    addSource: () => {},
  }) as any;

// One distinctive string per channel, so a failure names the leak.
const S = {
  text: 'SENTINEL-assistant-said-this',
  reasoning: 'SENTINEL-model-was-thinking-this',
  toolArgs: 'SENTINEL-tool-argument-value',
  sourceUrl: 'https://example.com/SENTINEL-cited-page',
  filename: 'SENTINEL-payslip.png',
  providerMessage: 'SENTINEL-your-key-sk-live-1234-is-invalid',
  droppedCard: 'SENTINEL-card-contents',
  // An IN-BAND error: the request succeeded and the stream itself carried the
  // failure. This is the one a developer chasing an empty turn is looking for.
  inBandError: 'SENTINEL-rate-limited-on-org-acme-prod',
};

const BODY = [
  `data: {"choices":[{"index":0,"delta":{"content":"${S.text}"},"finish_reason":null}]}`,
  '',
  `data: {"choices":[{"index":0,"delta":{"reasoning":"${S.reasoning}"},"finish_reason":null}]}`,
  '',
  `data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"lookup","arguments":"{\\"q\\":\\"${S.toolArgs}\\"}"}}]},"finish_reason":null}]}`,
  '',
  `data: {"choices":[{"index":0,"delta":{"annotations":[{"url_citation":{"url":"${S.sourceUrl}","title":"a page"}}]},"finish_reason":null}]}`,
  '',
  'data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}',
  '',
  'data: [DONE]',
  '',
  '',
].join('\n');

const attachment: AttachmentData = {
  id: 'f1',
  type: 'file',
  filename: S.filename,
  mediaType: 'image/png',
  url: 'data:image/png;base64,iVBORw0KGgo=',
};

const THREAD: ChatMessage[] = [
  { id: 'u1', role: 'user', parts: [{ type: 'file', attachment }] },
  {
    id: 'a1',
    role: 'assistant',
    parts: [
      { type: 'text', text: S.text },
      { type: 'card', envelope: { type: 'weather', data: { note: S.droppedCard } } as any },
    ],
  },
];

/** A 200 whose stream carries the failure in-band. `wire.close` reports it. */
const IN_BAND_ERROR_BODY = [
  `data: {"error":{"code":"rate_limit_exceeded","message":"${S.inBandError}"}}`,
  '',
  'data: [DONE]',
  '',
  '',
].join('\n');

/** Everything a full session emits: an encode, a read, a transport failure, and
 *  an in-band one. All three terminal events, so the boundary is asserted over
 *  every path that can carry a provider's own error text. */
async function driveEverything(): Promise<WireDiagnosticEvent[]> {
  const events: WireDiagnosticEvent[] = [];
  const off = subscribeWireDiagnostics((e) => events.push(e));
  try {
    toOpenAIMessages(THREAD);
    await readOpenAIStream(new Response(BODY), nullSink());
    await readOpenAIStream(
      new Response(JSON.stringify({ error: { code: 'invalid_api_key', message: S.providerMessage } }), {
        status: 401,
      }),
      nullSink(),
    ).catch(() => undefined);
    await readOpenAIStream(new Response(IN_BAND_ERROR_BODY), nullSink());
  } finally {
    off();
  }
  return events;
}

const SENTINELS = Object.values(S);

afterEach(() => {
  setWirePayloadCapture(false);
});

describe('the payload boundary', () => {
  it('OFF by default: not one sentinel appears anywhere in the stream', async () => {
    const events = await driveEverything();
    expect(events.length).toBeGreaterThan(5);
    const json = JSON.stringify(events);
    for (const sentinel of SENTINELS) {
      expect(json).not.toContain(sentinel);
    }
    // And nothing carries the key at all.
    for (const e of events) expect('payload' in e).toBe(false);
  });

  it('ON: the sentinels appear ONLY under .payload, never beside the metadata', async () => {
    setWirePayloadCapture(true);
    const events = await driveEverything();

    // Structural: strip the ONE key and assert the remainder is clean. This is
    // what makes the boundary reviewable -- a field that leaked content beside
    // the metadata fails here with no new assertion to remember.
    const stripped = events.map((e) => {
      const { payload: _payload, ...rest } = e as unknown as Record<string, unknown>;
      return rest;
    });
    const remainder = JSON.stringify(stripped);
    for (const sentinel of SENTINELS) {
      expect(remainder).not.toContain(sentinel);
    }

    // And they really did arrive -- otherwise the assertion above passes
    // vacuously against a switch that does nothing.
    const under = JSON.stringify(events.map((e) => (e as any).payload ?? null));
    for (const sentinel of SENTINELS) {
      expect(under).toContain(sentinel);
    }
  });

  it('ON: the query string is STILL never reported -- a credential is not payload', async () => {
    setWirePayloadCapture(true);
    const events: WireDiagnosticEvent[] = [];
    const off = subscribeWireDiagnostics((e) => events.push(e));
    const res = new Response(BODY);
    Object.defineProperty(res, 'url', {
      value: 'https://gw.example.com/v1/chat?api_key=sk-live-SECRET',
      configurable: true,
    });
    await readOpenAIStream(res, nullSink());
    off();
    expect(JSON.stringify(events)).not.toContain('sk-live-SECRET');
    expect((events[0] as any).url).toBe('https://gw.example.com/v1/chat');
  });

  it('ON: encode.request carries the body and the attachment FILENAMES', async () => {
    setWirePayloadCapture(true);
    const events: WireDiagnosticEvent[] = [];
    const off = subscribeWireDiagnostics((e) => events.push(e));
    toOpenAIMessages(THREAD);
    off();

    const req = events.find((e) => e.type === 'encode.request') as any;
    expect(req.payload.body).toEqual(toOpenAIMessages(THREAD));
    // Positionally aligned with the metadata array, so row N can be named.
    expect(req.payload.attachments).toEqual([{ filename: S.filename }]);
    expect(req.attachments[0].mediaType).toBe('image/png');
    // The name is not ALSO on the metadata row.
    expect('filename' in req.attachments[0]).toBe(false);
  });

  it('ON: encode.dropped carries the dropped part itself', async () => {
    setWirePayloadCapture(true);
    const events: WireDiagnosticEvent[] = [];
    const off = subscribeWireDiagnostics((e) => events.push(e));
    toOpenAIMessages(THREAD);
    off();
    const drop = events.find(
      (e) => e.type === 'encode.dropped' && (e as any).variant === 'card',
    ) as any;
    expect(drop.payload.part).toEqual(THREAD[1].parts[1]);
  });

  it('ON: wire.failed carries bodyText and the provider MESSAGE', async () => {
    setWirePayloadCapture(true);
    const events: WireDiagnosticEvent[] = [];
    const off = subscribeWireDiagnostics((e) => events.push(e));
    await readOpenAIStream(
      new Response(JSON.stringify({ error: { code: 'x', message: S.providerMessage } }), {
        status: 401,
      }),
      nullSink(),
    ).catch(() => undefined);
    off();
    const failed = events.find((e) => e.type === 'wire.failed') as any;
    expect(failed.payload.message).toBe(S.providerMessage);
    expect(failed.payload.bodyText).toContain(S.providerMessage);
    // Metadata beside it is unchanged.
    expect(failed.providerCode).toBe('x');
  });

  it('ON: wire.interrupted carries the error message, never beside errorName', async () => {
    setWirePayloadCapture(true);
    const events: WireDiagnosticEvent[] = [];
    const off = subscribeWireDiagnostics((e) => events.push(e));
    const boom = new TypeError('SENTINEL-socket-died-mid-turn');
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.error(boom);
      },
    });
    await readOpenAIStream(stream, nullSink()).catch(() => undefined);
    off();
    const cut = events.find((e) => e.type === 'wire.interrupted') as any;
    expect(cut.errorName).toBe('TypeError');
    expect(cut.payload.message).toBe('SENTINEL-socket-died-mid-turn');
    const { payload: _p, ...rest } = cut;
    expect(JSON.stringify(rest)).not.toContain('SENTINEL-socket-died-mid-turn');
  });

  it('ON: wire.close carries the in-band error MESSAGE, like both its siblings', async () => {
    // All three terminal events -- close, failed, interrupted -- face the same
    // hazard (a provider message can echo request content back) and now answer
    // it identically. An asymmetry between them reads as an oversight and gets
    // "fixed" later by someone with less context.
    setWirePayloadCapture(true);
    const events: WireDiagnosticEvent[] = [];
    const off = subscribeWireDiagnostics((e) => events.push(e));
    await readOpenAIStream(new Response(IN_BAND_ERROR_BODY), nullSink());
    off();

    const close = events.find((e) => e.type === 'wire.close') as any;
    expect(close.payload.message).toBe(S.inBandError);
    // The metadata default is untouched: the CODE travels, the message does not.
    expect(close.errorCode).toBe('rate_limit_exceeded');
    const { payload: _p, ...rest } = close;
    expect(JSON.stringify(rest)).not.toContain(S.inBandError);
  });

  it('OFF: wire.close reports the error CODE and never the message', async () => {
    const events: WireDiagnosticEvent[] = [];
    const off = subscribeWireDiagnostics((e) => events.push(e));
    await readOpenAIStream(new Response(IN_BAND_ERROR_BODY), nullSink());
    off();
    const close = events.find((e) => e.type === 'wire.close') as any;
    expect(close.errorCode).toBe('rate_limit_exceeded');
    expect('payload' in close).toBe(false);
    expect(JSON.stringify(close)).not.toContain(S.inBandError);
  });

  it('ON: encode.request reports bytes, exactly, because the body is materialized anyway', async () => {
    setWirePayloadCapture(true);
    const events: WireDiagnosticEvent[] = [];
    const off = subscribeWireDiagnostics((e) => events.push(e));
    const body = toOpenAIMessages(THREAD);
    off();
    const req = events.find((e) => e.type === 'encode.request') as any;
    // EXACT, not an estimate: an estimate that looked like a measurement would
    // be worse than the absent field.
    expect(req.bytes).toBe(new TextEncoder().encode(JSON.stringify(body)).length);
  });

  it('turning it back OFF stops the capture for the next read', async () => {
    setWirePayloadCapture(true);
    setWirePayloadCapture(false);
    const events = await driveEverything();
    expect(JSON.stringify(events)).not.toContain(S.text);
  });
});
