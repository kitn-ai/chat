import { describe, expect, it } from 'vitest';
import { readOpenAIStream } from './read';

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
