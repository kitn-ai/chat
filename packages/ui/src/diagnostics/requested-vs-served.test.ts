// "You asked for Claude, the response says gpt-4o."
//
// The devtools spec asks for this finding and nothing in the kit could produce
// it, because the two halves live on opposite sides of the transport: the
// REQUESTED model is in a body the kit never sees, and the SERVED model comes
// off the response stream. `reportRequest` supplies the first half; `wire.frame`
// already carried the second.
//
// ★ THEY ARE TWO INDEPENDENT FACTS THAT A PANEL COMPARES, AND NEVER RECONCILES.
// The spec's rule -- "never derive one from the other, and render served as
// absent when the stream did not say" -- applies to the requested half too. A
// display that filled either gap from the other would agree with itself in
// exactly the mismatch case the pair exists to catch.
import { afterEach, describe, expect, it } from 'vitest';
import { reportRequest } from './report-request';
import { readOpenAIStream } from '../wire/read';
import { subscribeWireDiagnostics, type WireDiagnosticEvent } from '../wire/diagnostics';

const nullSink = () =>
  ({
    appendText: () => {},
    appendReasoning: () => {},
    upsertTool: () => {},
    addSource: () => {},
  }) as any;

const streamSaying = (model: string | null) =>
  [
    `data: {${model === null ? '' : `"model":"${model}",`}"choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":"stop"}]}`,
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

describe('requested vs served model', () => {
  it('★ surfaces the mismatch: asked for Claude, served gpt-4o', async () => {
    const events: WireDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));

    reportRequest(
      { model: 'anthropic/claude-sonnet-4.5', messages: [{ role: 'user', content: 'hi' }] },
      { traceId: 'turn-1' },
    );
    await readOpenAIStream(new Response(streamSaying('openai/gpt-4o-2024-08-06')), nullSink(), {
      traceId: 'turn-1',
    });

    const requested = (events.find((e) => e.type === 'app.request') as any).model;
    const served = (events.find((e) => e.type === 'wire.frame' && (e as any).model) as any).model;

    expect(requested).toBe('anthropic/claude-sonnet-4.5');
    expect(served).toBe('openai/gpt-4o-2024-08-06');
    expect(requested).not.toBe(served); // the finding, in one line

    // One trace ties the two halves together; nothing else does, and nothing
    // guesses at the pairing from timing.
    for (const e of events) expect(e.traceId).toBe('turn-1');
  });

  it('a stream that states no model leaves SERVED absent -- the request does not fill it', async () => {
    const events: WireDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));

    reportRequest({ model: 'anthropic/claude-sonnet-4.5' }, { traceId: 'turn-2' });
    await readOpenAIStream(new Response(streamSaying(null)), nullSink(), { traceId: 'turn-2' });

    expect((events.find((e) => e.type === 'app.request') as any).model).toBe(
      'anthropic/claude-sonnet-4.5',
    );
    // Not one frame claims a model, even though the request stated one.
    const frames = events.filter((e) => e.type === 'wire.frame') as any[];
    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) expect('model' in f).toBe(false);
  });

  it('a request that states no model leaves REQUESTED absent -- the stream does not fill it', async () => {
    const events: WireDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));

    // The common shape: the route picks the model server-side, so the client
    // body never names one. Absent is the honest answer, and it is itself the
    // finding -- "this app is not choosing the model here".
    reportRequest({ messages: [{ role: 'user', content: 'hi' }] }, { traceId: 'turn-3' });
    await readOpenAIStream(new Response(streamSaying('openai/gpt-4o')), nullSink(), {
      traceId: 'turn-3',
    });

    expect('model' in (events.find((e) => e.type === 'app.request') as any)).toBe(false);
    expect((events.find((e) => e.type === 'wire.frame' && (e as any).model) as any).model).toBe(
      'openai/gpt-4o',
    );
  });
});
