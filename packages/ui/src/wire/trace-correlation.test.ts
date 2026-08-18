// `traceId` and `label`: the app's grouping, carried, never inferred.
//
// A chat app running a tool loop or a set of sub-agents makes several model
// calls that belong to ONE logical turn. The kit cannot know that grouping --
// it sees one Response at a time -- so it does not guess: the app declares it
// and every event from that read carries it verbatim.
import { afterEach, describe, expect, it } from 'vitest';
import { readOpenAIStream } from './read';
import { consumeModelStream } from './consume';
import { toOpenAIMessages } from './encode';
import { subscribeWireDiagnostics, type KaiDiagnosticEvent, type WireDiagnosticEvent } from './diagnostics';

const nullSink = () =>
  ({
    appendText: () => {},
    appendReasoning: () => {},
    upsertTool: () => {},
    addSource: () => {},
  }) as any;

const BODY = [
  'data: {"choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}',
  '',
  'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
  '',
  'data: [DONE]',
  '',
  '',
].join('\n');

let off: (() => void) | undefined;
afterEach(() => {
  off?.();
  off = undefined;
});

describe('trace correlation', () => {
  it('two reads sharing a traceId with different labels carry both to EVERY event type', async () => {
    const events: KaiDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));

    await readOpenAIStream(new Response(BODY), nullSink(), {
      traceId: 'turn-42',
      label: 'planner',
    });
    await readOpenAIStream(new Response(BODY), nullSink(), {
      traceId: 'turn-42',
      label: 'executor',
    });

    // One logical turn, two calls, distinguishable.
    expect(new Set(events.map((e) => e.traceId))).toEqual(new Set(['turn-42']));
    expect(new Set(events.map((e) => e.label))).toEqual(new Set(['planner', 'executor']));
    expect(new Set(events.map((e) => e.streamId)).size).toBe(2);

    // EVERY type, not just the first one: a panel grouping by trace must not
    // find a hole where wire.close should be.
    const types = new Set(events.map((e) => e.type));
    expect(types).toEqual(new Set(['wire.open', 'wire.frame', 'wire.part', 'wire.close']));
    for (const e of events) {
      expect(e.traceId).toBe('turn-42');
      expect(typeof e.label).toBe('string');
    }

    const planner = events.filter((e) => e.label === 'planner');
    const executor = events.filter((e) => e.label === 'executor');
    expect(planner.length).toBe(executor.length);
    expect(planner.length).toBeGreaterThan(3);
  });

  it('wire.failed carries them too -- it fires before a single frame is read', async () => {
    const events: KaiDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    await expect(
      readOpenAIStream(new Response('{"error":{"code":"nope"}}', { status: 401 }), nullSink(), {
        traceId: 'turn-7',
        label: 'first-try',
      }),
    ).rejects.toMatchObject({ status: 401 });
    const failed = events.find((e) => e.type === 'wire.failed')!;
    expect(failed.traceId).toBe('turn-7');
    expect(failed.label).toBe('first-try');
  });

  it('consumeModelStream takes them directly, the same way it takes streamId', async () => {
    const events: KaiDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    async function* chunks() {
      yield { text: 'hi' };
      yield { finishReason: 'stop' };
    }
    await consumeModelStream(chunks(), nullSink(), { traceId: 'turn-9', label: 'direct' });
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.traceId).toBe('turn-9');
      expect(e.label).toBe('direct');
    }
  });

  it('ONE traceId spans the write path and the read path', async () => {
    // Encoding happens BEFORE a read opens, so there is no streamId to attach an
    // encode to and the kit will not invent one. The app's own id is the link,
    // and the two options bags spell it the same way on purpose.
    const events: KaiDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));

    toOpenAIMessages([{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }], {
      traceId: 'turn-42',
      label: 'round-1',
    });
    await readOpenAIStream(new Response(BODY), nullSink(), {
      traceId: 'turn-42',
      label: 'round-1',
    });

    const types = new Set(events.map((e) => e.type));
    expect(types).toContain('encode.request');
    expect(types).toContain('wire.close');
    for (const e of events) {
      expect(e.traceId).toBe('turn-42');
      expect(e.label).toBe('round-1');
    }
    // The encode is NOT pinned to the stream. It has no streamId at all, rather
    // than being attached to whichever stream happened to open next.
    const encode = events.find((e) => e.type === 'encode.request')!;
    expect('streamId' in encode).toBe(false);
  });

  it('an encode with no traceId carries NO correlation key at all', () => {
    const events: KaiDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    toOpenAIMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'hi' },
          { type: 'card', envelope: { type: 'weather', data: {} } as any },
        ],
      },
    ]);
    expect(events.length).toBeGreaterThan(1); // request AND a drop
    for (const e of events) {
      expect('traceId' in e).toBe(false);
      expect('label' in e).toBe(false);
      expect('streamId' in e).toBe(false);
    }
  });

  it('with neither supplied the KEYS ARE ABSENT -- not present-and-undefined', async () => {
    const events: KaiDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    await readOpenAIStream(new Response(BODY), nullSink());
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      // `in`, deliberately: a key present with an undefined value is the kit
      // claiming it looked and there was no trace, which is not a claim it is
      // in a position to make.
      expect('traceId' in e).toBe(false);
      expect('label' in e).toBe(false);
    }
  });
});
