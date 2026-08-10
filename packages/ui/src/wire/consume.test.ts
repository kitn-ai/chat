import { describe, expect, it, vi } from 'vitest';
import { consumeModelStream } from './consume';
import { normalizeStopReason, type AssistantStreamSink, type ModelStreamChunk } from './chunk';
import type { MessagePart } from '../elements/chat-types';
import { appendReasoningPart, appendTextPart, upsertToolPart } from '../state/parts';
import {
  FINAL_TURN,
  HIDDEN_REASONING,
  MID_STREAM_ERROR,
  PARALLEL_TOOLS,
  PROVIDER_EXECUTED_TOOL,
  REDACTED_THINKING_TURN,
  TOOL_TURN,
  TRUNCATED_ARGS,
  replayChunks,
} from './fixtures/chunks';

function recordingSink(): AssistantStreamSink & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    appendText: (d) => calls.push(`text:${d}`),
    appendReasoning: (d, o) => calls.push(`reasoning:${o?.index ?? 0}:${d}`),
    upsertTool: (id, p) => calls.push(`tool:${id}:${p.state ?? '-'}`),
    addSource: (s) => calls.push(`source:${s.url ?? ''}`),
  };
}

const nullSink = (): AssistantStreamSink => ({
  appendText: () => undefined,
  appendReasoning: () => undefined,
  upsertTool: () => undefined,
  addSource: () => undefined,
});

const reasoningParts = (parts: MessagePart[]) =>
  parts.filter((p): p is Extract<MessagePart, { type: 'reasoning' }> => p.type === 'reasoning');

describe('normalizeStopReason', () => {
  it('maps both providers onto one vocabulary', () => {
    expect(normalizeStopReason('stop')).toBe('stop');
    expect(normalizeStopReason('end_turn')).toBe('stop');
    expect(normalizeStopReason('stop_sequence')).toBe('stop');
    expect(normalizeStopReason('length')).toBe('length');
    expect(normalizeStopReason('max_tokens')).toBe('length');
    expect(normalizeStopReason('tool_calls')).toBe('tool-calls');
    expect(normalizeStopReason('tool_use')).toBe('tool-calls');
    expect(normalizeStopReason('content_filter')).toBe('content-filter');
    expect(normalizeStopReason('refusal')).toBe('content-filter');
    expect(normalizeStopReason('error')).toBe('error');
  });

  it('degrades an unknown reason to other, and absent to undefined', () => {
    expect(normalizeStopReason('pause_turn')).toBe('other');
    expect(normalizeStopReason('something_new')).toBe('other');
    expect(normalizeStopReason(null)).toBeUndefined();
    expect(normalizeStopReason(undefined)).toBeUndefined();
  });
});

describe('consumeModelStream: ordering and parts', () => {
  it('opens a new text part after a tool call rather than gluing rounds together', async () => {
    const turn = await consumeModelStream(
      replayChunks([
        { text: 'Let me check.' },
        { toolCalls: [{ index: 0, id: 'c1', name: 'get_weather', arguments: '{"city":"Paris"}' }] },
        { finishReason: 'tool_calls' },
      ]),
      nullSink(),
    );
    expect(turn.parts.map((p) => p.type)).toEqual(['text', 'tool']);
    const second = await consumeModelStream(replayChunks(FINAL_TURN), nullSink());
    expect(second.parts.map((p) => p.type)).toEqual(['text']);
  });

  it('drives the sink in stream order', async () => {
    const sink = recordingSink();
    await consumeModelStream(replayChunks(TOOL_TURN), sink);
    expect(sink.calls[0]).toBe('reasoning:0:The user wants weather. ');
    expect(sink.calls).toContain('text:Let me check');
    expect(sink.calls.some((c) => c.startsWith('tool:call_wx_001:'))).toBe(true);
  });

  it('reports finishReason verbatim and stopReason normalized', async () => {
    const turn = await consumeModelStream(replayChunks(TOOL_TURN), nullSink());
    expect(turn.finishReason).toBe('tool_calls');
    expect(turn.stopReason).toBe('tool-calls');
    const anthropic = await consumeModelStream(replayChunks(REDACTED_THINKING_TURN), nullSink());
    expect(anthropic.finishReason).toBe('end_turn');
    expect(anthropic.stopReason).toBe('stop');
  });
});

describe('consumeModelStream: reasoning (rework 1)', () => {
  it('keeps an empty-text reasoning delta that carries a raw payload', async () => {
    const turn = await consumeModelStream(replayChunks(REDACTED_THINKING_TURN), nullSink());
    const blocks = reasoningParts(turn.parts);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].text).toBe('');
    // BY REFERENCE, not toEqual: `raw.payload` is the round-trip channel and a
    // defensive clone would preserve the bytes while breaking identity, which is
    // exactly the change this assertion has to catch.
    expect(blocks[0].raw).toBe(REDACTED_THINKING_TURN[0].reasoningRaw);
    expect(blocks[0].raw?.payload).toEqual({ type: 'redacted_thinking', data: 'EroBCkYIARgCIkDx1VzGxQ==' });
  });

  it('threads the assembled block and its signature onto the streamed part', async () => {
    const turn = await consumeModelStream(replayChunks(REDACTED_THINKING_TURN), nullSink());
    const block = reasoningParts(turn.parts)[1];
    expect(block.text).toBe('Let me work through this.');
    expect(block.signature).toBe('ErUBCkYIARgCIkAd8xVzGx');
    expect(block.raw).toBe(REDACTED_THINKING_TURN[5].reasoningRaw);
    expect(block.raw?.payload).toEqual({
      type: 'thinking',
      thinking: 'Let me work through this.',
      signature: 'ErUBCkYIARgCIkAd8xVzGx',
    });
  });

  it('preserves block ORDER, which is what the encoder round-trips', async () => {
    const turn = await consumeModelStream(replayChunks(REDACTED_THINKING_TURN), nullSink());
    expect(turn.parts.map((p) => p.type)).toEqual(['reasoning', 'reasoning', 'text']);
  });

  it('counts only non-empty reasoning deltas in reasoningChunks', async () => {
    const turn = await consumeModelStream(replayChunks(REDACTED_THINKING_TURN), nullSink());
    expect(turn.reasoningChunks).toBe(2);
    expect(turn.reasoning).toBe('Let me work through this.');
  });

  /** End-to-end cover for the behaviour. NOTE: what enforces it is
   *  `appendReasoningPart`'s `raw: opts.raw ?? cur.raw`, NOT the
   *  `...(chunk.reasoningRaw ? … : {})` spread guards in `consume.ts` -- removing
   *  those guards leaves this green, because an explicit `raw: undefined` and an
   *  omitted one resolve identically. The guards are belt-and-braces. The test
   *  that genuinely fails if the builder regresses to a plain spread lives in
   *  `state/parts.test.ts` ("carries an established raw and signature forward
   *  when a later delta omits them"). */
  it('never blanks an established raw when a later delta omits it', async () => {
    const raw = { source: 'anthropic.content_block', payload: { type: 'thinking', thinking: 'x' } };
    const turn = await consumeModelStream(
      replayChunks([
        { reasoning: 'x', reasoningIndex: 0, reasoningRaw: raw },
        { reasoning: 'y', reasoningIndex: 0 },
      ]),
      nullSink(),
    );
    expect(reasoningParts(turn.parts)[0].raw).toBe(raw);
  });

  it('reports hidden reasoning as zero streamed chunks with non-zero tokens', async () => {
    const turn = await consumeModelStream(replayChunks(HIDDEN_REASONING), nullSink());
    expect(turn.reasoningChunks).toBe(0);
    expect(reasoningParts(turn.parts)).toHaveLength(0);
    expect(turn.usage?.reasoningTokens).toBe(512);
  });

  /** The sharp version of the case above, and the one that actually constrains
   *  where the counter sits: reasoning frames DO arrive and DO produce a part,
   *  but every delta is empty. `reasoningChunks` must still be 0, because the
   *  "billed but hidden" signal is text streamed, not frames seen. A counter on
   *  the branch rather than inside `delta !== ''` reports 2 here. */
  it('counts no streamed chunks when every reasoning frame is empty but billed', async () => {
    const turn = await consumeModelStream(
      replayChunks([
        {
          reasoning: '',
          reasoningIndex: 0,
          reasoningRaw: { source: 'anthropic.content_block', payload: { type: 'redacted_thinking' } },
        },
        { reasoning: '', reasoningIndex: 0, reasoningSignature: 'sig' },
        { text: 'The answer is 42.' },
        { finishReason: 'end_turn' },
        { usage: { inputTokens: 20, outputTokens: 8, reasoningTokens: 512 } },
      ]),
      nullSink(),
    );
    expect(turn.reasoningChunks).toBe(0);
    expect(turn.reasoning).toBe('');
    // The part still exists: the payload has to round-trip even with no text.
    expect(reasoningParts(turn.parts)).toHaveLength(1);
    expect(turn.usage?.reasoningTokens).toBe(512);
  });
});

describe('consumeModelStream: tool calls', () => {
  it('reassembles fragmented arguments into one parsed input', async () => {
    const turn = await consumeModelStream(replayChunks(TOOL_TURN), nullSink());
    expect(turn.toolCalls).toHaveLength(1);
    expect(turn.toolCalls[0].input).toEqual({ city: 'Paris', units: 'metric' });
    expect(turn.toolCalls[0].argumentsText).toBe('{"city":"Paris","units":"metric"}');
    expect(turn.toolCalls[0].error).toBeUndefined();
  });

  it('correlates parallel calls by index when the id arrives late', async () => {
    const turn = await consumeModelStream(replayChunks(PARALLEL_TOOLS), nullSink());
    expect(turn.toolCalls.map((c) => c.id)).toEqual(['call_a', 'call_b']);
    expect(turn.toolCalls[0].input).toEqual({ query: 'theming' });
    expect(turn.toolCalls[1].input).toEqual({ city: 'Tokyo' });
  });

  it('explains a truncated call using the NORMALIZED stop reason', async () => {
    const turn = await consumeModelStream(replayChunks(TRUNCATED_ARGS), nullSink());
    expect(turn.toolCalls[0].error).toContain('token limit');
    // Same fixture, Anthropic's vocabulary for the same condition.
    const anthropic = await consumeModelStream(
      replayChunks([
        { toolCalls: [{ index: 0, id: 'c1', name: 'propose_action', arguments: '{"title":"Deploy' }] },
        { finishReason: 'max_tokens' },
      ]),
      nullSink(),
    );
    expect(anthropic.toolCalls[0].error).toContain('token limit');
  });

  it('fails every in-flight call when the stream errors mid-turn', async () => {
    const sink = recordingSink();
    const turn = await consumeModelStream(replayChunks(MID_STREAM_ERROR), sink);
    expect(turn.error?.message).toContain('Upstream provider');
    expect(turn.stopReason).toBe('error');
    expect(turn.toolCalls[0].error).toContain('Stream failed');
    expect(sink.calls).toContain('tool:call_boom:output-error');
  });

  it('fires onToolCallReady once per usable call', async () => {
    const ready = vi.fn();
    await consumeModelStream(replayChunks(PARALLEL_TOOLS), nullSink(), { onToolCallReady: ready });
    expect(ready).toHaveBeenCalledTimes(2);
  });

  it('accepts an argument-less tool that streams nothing', async () => {
    const turn = await consumeModelStream(
      replayChunks([
        { toolCalls: [{ index: 0, id: 'c1', name: 'list_files', arguments: '' }] },
        { finishReason: 'tool_calls' },
      ]),
      nullSink(),
    );
    expect(turn.toolCalls[0].input).toEqual({});
    expect(turn.toolCalls[0].error).toBeUndefined();
  });
});

describe('consumeModelStream: provider-executed tools and sources', () => {
  it('completes a provider-executed panel with no host work', async () => {
    const sink = recordingSink();
    const turn = await consumeModelStream(replayChunks(PROVIDER_EXECUTED_TOOL), sink);
    expect(sink.calls).toContain('tool:srvtoolu_01:output-available');
    expect(turn.toolCalls[0].providerExecuted).toBe(true);
    expect(turn.toolCalls[0].output).toEqual({
      content: [{ title: 'AI/UI', url: 'https://ui.kitn.ai' }],
    });
    expect(turn.toolCalls[0].error).toBeUndefined();
  });

  it('routes sources to the sink and onto the turn', async () => {
    const sink = recordingSink();
    const turn = await consumeModelStream(replayChunks(PROVIDER_EXECUTED_TOOL), sink);
    expect(sink.calls).toContain('source:https://ui.kitn.ai');
    expect(turn.sources).toEqual([{ url: 'https://ui.kitn.ai', title: 'AI/UI', index: 1 }]);
  });

  it('tolerates a sink with no addSource', async () => {
    const minimal: AssistantStreamSink = {
      appendText: () => undefined,
      appendReasoning: () => undefined,
      upsertTool: () => undefined,
    };
    const turn = await consumeModelStream(replayChunks(PROVIDER_EXECUTED_TOOL), minimal);
    expect(turn.sources).toHaveLength(1);
  });
});

describe('consumeModelStream: determinism', () => {
  it('produces identical parts when the same chunks are replayed twice', async () => {
    const a = await consumeModelStream(replayChunks(TOOL_TURN), nullSink());
    const b = await consumeModelStream(replayChunks(TOOL_TURN), nullSink());
    expect(JSON.stringify(a.parts)).toBe(JSON.stringify(b.parts));
  });

  it('records parts even when the host sink swallows everything', async () => {
    const chunks: ModelStreamChunk[] = [{ text: 'a' }, { text: 'b' }, { finishReason: 'stop' }];
    const turn = await consumeModelStream(replayChunks(chunks), nullSink());
    expect(turn.parts).toEqual([{ type: 'text', text: 'ab' }]);
    expect(turn.text).toBe('ab');
    expect(turn.chunks).toBe(3);
  });
});

/**
 * IDENTITY, not deep equality. A new `parts` array reference is the kit's
 * re-render signal, so these assert `toBe` / `not.toBe` -- a `toEqual` here
 * would pass against an implementation that rebuilds the array on every frame,
 * which is precisely the defect the checks in `state/parts.ts` exist to stop.
 */
describe('consumeModelStream: reference stability', () => {
  /** Mirrors what the kit's `AssistantStream` does: hold a `parts` array, rebuild
   *  it with the kit's own builders on every sink call, and snapshot the array
   *  reference each time. Consecutive snapshots being the SAME object is exactly
   *  "this frame caused no re-render". */
  function refTrackingSink(): AssistantStreamSink & { snapshots: MessagePart[][] } {
    let parts: MessagePart[] = [];
    const snapshots: MessagePart[][] = [];
    return {
      snapshots,
      appendText(delta) {
        parts = appendTextPart(parts, delta);
        snapshots.push(parts);
      },
      appendReasoning(delta, opts) {
        parts = appendReasoningPart(parts, delta, opts);
        snapshots.push(parts);
      },
      upsertTool(toolCallId, patch) {
        parts = upsertToolPart(parts, toolCallId, patch);
        snapshots.push(parts);
      },
    };
  }

  it('yields a NEW parts array for a reasoning chunk that changes something', async () => {
    const sink = refTrackingSink();
    await consumeModelStream(
      replayChunks([
        { reasoning: 'a', reasoningIndex: 0 },
        { reasoning: 'b', reasoningIndex: 0 },
        { finishReason: 'stop' },
      ]),
      sink,
    );
    expect(sink.snapshots).toHaveLength(2);
    expect(sink.snapshots[1]).not.toBe(sink.snapshots[0]);
  });

  /** The frame rework 1 started letting through. It MUST reach the sink, and it
   *  must NOT cost a render when it carries nothing new. Anthropic is the format
   *  that emits these, so this has to hold before task 7 lands. */
  it('yields the SAME parts array for an empty reasoning chunk that changes nothing', async () => {
    const sink = refTrackingSink();
    await consumeModelStream(
      replayChunks([
        { reasoning: 'a', reasoningIndex: 0 },
        { reasoning: '', reasoningIndex: 0 },
        { reasoning: '', reasoningIndex: 0 },
        { finishReason: 'stop' },
      ]),
      sink,
    );
    expect(sink.snapshots).toHaveLength(3);
    expect(sink.snapshots[1]).toBe(sink.snapshots[0]);
    expect(sink.snapshots[2]).toBe(sink.snapshots[0]);
  });

  it('yields a NEW parts array when an empty reasoning chunk carries a payload', async () => {
    const sink = refTrackingSink();
    await consumeModelStream(
      replayChunks([
        { reasoning: 'a', reasoningIndex: 0 },
        { reasoning: '', reasoningIndex: 0, reasoningSignature: 'sig' },
        {
          reasoning: '',
          reasoningIndex: 0,
          reasoningRaw: { source: 'anthropic.content_block', payload: { type: 'thinking' } },
        },
        { finishReason: 'stop' },
      ]),
      sink,
    );
    expect(sink.snapshots).toHaveLength(3);
    expect(sink.snapshots[1]).not.toBe(sink.snapshots[0]);
    expect(sink.snapshots[2]).not.toBe(sink.snapshots[1]);
  });

  it('yields a NEW parts array per tool argument fragment, and the SAME one for a repeated patch', async () => {
    const sink = refTrackingSink();
    await consumeModelStream(
      replayChunks([
        { toolCalls: [{ index: 0, id: 'c1', name: 'get_weather', arguments: '{"city"' }] },
        { toolCalls: [{ index: 0, arguments: ':"Paris"}' }] },
        { finishReason: 'tool_calls' },
      ]),
      sink,
    );
    // announce, fragment 1, fragment 2, settle
    expect(sink.snapshots).toHaveLength(4);
    expect(sink.snapshots[1]).not.toBe(sink.snapshots[0]); // rawInput grew
    expect(sink.snapshots[2]).not.toBe(sink.snapshots[1]); // rawInput grew again
    // A patch that re-sends what is already there must not rebuild.
    const before = sink.snapshots[3];
    sink.upsertTool('c1', { state: 'input-available', rawInput: '{"city":"Paris"}' });
    expect(sink.snapshots[4]).toBe(before);
  });
});
