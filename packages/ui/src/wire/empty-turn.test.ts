import { afterEach, describe, expect, it } from 'vitest';
import { readOpenAIStream } from './read';
import { subscribeWireDiagnostics, type KaiDiagnosticEvent, type WireDiagnosticEvent } from './diagnostics';

/** The REAL `AssistantStreamSink` method names (see chunk.ts): `upsertTool`. */
const nullSink = () =>
  ({
    appendText: () => {},
    appendReasoning: () => {},
    upsertTool: () => {},
    addSource: () => {},
  }) as any;

const sse = (lines: string[]) =>
  new Response([...lines.flatMap((l) => [l, '']), 'data: [DONE]', '', ''].join('\n'));

describe('widened empty-turn guard', () => {
  it('chunks consumed but zero parts → error code empty-turn', async () => {
    const turn = await readOpenAIStream(
      sse([
        'data: {"choices":[{"index":0,"delta":{"role":"assistant","foo":"payload in an unread field"},"finish_reason":null}]}',
        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      ]),
      nullSink(),
    );
    expect(turn.parts).toEqual([]);
    expect(turn.chunks).toBeGreaterThan(0);
    expect(turn.error?.code).toBe('empty-turn');
  });

  it('zero chunks still reports empty-stream, unchanged', async () => {
    const turn = await readOpenAIStream(
      sse(['data: {"type":"message_start","message":{"model":"x","usage":{"input_tokens":1}}}']),
      nullSink(),
    );
    expect(turn.error?.code).toBe('empty-stream');
  });

  it('a turn that produced parts carries no error', async () => {
    const turn = await readOpenAIStream(
      sse([
        'data: {"choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}',
        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      ]),
      nullSink(),
    );
    expect(turn.error).toBeUndefined();
    expect(turn.text).toBe('hi');
  });
});

/** `settle` is PART-PRODUCING: a tool call that never had both an id and a
 *  non-empty name during the stream is announced only there. Judging emptiness
 *  before it runs reads a parts map that is not final yet. */
describe('the guard runs after tools.settle', () => {
  let off: (() => void) | undefined;
  afterEach(() => {
    off?.();
    off = undefined;
  });

  // One fragment carrying an id and arguments but NO function name, so nothing
  // is announced while the stream runs, then a normal tool_calls finish.
  //
  // A FACTORY, not a shared constant: a Response body reads exactly once, and a
  // second test handed the drained one would see zero frames and pass or fail
  // for reasons that have nothing to do with what it asserts.
  const namelessTool = () =>
    sse([
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_abc","function":{"arguments":"{\\"city\\":\\"SF\\"}"}}]},"finish_reason":null}]}',
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}',
    ]);

  it('a tool part announced during settle keeps its own accurate error', async () => {
    const turn = await readOpenAIStream(namelessTool(), nullSink());
    // The turn is NOT empty: settle produced a tool part.
    expect(turn.parts.some((p) => p.type === 'tool')).toBe(true);
    expect(turn.error).toBeUndefined();
    // The accurate diagnosis survives instead of being replaced by the
    // emptiness prose fed back in through settle's streamError parameter.
    expect(turn.toolCalls[0].error).toMatch(/no function name/);
  });

  it('wire.close agrees with itself: a tool part and no errorCode', async () => {
    const events: KaiDiagnosticEvent[] = [];
    off = subscribeWireDiagnostics((e) => events.push(e));
    await readOpenAIStream(namelessTool(), nullSink());
    const close = events.at(-1) as any;
    expect(close.type).toBe('wire.close');
    expect(close.parts).toEqual({ tool: 1 });
    // Reporting a produced part beside an emptiness code is self-contradictory.
    expect(close.errorCode).toBeUndefined();
  });

  it('the true-empty path is untouched: zero chunks still says empty-stream', async () => {
    const turn = await readOpenAIStream(
      sse(['data: {"type":"message_start","message":{"model":"x"}}']),
      nullSink(),
    );
    expect(turn.error?.code).toBe('empty-stream');
  });
});
