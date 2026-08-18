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
import { reportRequest } from '../diagnostics/report-request';
import {
  setWirePayloadCapture,
  subscribeWireDiagnostics,
  // The FULL union. This file now sweeps both layers, and both ride one emitter.
  type KaiDiagnosticEvent,
} from './diagnostics';
import type { AttachmentData } from '../components/attachment-types';
import type { ChatMessage } from '../elements/chat-types';
// The ELEMENT layer emits onto this same stream, so it is swept by this same
// file rather than by a second one with a second idea of the rule. See the
// element block at the bottom.
import '../elements/conversation-list';
import '../elements/agent-card';
import { emitElementRegistry } from '../elements/element-diagnostics';

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
  // The app's own disclosure. A system prompt is the single most sensitive
  // string an app owns -- it is the product -- so it belongs in this sweep.
  systemPrompt: 'SENTINEL-you-are-acme-support-never-discuss-refunds',
  toolDefinition: 'SENTINEL-internal-tool-lookup-customer-ssn',
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

/** What an app hands to `reportRequest`: the real body, system prompt and all. */
const APP_BODY = {
  model: 'anthropic/claude-sonnet-4.5',
  messages: [
    { role: 'system', content: S.systemPrompt },
    { role: 'user', content: S.text },
  ],
  tools: [{ type: 'function', function: { name: S.toolDefinition } }],
};

/** A 200 whose stream carries the failure in-band. `wire.close` reports it. */
const IN_BAND_ERROR_BODY = [
  `data: {"error":{"code":"rate_limit_exceeded","message":"${S.inBandError}"}}`,
  '',
  'data: [DONE]',
  '',
  '',
].join('\n');

/** Everything a full session emits: the app's own disclosure, an encode, a read,
 *  a transport failure, and an in-band one. All three terminal events, so the
 *  boundary is asserted over every path that can carry a provider's own error
 *  text -- and over the one path that carries the APP's text. */
async function driveEverything(): Promise<KaiDiagnosticEvent[]> {
  const events: KaiDiagnosticEvent[] = [];
  const off = subscribeWireDiagnostics((e) => events.push(e));
  try {
    reportRequest(APP_BODY, { url: 'https://app.example.com/api/chat' });
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
    const events: KaiDiagnosticEvent[] = [];
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
    const events: KaiDiagnosticEvent[] = [];
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
    const events: KaiDiagnosticEvent[] = [];
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
    const events: KaiDiagnosticEvent[] = [];
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
    const events: KaiDiagnosticEvent[] = [];
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
    const events: KaiDiagnosticEvent[] = [];
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
    const events: KaiDiagnosticEvent[] = [];
    const off = subscribeWireDiagnostics((e) => events.push(e));
    await readOpenAIStream(new Response(IN_BAND_ERROR_BODY), nullSink());
    off();
    const close = events.find((e) => e.type === 'wire.close') as any;
    expect(close.errorCode).toBe('rate_limit_exceeded');
    expect('payload' in close).toBe(false);
    expect(JSON.stringify(close)).not.toContain(S.inBandError);
  });

  it('ON: attachment sizes are reported, and they are EXACT', async () => {
    setWirePayloadCapture(true);
    const events: KaiDiagnosticEvent[] = [];
    const off = subscribeWireDiagnostics((e) => events.push(e));
    toOpenAIMessages(THREAD);
    off();

    const entry = (events.find((e) => e.type === 'encode.request') as any).attachments[0];
    // `iVBORw0KGgo=` is 12 base64 characters standing for exactly 8 bytes. Not
    // an estimate, not a threshold, not a prefix probe -- the same exact count
    // the metadata stream simply declines to pay for when nobody armed payload.
    expect(entry.bytes).toBe(8);
    expect(entry.mediaType).toBe('image/png');
    // A size is metadata, so it stays OUTSIDE the payload key even though it is
    // only computed when payload is on. What gates it is cost, not sensitivity.
    expect((events.find((e) => e.type === 'encode.request') as any).payload.attachments).toEqual([
      { filename: S.filename },
    ]);
  });

  it('ON: encode.request reports bytes, exactly, because the body is materialized anyway', async () => {
    setWirePayloadCapture(true);
    const events: KaiDiagnosticEvent[] = [];
    const off = subscribeWireDiagnostics((e) => events.push(e));
    const body = toOpenAIMessages(THREAD);
    off();
    const req = events.find((e) => e.type === 'encode.request') as any;
    // EXACT, not an estimate: an estimate that looked like a measurement would
    // be worse than the absent field.
    expect(req.bytes).toBe(new TextEncoder().encode(JSON.stringify(body)).length);
  });

  it('OFF: app.request describes the system prompt without quoting it', async () => {
    const events: KaiDiagnosticEvent[] = [];
    const off = subscribeWireDiagnostics((e) => events.push(e));
    reportRequest(APP_BODY, { url: 'https://app.example.com/api/chat?key=sk-live-SECRET' });
    off();

    const e = events.find((ev) => ev.type === 'app.request') as any;
    // The FINDING travels: there is one system message, on this route, for this
    // model. The prompt's text -- an app's most sensitive string, since it IS
    // the product -- does not, and neither does a tool definition's name.
    expect(e.systemMessages).toBe(1);
    expect(e.byRole).toEqual({ system: 1, user: 1 });
    expect(e.tools).toBe(1);
    expect(e.model).toBe('anthropic/claude-sonnet-4.5');
    expect(e.url).toBe('https://app.example.com/api/chat');

    const json = JSON.stringify(e);
    expect(json).not.toContain(S.systemPrompt);
    expect(json).not.toContain(S.toolDefinition);
    expect(json).not.toContain(S.text);
    expect(json).not.toContain('sk-live-SECRET');
    expect('payload' in e).toBe(false);
  });

  it('ON: app.request carries the whole body, and only under .payload', async () => {
    setWirePayloadCapture(true);
    const events: KaiDiagnosticEvent[] = [];
    const off = subscribeWireDiagnostics((e) => events.push(e));
    reportRequest(APP_BODY, { url: 'https://app.example.com/api/chat?key=sk-live-SECRET' });
    off();

    const e = events.find((ev) => ev.type === 'app.request') as any;
    expect(e.payload.body).toBe(APP_BODY); // by reference, unmodified
    expect(JSON.stringify(e.payload)).toContain(S.systemPrompt);

    const { payload: _p, ...rest } = e;
    expect(JSON.stringify(rest)).not.toContain(S.systemPrompt);
    expect(JSON.stringify(rest)).not.toContain(S.toolDefinition);
    // The credential is out even here: a query string is not conversation
    // content, so the payload switch does not govern it.
    expect(JSON.stringify(e)).not.toContain('sk-live-SECRET');
  });

  it('turning it back OFF stops the capture for the next read', async () => {
    setWirePayloadCapture(true);
    setWirePayloadCapture(false);
    const events = await driveEverything();
    expect(JSON.stringify(events)).not.toContain(S.text);
  });
});

// ---------------------------------------------------------------------------
// THE ELEMENT LAYER, swept by the SAME rule and in the SAME file.
//
// `element.*` events ride this one emitter, so a panel receives them mixed in
// with the wire events and a reviewer should be able to check the boundary in
// one place. Extending this sweep rather than writing a second one is
// deliberate: two boundary tests are two chances for the rule to drift, and the
// half that drifts is invisible until it leaks.
//
// THE INVARIANT IS STRONGER HERE, and that is the whole point of the block.
// The wire events carry content under an opt-in `payload` key. The element
// events carry NO payload key at all, in either signal state -- everything they
// report is a tag, a prop name, a kind, a count, a length, or a shape drawn
// from a closed vocabulary. So the assertion is not "content moved under one
// key", it is "there is no content, and the switch does not change that".
//
// That matters more than it looks. Element props hold the entire conversation,
// the user's own drafted text, conversation titles and file names -- and unlike
// the wire code, this ships to every consumer of the elements bundle whether or
// not they ever parse a stream. If the payload switch ever grew an element
// branch, this block fails rather than the leak shipping.
// ---------------------------------------------------------------------------

/**
 * A SHORT, unmistakable token at the head of every element sentinel.
 *
 * Long descriptive sentinels alone are not enough here, and a mutation proved
 * it: a leak that shipped `raw.slice(0, 20)` beside the length was caught only
 * by an exact-value assertion, because the 20-character prefix cut through the
 * MIDDLE of every sentinel and `toContain(fullSentinel)` stayed happily green.
 * A truncation is the most likely way this boundary ever breaks -- it is the
 * obvious "safe" alternative someone reaches for instead of a length -- so the
 * sweep has to catch a partial leak, not just a whole one.
 *
 * Six characters, so any truncation that keeps six or more characters of a
 * consumer value trips it.
 */
const LEAK = 'zQ7leak';

/** Element sentinels, kept SEPARATE from `S` because the invariant differs:
 *  these must never appear ANYWHERE, under any key, in either state -- whereas
 *  `S`'s are REQUIRED to show up under `.payload` when the switch is on. */
const E = {
  title: `${LEAK}-conversation-was-titled-this`,
  id: `${LEAK}-conversation-id-value`,
  nested: `${LEAK}-buried-three-levels-down`,
  key: `${LEAK}-an-object-KEY-not-a-value`,
  attrText: `${LEAK}-typed-into-an-attribute`,
  agentLabel: `${LEAK}-agent-status-label`,
};

/** The full strings AND the shared head. The head is the one that survives a
 *  truncation, so it is the assertion that actually holds the line. */
const ELEMENT_SENTINELS = [...Object.values(E), LEAK];

/** Every wrong thing a consumer can do that this layer reports, with a sentinel
 *  planted in each channel a value could be read from: item values, a nested
 *  value, an object KEY, and raw attribute text. */
function driveElements(): KaiDiagnosticEvent[] {
  const events: KaiDiagnosticEvent[] = [];
  const off = subscribeWireDiagnostics((e) => events.push(e));
  try {
    const list = document.createElement('kai-conversations') as unknown as HTMLElement &
      Record<string, unknown>;
    document.body.appendChild(list);

    const seeded = [
      {
        id: E.id,
        title: E.title,
        scope: { type: 'collection' },
        messageCount: 3,
        meta: { deep: { deeper: E.nested } },
        [E.key]: 'x',
      },
      { id: `${E.id}-2`, title: `${E.title}-2`, scope: { type: 'collection' }, messageCount: 1 },
    ];

    list.conversations = seeded;
    list.conversations = seeded; // same-array-reference
    list.conversations = [...seeded]; // mutated-in-place

    // The attribute channel, on an element that survives the misuse, in four
    // shapes: raw text, the stringified-object marker with text appended,
    // valid JSON holding a sentinel, and a long value whose LENGTH is reported.
    const card = document.createElement('kai-agent-card') as HTMLElement & Record<string, unknown>;
    document.body.appendChild(card);
    card.setAttribute('status', E.attrText);
    card.setAttribute('status', `[object Object]${E.attrText}`);
    card.setAttribute('status', JSON.stringify({ [E.key]: E.agentLabel }));
    card.setAttribute('status', `${E.agentLabel}-`.repeat(40));

    // The registry snapshot, taken while the sentinel-bearing props are live on
    // a mounted element — so "it reports tags, not the state of the props"
    // is asserted rather than assumed from reading it.
    emitElementRegistry();

    list.remove();
    card.remove();
  } finally {
    off();
  }
  return events;
}

const elementEvents = (events: KaiDiagnosticEvent[]) =>
  events.filter((e) => e.type.startsWith('element.'));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the payload boundary — element events', () => {
  it('OFF: no sentinel anywhere, and no element event carries a payload key', () => {
    const events = driveElements();

    // Non-vacuity first: the assertions below are over something.
    expect(elementEvents(events).length).toBeGreaterThan(3);

    const json = JSON.stringify(events);
    for (const sentinel of ELEMENT_SENTINELS) {
      expect(json, `leaked: ${sentinel}`).not.toContain(sentinel);
    }
    for (const e of elementEvents(events)) expect('payload' in e).toBe(false);
  });

  it('ON: turning payload capture on changes NOTHING about the element events', () => {
    setWirePayloadCapture(true);
    const events = driveElements();

    expect(elementEvents(events).length).toBeGreaterThan(3);

    // The stronger claim: not "content moved under one key" but "there is no
    // content", in the state where the wire layer starts emitting some.
    const json = JSON.stringify(events);
    for (const sentinel of ELEMENT_SENTINELS) {
      expect(json, `leaked with payload ON: ${sentinel}`).not.toContain(sentinel);
    }
    for (const e of elementEvents(events)) expect('payload' in e).toBe(false);

    // Structural, exactly as the wire block does it: strip the one key and the
    // remainder must still be clean. Vacuous here today by construction — and
    // that is the assertion. The day an element event grows a payload branch,
    // this is what makes it obey the same rule instead of inventing a new one.
    const stripped = events.map((e) => {
      const { payload: _payload, ...rest } = e as unknown as Record<string, unknown>;
      return rest;
    });
    const remainder = JSON.stringify(stripped);
    for (const sentinel of ELEMENT_SENTINELS) expect(remainder).not.toContain(sentinel);
  });

  it('ON: the switch really WAS on — proven on the wire side in the same state', async () => {
    // Without this the test above passes just as well against a switch that
    // does nothing, which is the failure mode that makes a boundary test
    // decorative. So: same signal state, drive the wire, and require that a
    // payload key DID appear there.
    setWirePayloadCapture(true);
    const wire = await driveEverything();
    expect(wire.some((e) => 'payload' in (e as unknown as Record<string, unknown>))).toBe(true);
  });

  it('ON: one mixed session — neither sentinel set survives stripping .payload', async () => {
    // The sweep the file exists for, over BOTH layers at once, because that is
    // how a panel actually receives them.
    setWirePayloadCapture(true);
    const events: KaiDiagnosticEvent[] = [];
    const off = subscribeWireDiagnostics((e) => events.push(e));
    try {
      toOpenAIMessages(THREAD);
      await readOpenAIStream(new Response(BODY), nullSink());
      driveElements();
    } finally {
      off();
    }

    // Both layers really emitted.
    expect(elementEvents(events).length).toBeGreaterThan(3);
    expect(events.some((e) => e.type.startsWith('wire.'))).toBe(true);

    const stripped = events.map((e) => {
      const { payload: _payload, ...rest } = e as unknown as Record<string, unknown>;
      return rest;
    });
    const remainder = JSON.stringify(stripped);
    for (const sentinel of [...SENTINELS, ...ELEMENT_SENTINELS]) {
      expect(remainder, `leaked beside the metadata: ${sentinel}`).not.toContain(sentinel);
    }
  });

  it('a long attribute is reported by LENGTH — a truncation would ship a prefix', () => {
    const events = driveElements();
    const previews = events
      .filter((e) => e.type === 'element.violation')
      .map((e) => (e as unknown as { valuePreview?: string }).valuePreview)
      .filter((p): p is string => p !== undefined);

    expect(previews.length).toBeGreaterThan(0);
    // The one field that reads the raw text at all. `string(len=N)` is the only
    // form that can carry an arbitrary consumer value, and it carries a number.
    const longValue = `${E.agentLabel}-`.repeat(40);
    expect(previews).toContain(`string(len=${longValue.length})`);
    for (const sentinel of ELEMENT_SENTINELS) {
      expect(JSON.stringify(previews)).not.toContain(sentinel);
    }
  });

  it('the sentinel search can FIND one — otherwise this whole block is decoration', () => {
    const planted = JSON.stringify([{ type: 'element.violation', leaked: E.title }]);
    expect(planted).toContain(E.title);
    expect(JSON.stringify(driveElements())).not.toContain(E.title);
  });
});
