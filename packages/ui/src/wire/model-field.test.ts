import { describe, expect, it } from 'vitest';
import { readOpenAIStream } from './read';
import { sseJson } from './sse';
import { openaiChatFormat } from './formats/openai';
import { anthropicMessagesFormat } from './formats/anthropic';
import { OPENAI_FIXTURES } from './fixtures/openai';
import { ANTHROPIC_FIXTURES } from './fixtures/anthropic';
import { nullSink, replayBytes } from './fixtures/replay';
import type { ModelStreamChunk, WireFormat } from './chunk';

/** Drive a fixture through a format and collect the neutral chunks. `model`
 *  lives on the CHUNK, not on `ModelTurn`, so the format layer is what gets
 *  asserted here. */
async function chunksOf(sse: string, format: WireFormat): Promise<ModelStreamChunk[]> {
  const reader = format.open();
  const out: ModelStreamChunk[] = [];
  for await (const frame of sseJson<unknown>(replayBytes(sse, 17))) {
    out.push(...reader.push(frame));
  }
  return out;
}

const fixture = (bag: Record<string, string>, name: string) => {
  const sse = bag[name];
  if (!sse) throw new Error(`missing fixture ${name}`);
  return sse;
};

const sse = (lines: string[]) =>
  new Response([...lines.flatMap((l) => [l, '']), 'data: [DONE]', '', ''].join('\n'));

describe('the model id the response stated', () => {
  it('(a) an OpenAI chunk carries the model the frame stated', async () => {
    const chunks = await chunksOf(fixture(OPENAI_FIXTURES, 'text-only'), openaiChatFormat);
    expect(chunks.some((c) => c.model === 'openai/gpt-4o-mini')).toBe(true);
  });

  it('(b) the Anthropic message_start yields the model beside the usage', async () => {
    const chunks = await chunksOf(
      fixture(ANTHROPIC_FIXTURES, 'text-only'),
      anthropicMessagesFormat,
    );
    expect(chunks.some((c) => c.model === 'anthropic/claude-haiku-4.5')).toBe(true);
  });

  it('(c) the model field does not leak across dialects', async () => {
    // Anthropic states its model at `message.model`, nested inside a frame the
    // OpenAI format never looks into. Reading `model` must not change that.
    const raw = fixture(ANTHROPIC_FIXTURES, 'text-only');
    const chunks = await chunksOf(raw, openaiChatFormat);
    expect(chunks.some((c) => c.model !== undefined)).toBe(false);

    // The turn is still content-less. It reports `empty-turn` rather than
    // `empty-stream` because this capture went through OpenRouter, whose
    // `message_delta` carries a TOP-LEVEL `usage` object with `cost` -- which
    // `usageOf` does read, so exactly one usage-only chunk comes out of a
    // dialect the reader otherwise understands nothing of. That is the whole
    // point of judging emptiness on parts: chunks alone would call this healthy.
    const turn = await readOpenAIStream(replayBytes(raw, 17), nullSink());
    expect(turn.parts).toEqual([]);
    expect(turn.error?.code).toBe('empty-turn');
  });

  it('(d) a model-and-finish-only stream yields chunks and reports empty-turn', async () => {
    const turn = await readOpenAIStream(
      sse([
        'data: {"model":"openai/gpt-4o-mini","choices":[{"index":0,"delta":{},"finish_reason":null}]}',
        'data: {"model":"openai/gpt-4o-mini","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      ]),
      nullSink(),
    );
    expect(turn.chunks).toBeGreaterThan(0);
    expect(turn.parts).toEqual([]);
    expect(turn.error?.code).toBe('empty-turn');
  });

  it('(e) a model-ONLY stream still reports empty-turn, not silence', async () => {
    // THE ORDERING DEPENDENCY, pinned where it actually bites. These frames say
    // nothing but the model id -- no finish_reason, no usage -- so before the
    // format read `model` they parsed to nothing and the turn tripped the
    // zero-chunk guard. Reading `model` makes them yield chunks, which is
    // exactly the move that would have silenced a chunk-count guard. The
    // parts-based guard still speaks, and case (d) alone could not show this:
    // its `finish_reason` already produced a chunk on its own.
    const turn = await readOpenAIStream(
      sse([
        'data: {"model":"openai/gpt-4o-mini","choices":[{"index":0,"delta":{},"finish_reason":null}]}',
        'data: {"model":"openai/gpt-4o-mini","choices":[{"index":0,"delta":{},"finish_reason":null}]}',
      ]),
      nullSink(),
    );
    expect(turn.chunks).toBeGreaterThan(0);
    expect(turn.parts).toEqual([]);
    expect(turn.error?.code).toBe('empty-turn');
  });
});
