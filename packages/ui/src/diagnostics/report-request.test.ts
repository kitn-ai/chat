// `reportRequest` — the app's DELIBERATE DISCLOSURE of what it actually sent.
//
// THE QUESTION THIS ANSWERS, in the owner's words: "what prompts are being
// initialized at the beginning? are there additional prompts being added? is
// the context the original context or has it been rewritten?"
//
// The kit cannot answer any of that on its own, and the reason is structural
// rather than a gap: in the normal shape the app's SERVER ROUTE adds the system
// prompt, picks the model, and performs any RAG or guardrail injection, and none
// of it passes through the kit. `encode.request.systemMessages` is always 0 for
// exactly that reason -- it says "the system prompt is being added somewhere I
// cannot see". This is how a developer makes that somewhere visible, by choosing
// to hand it over.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportRequest } from './report-request';
import {
  setWirePayloadCapture,
  subscribeWireDiagnostics,
  type KaiDiagnosticEvent,
  type WireDiagnosticEvent,
} from '../wire/diagnostics';

let off: (() => void) | undefined;
let events: KaiDiagnosticEvent[] = [];
const listen = () => {
  off?.();
  events = [];
  off = subscribeWireDiagnostics((e) => events.push(e));
};
afterEach(() => {
  off?.();
  off = undefined;
  setWirePayloadCapture(false);
});

const req = () => events.find((e) => e.type === 'app.request') as any;

const BODY = {
  model: 'anthropic/claude-sonnet-4.5',
  messages: [
    { role: 'system', content: 'You are a helpful assistant. Never mention pineapples.' },
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi' },
    { role: 'user', content: 'again' },
  ],
  tools: [{ type: 'function', function: { name: 'search' } }],
};

describe('reportRequest', () => {
  it('★ makes the invisible system prompt visible, as a COUNT', () => {
    listen();
    reportRequest(BODY);
    const e = req();
    // The finding: the kit's own encode says 0 system messages because its
    // content model has no system role at all; the real request has one, added
    // by a layer the kit never sees. Two facts, side by side, is the answer.
    expect(e.systemMessages).toBe(1);
    expect(e.byRole).toEqual({ system: 1, user: 2, assistant: 1 });
    expect(e.messages).toBe(4);
  });

  it('systemMessages is a stated ZERO when there is a messages array and no system role', () => {
    listen();
    reportRequest({ messages: [{ role: 'user', content: 'hi' }] });
    const e = req();
    // Zero is the finding here too -- "nothing is setting a system prompt at
    // all" -- so it must be distinguishable from "there was nothing to count".
    expect(e.systemMessages).toBe(0);
    expect('systemMessages' in e).toBe(true);
  });

  it('with no messages array the count keys are ABSENT, not zero', () => {
    listen();
    reportRequest({ model: 'gpt-4o' });
    const e = req();
    expect('messages' in e).toBe(false);
    expect('byRole' in e).toBe(false);
    expect('systemMessages' in e).toBe(false);
    expect(e.model).toBe('gpt-4o');
  });

  it('reports the tools array by LENGTH, and an empty one is 0 rather than absent', () => {
    listen();
    reportRequest({ tools: [{ a: 1 }, { b: 2 }] });
    expect(req().tools).toBe(2);

    listen();
    reportRequest({ tools: [] });
    // Present-but-empty is a real state and a different finding from "no tools
    // key at all": it says the app meant to send tools and sent none.
    expect(req().tools).toBe(0);

    listen();
    reportRequest({ messages: [] });
    expect('tools' in req()).toBe(false);

    listen();
    reportRequest({ tools: 'not an array' });
    expect('tools' in req()).toBe(false);
  });

  it('★ model is read VERBATIM and never inferred; absent stays absent', () => {
    listen();
    reportRequest({ model: 'openai/gpt-4o-2024-08-06', messages: [] });
    expect(req().model).toBe('openai/gpt-4o-2024-08-06');

    listen();
    reportRequest({ messages: [{ role: 'user', content: 'hi' }] });
    // No guess from the URL, from a default, or from anything else.
    expect('model' in req()).toBe(false);

    listen();
    reportRequest({ model: { name: 'not a string' } });
    expect('model' in req()).toBe(false);
  });

  it('carries the app traceId/label and NO streamId -- a request is not a stream', () => {
    listen();
    reportRequest(BODY, { traceId: 'turn-42', label: 'planner' });
    const e = req();
    expect(e.traceId).toBe('turn-42');
    expect(e.label).toBe('planner');
    expect('streamId' in e).toBe(false);
  });

  it('with no opts, no correlation key is invented from timing or anything else', () => {
    listen();
    reportRequest(BODY);
    const e = req();
    expect('traceId' in e).toBe(false);
    expect('label' in e).toBe(false);
    expect('streamId' in e).toBe(false);
  });

  it('reports url as origin+path with hasQuery, never the query string itself', () => {
    listen();
    reportRequest(BODY, { url: 'https://app.example.com/api/chat?api_key=sk-live-SECRET' });
    const e = req();
    expect(e.url).toBe('https://app.example.com/api/chat');
    expect(e.hasQuery).toBe(true);
    expect(JSON.stringify(events)).not.toContain('sk-live-SECRET');

    listen();
    reportRequest(BODY, { url: '/api/chat' });
    // A relative URL is normal for an app's own fetch, and it has no origin to
    // report. Reported as absent rather than resolved against a guess.
    expect('url' in req()).toBe(false);
  });

  it('is a NO-OP when nothing is subscribed', () => {
    const before = events.length;
    reportRequest(BODY);
    expect(events.length).toBe(before);
  });
});

describe('reportRequest never throws on a body it cannot introspect', () => {
  const cases: Array<[string, unknown]> = [
    ['a string', 'just some text'],
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['an array', [1, 2, 3]],
    ['FormData', (() => { const f = new FormData(); f.append('a', 'b'); return f; })()],
    ['a ReadableStream', new ReadableStream()],
    ['a Blob', new Blob(['hi'])],
    ['a URLSearchParams', new URLSearchParams('a=b')],
  ];

  for (const [name, body] of cases) {
    it(`survives ${name}`, () => {
      listen();
      expect(() => reportRequest(body)).not.toThrow();
      // It still emits: "the app sent something I could not describe" is itself
      // worth reporting, and a silent skip would be the quiet decision this
      // codebase refuses.
      expect(req()).toBeDefined();
      expect(req().type).toBe('app.request');
    });
  }

  it('survives a Proxy that throws on every property read', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('nope');
        },
        has() {
          throw new Error('nope');
        },
      },
    );
    listen();
    expect(() => reportRequest(hostile)).not.toThrow();
    expect(req().type).toBe('app.request');
    // Nothing could be read, so nothing is claimed.
    expect('messages' in req()).toBe(false);
    expect('model' in req()).toBe(false);
  });

  it('survives a circular body, and still emits', () => {
    const circular: Record<string, unknown> = { model: 'gpt-4o', messages: [] };
    circular.self = circular;
    listen();
    expect(() => reportRequest(circular)).not.toThrow();
    expect(req().model).toBe('gpt-4o');
  });

  it('survives a body whose messages entries are hostile', () => {
    const body = {
      messages: [
        null,
        'a string',
        42,
        new Proxy({}, { get() { throw new Error('nope'); } }),
        { role: 'user' },
      ],
    };
    listen();
    expect(() => reportRequest(body as unknown)).not.toThrow();
    const e = req();
    expect(e.messages).toBe(5);
    // Only the entry that actually stated a role is counted; the rest are not
    // guessed at, and nothing is fabricated for them.
    expect(e.byRole).toEqual({ user: 1 });
  });

  it('a subscriber that throws does not break the caller', () => {
    off?.();
    events = [];
    const boom = subscribeWireDiagnostics(() => {
      throw new Error('panel bug');
    });
    expect(() => reportRequest(BODY)).not.toThrow();
    boom();
  });
});

describe('reportRequest measurement gating', () => {
  it('does NOT stringify the body when payload is off: bytes is absent', () => {
    listen();
    reportRequest(BODY);
    // Same ruling as encode.request.bytes and the per-attachment size: if
    // measuring costs materializing the body, it waits for payload capture.
    expect('bytes' in req()).toBe(false);
  });

  it('reports exact bytes when payload is on', () => {
    setWirePayloadCapture(true);
    listen();
    reportRequest(BODY);
    expect(req().bytes).toBe(new TextEncoder().encode(JSON.stringify(BODY)).length);
  });

  it('never touches the body when nothing is subscribed', () => {
    setWirePayloadCapture(true);
    const touched = vi.fn();
    const watched = new Proxy(
      { messages: [] },
      {
        get(t, k, r) {
          touched();
          return Reflect.get(t, k, r);
        },
      },
    );
    off?.();
    off = undefined;
    reportRequest(watched);
    expect(touched).not.toHaveBeenCalled();
  });

  it('★ omits bytes for a body with NO JSON FORM, rather than reporting 2', () => {
    // `JSON.stringify` turns each of these into `"{}"`, so the old code reported
    // `bytes: 2` for a FormData carrying a 40 MB upload. Literally "the byte
    // length of the body as JSON", and read by any panel as "how big was this
    // request" -- the confident-number class this stream avoids everywhere else.
    setWirePayloadCapture(true);

    for (const [name, body] of [
      ['FormData', (() => { const f = new FormData(); f.append('file', new Blob(['x'.repeat(1000)])); return f; })()],
      ['ReadableStream', new ReadableStream()],
      ['URLSearchParams', new URLSearchParams('a=b')],
      ['a Map', new Map([['a', 1]])],
    ] as Array<[string, unknown]>) {
      listen();
      reportRequest(body);
      expect(`${name}: ${'bytes' in req()}`).toBe(`${name}: false`);
    }
  });

  it('reports a Blob by its OWN size -- that is a measurement, not a guess', () => {
    setWirePayloadCapture(true);
    listen();
    reportRequest(new Blob(['hello']));
    // A Blob genuinely knows its byte length, exactly and in O(1). Reporting it
    // is the same act as reporting a string's encoded length; refusing would
    // discard a true fact. What is refused is the JSON length of a body that
    // has no JSON form.
    expect(req().bytes).toBe(5);
  });

  it('reports ArrayBuffer and typed-array bodies by byteLength', () => {
    setWirePayloadCapture(true);
    listen();
    reportRequest(new Uint8Array(64));
    expect(req().bytes).toBe(64);

    listen();
    reportRequest(new ArrayBuffer(128));
    expect(req().bytes).toBe(128);
  });

  it('a plain object and a string still report exact bytes', () => {
    setWirePayloadCapture(true);
    listen();
    reportRequest(BODY);
    expect(req().bytes).toBe(new TextEncoder().encode(JSON.stringify(BODY)).length);

    listen();
    reportRequest('héllo');
    // The string IS the body, so its own encoded length is the answer -- 6
    // bytes for 5 characters.
    expect(req().bytes).toBe(6);

    listen();
    reportRequest([{ role: 'user' }]);
    expect(req().bytes).toBe(new TextEncoder().encode('[{"role":"user"}]').length);
  });

  it('honours a toJSON declaration, since that IS the body\'s wire form', () => {
    setWirePayloadCapture(true);
    class Envelope {
      toJSON() {
        return { messages: [{ role: 'user', content: 'hi' }] };
      }
    }
    listen();
    reportRequest(new Envelope());
    expect(req().bytes).toBe(
      new TextEncoder().encode(JSON.stringify(new Envelope())).length,
    );
  });

  it('an object that merely HAS a size property is not mistaken for a Blob', () => {
    setWirePayloadCapture(true);
    listen();
    // A plain object is JSON, so its JSON length is the honest answer -- the
    // `size` field is just data and must not be read as a byte count.
    reportRequest({ size: 999999 });
    expect(req().bytes).toBe(new TextEncoder().encode('{"size":999999}').length);
  });

  it('omits bytes for a circular body rather than reporting a wrong one', () => {
    setWirePayloadCapture(true);
    const circular: Record<string, unknown> = { messages: [] };
    circular.self = circular;
    listen();
    reportRequest(circular);
    expect('bytes' in req()).toBe(false);
  });
});
