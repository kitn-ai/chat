// A read that DIES has to say so.
//
// Before this, a stream that errored mid-read -- the underlying ReadableStream
// erroring, the app aborting its fetch -- emitted `wire.open` and then nothing
// at all. No close, no failed. A panel showed that stream open forever, which
// in an observability tool is a request that silently vanished, and "the one
// that never finished" is exactly the request someone is looking for.
//
// The event is added around the read; it must not swallow, alter or delay the
// error the caller has always seen.
import { afterEach, describe, expect, it } from 'vitest';
import { readOpenAIStream } from './read';
import { subscribeWireDiagnostics, type KaiDiagnosticEvent, type WireDiagnosticEvent } from './diagnostics';

const nullSink = () =>
  ({
    appendText: () => {},
    appendReasoning: () => {},
    upsertTool: () => {},
    addSource: () => {},
  }) as any;

const enc = new TextEncoder();
const settle = () => new Promise((r) => setTimeout(r, 0));

/** A stream that yields one good frame, then whatever `boom` is. */
function dyingStream(boom: unknown) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    stream,
    async run() {
      controller.enqueue(
        enc.encode('data: {"choices":[{"index":0,"delta":{"content":"hi"}}]}\n\n'),
      );
      await settle();
      controller.error(boom);
    },
  };
}

let off: (() => void) | undefined;
afterEach(() => {
  off?.();
  off = undefined;
});

describe('wire.interrupted', () => {
  it('a stream that errors mid-read emits open → frame → interrupted, with counts', async () => {
    const events: KaiDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));

    const boom = new TypeError('network went away');
    const dying = dyingStream(boom);
    const reading = readOpenAIStream(dying.stream, nullSink(), { traceId: 'turn-1' });
    const settled = expect(reading).rejects.toBe(boom); // IDENTITY, not shape
    await dying.run();
    await settled;

    const types = events.map((e) => e.type);
    expect(types[0]).toBe('wire.open');
    expect(types).toContain('wire.frame');
    expect(types.at(-1)).toBe('wire.interrupted');
    expect(types).not.toContain('wire.close');

    const cut = events.at(-1) as any;
    expect(cut.reason).toBe('error');
    expect(cut.errorName).toBe('TypeError');
    expect(cut.frames).toBe(1);
    expect(cut.chunks).toBeGreaterThan(0);
    expect(cut.streamId).toBe((events[0] as any).streamId);
    expect(cut.traceId).toBe('turn-1');
  });

  it('an AbortError reports reason abort and errorName AbortError', async () => {
    const events: KaiDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));

    const aborted = new DOMException('The operation was aborted.', 'AbortError');
    const dying = dyingStream(aborted);
    const reading = readOpenAIStream(dying.stream, nullSink());
    const settled = expect(reading).rejects.toBe(aborted);
    await dying.run();
    await settled;

    const cut = events.at(-1) as any;
    expect(cut.type).toBe('wire.interrupted');
    expect(cut.reason).toBe('abort');
    expect(cut.errorName).toBe('AbortError');
  });

  it('an unidentifiable throw reports reason error rather than GUESSING abort', async () => {
    const events: KaiDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));

    const dying = dyingStream('a bare string, thrown by something rude');
    const reading = readOpenAIStream(dying.stream, nullSink());
    const settled = expect(reading).rejects.toBe('a bare string, thrown by something rude');
    await dying.run();
    await settled;

    const cut = events.at(-1) as any;
    expect(cut.type).toBe('wire.interrupted');
    expect(cut.reason).toBe('error');
    // Nothing to read a name off, so the field is absent rather than 'Error'.
    expect('errorName' in cut).toBe(false);
  });

  it('a normal read still ends in wire.close and emits NO interrupted event', async () => {
    const events: KaiDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    const body = [
      'data: {"choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":"stop"}]}',
      '',
      'data: [DONE]',
      '',
      '',
    ].join('\n');
    await readOpenAIStream(new Response(body), nullSink());
    const types = events.map((e) => e.type);
    expect(types.at(-1)).toBe('wire.close');
    expect(types).not.toContain('wire.interrupted');
  });

  it('emits nothing and still throws when nobody is subscribed', async () => {
    const boom = new TypeError('nobody watching');
    const dying = dyingStream(boom);
    const reading = readOpenAIStream(dying.stream, nullSink());
    const settled = expect(reading).rejects.toBe(boom);
    await dying.run();
    await settled;
  });
});
