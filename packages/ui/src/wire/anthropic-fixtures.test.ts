import { describe, expect, it } from 'vitest';
import { readAnthropicStream } from './read';
import { ANTHROPIC_FIXTURES } from './fixtures/anthropic';
import { nullSink, replayBytes } from './fixtures/replay';
import type { MessagePart } from '../elements/chat-types';

const read = (name: string) => {
  const sse = ANTHROPIC_FIXTURES[name];
  if (!sse) throw new Error(`missing fixture anthropic/${name}`);
  return readAnthropicStream(replayBytes(sse, 17), nullSink());
};

const reasoningParts = (parts: MessagePart[]) =>
  parts.filter((p): p is Extract<MessagePart, { type: 'reasoning' }> => p.type === 'reasoning');

describe('L2 Anthropic captures', () => {
  it('text-only produces one text part and normalizes end_turn', async () => {
    const turn = await read('text-only');
    expect(turn.parts.map((p) => p.type)).toEqual(['text']);
    expect(turn.finishReason).toBe('end_turn');
    expect(turn.stopReason).toBe('stop');
    expect(turn.usage?.inputTokens).toBeGreaterThan(0);
  });

  it('thinking-tool orders reasoning, then text, then the tool', async () => {
    const turn = await read('thinking-tool');
    expect(turn.parts.map((p) => p.type)).toEqual(['reasoning', 'text', 'tool']);
    expect(turn.finishReason).toBe('tool_use');
    expect(turn.stopReason).toBe('tool-calls');
  });

  it('thinking-tool carries the assembled verbatim block with its signature', async () => {
    const turn = await read('thinking-tool');
    const block = reasoningParts(turn.parts)[0];
    expect(block.text.length).toBeGreaterThan(0);
    expect(block.signature).toBeTruthy();
    expect(block.raw?.source).toBe('anthropic.content_block');
    const payload = block.raw?.payload as { type: string; thinking: string; signature: string };
    expect(payload.type).toBe('thinking');
    // Every byte of the payload came off the wire: `thinking` is the
    // concatenation of the provider's own thinking_delta payloads, so it must
    // equal the part's accumulated text exactly.
    expect(payload.thinking).toBe(block.text);
    expect(payload.signature).toBe(block.signature);
  });

  it('thinking-tool reassembles the tool_use input from input_json_delta', async () => {
    const turn = await read('thinking-tool');
    expect(turn.toolCalls).toHaveLength(1);
    const call = turn.toolCalls[0];
    expect(call.id).toMatch(/^toolu_/);
    expect(call.name).toBe('get_weather');
    expect(call.input).toMatchObject({ city: 'Paris' });
    expect(call.error).toBeUndefined();
  });

  it('redacted-thinking keeps an opaque block as an empty-text part with raw', async () => {
    const turn = await read('redacted-thinking');
    const blocks = reasoningParts(turn.parts);
    const redacted = blocks.find(
      (b) => (b.raw?.payload as { type?: string } | undefined)?.type === 'redacted_thinking',
    );
    expect(redacted).toBeDefined();
    expect(redacted!.text).toBe('');
    expect((redacted!.raw?.payload as { data?: string }).data).toBeTruthy();
    // It is in `parts`, in order, because the encoder needs it there.
    expect(turn.parts.indexOf(redacted!)).toBeLessThan(
      turn.parts.findIndex((p) => p.type === 'text'),
    );
  });

  it('empty-thinking keeps a zero-text thinking block rather than dropping it', async () => {
    const turn = await read('empty-thinking');
    const blocks = reasoningParts(turn.parts);
    const empty = blocks.find((b) => b.text === '');
    expect(empty).toBeDefined();
    expect(empty!.raw?.source).toBe('anthropic.content_block');
    // Zero streamed reasoning TEXT, but the block still exists.
    expect(turn.reasoning).toBe('');
    expect(turn.reasoningChunks).toBe(0);
  });

  it('max-tokens normalizes to length', async () => {
    const turn = await read('max-tokens');
    expect(turn.finishReason).toBe('max_tokens');
    expect(turn.stopReason).toBe('length');
  });

  it('error-mid-stream lands on the turn and keeps what already streamed', async () => {
    const turn = await read('error-mid-stream');
    expect(turn.error?.message).toBeTruthy();
    expect(turn.error?.code).toBe('overloaded_error');
    expect(turn.stopReason).toBe('error');
    expect(turn.text.length).toBeGreaterThan(0);
  });
});
