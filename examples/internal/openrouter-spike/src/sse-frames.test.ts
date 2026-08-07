import { describe, expect, it } from 'vitest';
import { sseDataFrames, sseJson } from './sse-frames';
import { replayBytes } from './fixtures/model-chunks';

describe('sseDataFrames', () => {
  it('joins multi-line data frames, drops comments, normalises CRLF', async () => {
    const raw =
      ': OPENROUTER PROCESSING\r\ndata: {"a":1}\r\n\r\nevent: ping\ndata: line one\ndata: line two\n\ndata: [DONE]\n\n';
    const out: string[] = [];
    for await (const f of sseDataFrames(replayBytes(raw, 5))) out.push(f);
    expect(out).toEqual(['{"a":1}', 'line one\nline two', '[DONE]']);
  });

  it('emits a trailing frame that never got its blank line', async () => {
    const out: string[] = [];
    for await (const f of sseDataFrames(replayBytes('data: {"a":1}', 3))) out.push(f);
    expect(out).toEqual(['{"a":1}']);
  });

  it('reassembles a multi-byte codepoint split across byte chunks', async () => {
    const out: string[] = [];
    // "☔️" is 6 bytes; a size-1 replay guarantees the split.
    for await (const f of sseDataFrames(replayBytes('data: {"text":"☔️ — °C"}\n\n', 1))) out.push(f);
    expect(JSON.parse(out[0]) as { text: string }).toEqual({ text: '☔️ — °C' });
  });
});

describe('sseJson', () => {
  it('stops at [DONE] and skips unparseable frames', async () => {
    const raw = 'data: {"text":"a"}\n\ndata: oops\n\ndata: {"text":"b"}\n\ndata: [DONE]\n\ndata: {"text":"never"}\n\n';
    const out: { text?: string }[] = [];
    for await (const c of sseJson<{ text?: string }>(replayBytes(raw, 7))) out.push(c);
    expect(out).toEqual([{ text: 'a' }, { text: 'b' }]);
  });
});
