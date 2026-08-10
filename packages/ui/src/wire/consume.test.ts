import { describe, expect, it, vi } from 'vitest';
import { consumeModelStream } from './consume';
import { normalizeStopReason, type AssistantStreamSink, type ModelStreamChunk } from './chunk';
import type { MessagePart } from '../elements/chat-types';
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
    expect(blocks[0].raw?.payload).toEqual({ type: 'redacted_thinking', data: 'EroBCkYIARgCIkDx1VzGxQ==' });
  });

  it('threads the assembled block and its signature onto the streamed part', async () => {
    const turn = await consumeModelStream(replayChunks(REDACTED_THINKING_TURN), nullSink());
    const block = reasoningParts(turn.parts)[1];
    expect(block.text).toBe('Let me work through this.');
    expect(block.signature).toBe('ErUBCkYIARgCIkAd8xVzGx');
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

  it('never blanks an established raw when a later delta omits it', async () => {
    const raw = { source: 'anthropic.content_block', payload: { type: 'thinking', thinking: 'x' } };
    const turn = await consumeModelStream(
      replayChunks([
        { reasoning: 'x', reasoningIndex: 0, reasoningRaw: raw },
        { reasoning: 'y', reasoningIndex: 0 },
      ]),
      nullSink(),
    );
    expect(reasoningParts(turn.parts)[0].raw?.payload).toEqual(raw.payload);
  });

  it('reports hidden reasoning as zero streamed chunks with non-zero tokens', async () => {
    const turn = await consumeModelStream(replayChunks(HIDDEN_REASONING), nullSink());
    expect(turn.reasoningChunks).toBe(0);
    expect(reasoningParts(turn.parts)).toHaveLength(0);
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

describe('consumeModelStream: reference stability', () => {
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
