import { describe, expect, it } from 'vitest';
import { readOpenAIStream } from './read';
import { consumeModelStream } from './consume';

// Minimal OpenAI SSE body with one reasoning delta, so a reasoning part
// (which carries streamId in the sink call) is produced.
const SSE = [
  'data: {"choices":[{"index":0,"delta":{"reasoning":"hm"},"finish_reason":null}]}',
  '',
  'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
  '',
  'data: [DONE]',
  '',
  '',
].join('\n');

/** The REAL `AssistantStreamSink` method names: `upsertTool`, not
 *  `upsertToolPart`. See chunk.ts. */
function reasoningSink(ids: (string | undefined)[]) {
  return {
    appendText: () => {},
    appendReasoning: (_t: string, opts?: { streamId?: string }) => {
      ids.push(opts?.streamId);
    },
    upsertTool: () => {},
    addSource: () => {},
  } as any;
}

describe('streamId assignment', () => {
  it('two reads into one sink get different ids', async () => {
    const ids: (string | undefined)[] = [];
    await readOpenAIStream(new Response(SSE), reasoningSink(ids));
    await readOpenAIStream(new Response(SSE), reasoningSink(ids));
    expect(ids[0]).toBeDefined();
    expect(ids[1]).toBeDefined();
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('a caller-supplied streamId is respected', async () => {
    const ids: (string | undefined)[] = [];
    await readOpenAIStream(new Response(SSE), reasoningSink(ids), { streamId: 'mine-1' } as any);
    expect(ids[0]).toBe('mine-1');
  });

  it('direct consumeModelStream still assigns a fresh id per call', async () => {
    async function* one() {
      yield { reasoning: 'hm' };
    }
    const ids: (string | undefined)[] = [];
    await consumeModelStream(one() as any, reasoningSink(ids));
    await consumeModelStream(one() as any, reasoningSink(ids));
    expect(ids[0]).not.toBe(ids[1]);
  });
});
