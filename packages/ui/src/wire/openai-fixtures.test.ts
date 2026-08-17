import { describe, expect, it } from 'vitest';
import { readOpenAIStream } from './read';
import { OPENAI_FIXTURES } from './fixtures/openai';
import { nullSink, recordingSink, replayBytes } from './fixtures/replay';
import type { MessagePart } from '../elements/chat-types';

const read = (name: string, sink = nullSink()) => {
  const sse = OPENAI_FIXTURES[name];
  if (!sse) throw new Error(`missing fixture openai/${name}`);
  return readOpenAIStream(replayBytes(sse, 17), sink);
};

const toolParts = (parts: MessagePart[]) =>
  parts.filter((p): p is Extract<MessagePart, { type: 'tool' }> => p.type === 'tool');

describe('L2 OpenAI captures', () => {
  it('text-only produces one text part and a stop', async () => {
    const turn = await read('text-only');
    expect(turn.parts.map((p) => p.type)).toEqual(['text']);
    expect(turn.text.length).toBeGreaterThan(0);
    expect(turn.stopReason).toBe('stop');
    expect(turn.toolCalls).toHaveLength(0);
  });

  it('tool-fragmented-args reassembles one call from many fragments', async () => {
    const turn = await read('tool-fragmented-args');
    expect(turn.toolCalls).toHaveLength(1);
    const call = turn.toolCalls[0];
    expect(call.name).toBe('get_weather');
    expect(call.error).toBeUndefined();
    expect(call.input).toMatchObject({ city: expect.any(String) });
    // The raw text is what an encoder echoes back, so it must survive intact.
    expect(JSON.parse(call.argumentsText)).toEqual(call.input);
    const tool = toolParts(turn.parts)[0].tool;
    expect(tool.state).toBe('input-available');
    expect(tool.rawInput).toBe(call.argumentsText);
    expect(tool.kind).toBe('generic');
    expect(turn.stopReason).toBe('tool-calls');
  });

  it('parallel-tools keeps two calls distinct even with a late id', async () => {
    const turn = await read('parallel-tools');
    expect(turn.toolCalls).toHaveLength(2);
    expect(new Set(turn.toolCalls.map((c) => c.id)).size).toBe(2);
    expect(turn.toolCalls.every((c) => c.error === undefined)).toBe(true);
    expect(turn.toolCalls.map((c) => c.index)).toEqual([0, 1]);
    expect(toolParts(turn.parts)).toHaveLength(2);
  });

  it('parallel-tools-late-id flushes the fragments buffered before the id arrived', async () => {
    const turn = await read('parallel-tools-late-id');
    expect(turn.toolCalls).toHaveLength(2);
    expect(turn.toolCalls.map((c) => c.index)).toEqual([0, 1]);
    // The second call's id and name arrive AFTER its arguments. Nothing may be
    // lost in the gap: the accumulator buffers, then flushes at announce.
    const late = turn.toolCalls[1];
    expect(late.id).toBe('call_upaTKM45iFw9CZ7XVrNtXo8F');
    expect(late.name).toBe('get_weather');
    expect(late.error).toBeUndefined();
    expect(late.input).toEqual({ city: 'Tokyo' });
    expect(toolParts(turn.parts)[1].tool.rawInput).toBe(late.argumentsText);
  });

  it('length-mid-arguments fails the call and says why', async () => {
    const turn = await read('length-mid-arguments');
    expect(turn.finishReason).toBe('length');
    expect(turn.stopReason).toBe('length');
    expect(turn.toolCalls[0].error).toContain('token limit');
    const tool = toolParts(turn.parts)[0].tool;
    expect(tool.state).toBe('output-error');
    // The partial arguments are STILL on the part, so a UI can show what arrived.
    expect(tool.rawInput?.length).toBeGreaterThan(0);
    expect(tool.input).toBeUndefined();
  });

  it('length-normalized-to-tool-calls still reports the call as unusable', async () => {
    // OpenRouter REWRITES the reason for an OpenAI-family model: the stream was
    // cut by the token limit (native_finish_reason max_output_tokens) but
    // finish_reason says tool_calls. The adapter cannot blame the token limit it
    // was never told about, so the call has to fail on the arguments alone.
    const turn = await read('length-normalized-to-tool-calls');
    expect(turn.finishReason).toBe('tool_calls');
    expect(turn.stopReason).toBe('tool-calls');
    const call = turn.toolCalls[0];
    expect(call.error).toBeTruthy();
    expect(call.error).toContain('Malformed tool arguments');
    expect(call.error).not.toContain('token limit');
    // The half-written arguments are still on the part for a UI to show.
    expect(call.argumentsText.length).toBeGreaterThan(0);
    const tool = toolParts(turn.parts)[0].tool;
    expect(tool.state).toBe('output-error');
    expect(tool.rawInput).toBe(call.argumentsText);
  });

  it('finish-error-no-message stops on error and now reports empty-turn', async () => {
    // A real Gemini failure: finish_reason "error" and NOT ONE error object
    // anywhere in the stream.
    //
    // `stopReason` USED TO BE the only signal a UI gets, and this test pinned
    // that -- `error: undefined` on a turn that parsed a frame and produced
    // nothing. That is the silent case the widened guard exists to catch, so the
    // expectation is updated rather than preserved: one frame parsed, zero parts
    // produced, and the turn now says so.
    const turn = await read('finish-error-no-message');
    expect(turn.finishReason).toBe('error');
    expect(turn.stopReason).toBe('error');
    expect(turn.chunks).toBeGreaterThan(0);
    expect(turn.error?.code).toBe('empty-turn');
    expect(turn.text).toBe('');
    expect(turn.parts).toEqual([]);
  });

  it('in-band-error lands on the turn and keeps the text already streamed', async () => {
    const turn = await read('in-band-error');
    expect(turn.error?.message).toBeTruthy();
    expect(turn.stopReason).toBe('error');
    expect(turn.text.length).toBeGreaterThan(0);
    expect(turn.parts.some((p) => p.type === 'text')).toBe(true);
  });

  it('reasoning-both-fields does NOT double the reasoning text', async () => {
    const turn = await read('reasoning-both-fields');
    expect(turn.reasoningChunks).toBeGreaterThan(0);
    // The trap: concatenating `reasoning` and `reasoning_details` emits every
    // token twice, so the second half repeats the first exactly.
    const half = turn.reasoning.slice(0, Math.floor(turn.reasoning.length / 2));
    expect(turn.reasoning.slice(Math.floor(turn.reasoning.length / 2))).not.toBe(half);
    const reasoning = turn.parts.find((p) => p.type === 'reasoning');
    expect(reasoning).toBeDefined();
    // reasoning_details rode along as the round-trip payload.
    expect(reasoning?.raw?.source).toBe('openai.reasoning_details');
  });

  it('reasoning-content-deepseek keeps the reasoning DeepSeek first-party emits', async () => {
    // The whole stream is `reasoning_content`: no `reasoning`, no
    // `reasoning_details`. Everything in this directory came through
    // OpenRouter, which renames it, so this shape used to parse to nothing.
    const turn = await read('reasoning-content-deepseek');
    expect(turn.reasoningChunks).toBeGreaterThan(0);
    expect(turn.reasoning).toBe('We need 17 x 23. That is 391.');
    const reasoning = turn.parts.find((p) => p.type === 'reasoning');
    expect(reasoning).toBeDefined();
    // A sibling string is the WHOLE payload here. There is no block list to
    // round-trip, which is the shape difference an alias cannot paper over.
    expect(reasoning?.raw).toBeUndefined();
    expect(reasoning?.signature).toBeUndefined();
    expect(turn.text).toBe('17 x 23 = 391.');
    expect(turn.stopReason).toBe('stop');
    expect(turn.usage?.reasoningTokens).toBe(13);
  });

  it('usage-only-final-chunk reports usage without a stray part', async () => {
    const turn = await read('usage-only-final-chunk');
    expect(turn.usage?.inputTokens).toBeGreaterThan(0);
    expect(turn.usage?.outputTokens).toBeGreaterThan(0);
    expect(turn.parts.filter((p) => p.type === 'text')).toHaveLength(1);
  });

  it('keepalive-comments are invisible to the adapter', async () => {
    const sink = recordingSink();
    const turn = await read('keepalive-comments', sink);
    expect(turn.text).toBe('Hello world');
    expect(sink.calls).toEqual(['text:Hello', 'text: world']);
  });
});
