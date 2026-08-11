import { describe, expect, it } from 'vitest';
import { anthropicMessagesFormat } from './anthropic';
import type { ModelStreamChunk } from '../chunk';

/** Drive a whole event sequence through ONE reader and flatten the chunks. */
function run(frames: unknown[]): ModelStreamChunk[] {
  const reader = anthropicMessagesFormat.open();
  return frames.flatMap((f) => reader.push(f));
}

describe('anthropicMessagesFormat', () => {
  it('has a stable id', () => {
    expect(anthropicMessagesFormat.id).toBe('anthropic.messages');
  });

  it('maps message_start usage', () => {
    expect(
      run([
        {
          type: 'message_start',
          message: {
            id: 'msg_1',
            role: 'assistant',
            usage: { input_tokens: 40, output_tokens: 1, cache_read_input_tokens: 12 },
          },
        },
      ]),
    ).toEqual([{ usage: { inputTokens: 40, outputTokens: 1, cachedInputTokens: 12 } }]);
  });

  it('maps a text block through its deltas', () => {
    expect(
      run([
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' there' } },
        { type: 'content_block_stop', index: 0 },
      ]),
    ).toEqual([{ text: 'Hello' }, { text: ' there' }]);
  });

  it('opens a reasoning part at content_block_start so block ORDER survives', () => {
    const out = run([
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    ]);
    expect(out).toEqual([{ reasoning: '', reasoningIndex: 0 }]);
  });

  it('assembles a thinking block and emits it VERBATIM at content_block_stop', () => {
    const out = run([
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'Let me work ' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'through this.' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'signature_delta', signature: 'ErUBCkY' },
      },
      { type: 'content_block_stop', index: 0 },
    ]);
    expect(out.map((c) => c.reasoning)).toEqual(['', 'Let me work ', 'through this.', '', '']);
    expect(out[3].reasoningSignature).toBe('ErUBCkY');
    expect(out[4].reasoningRaw).toEqual({
      source: 'anthropic.content_block',
      payload: { type: 'thinking', thinking: 'Let me work through this.', signature: 'ErUBCkY' },
    });
  });

  it('emits a redacted_thinking block whole at content_block_start', () => {
    const block = { type: 'redacted_thinking', data: 'EroBCkYIARgCIkDx1VzGxQ==' };
    const out = run([{ type: 'content_block_start', index: 1, content_block: block }]);
    expect(out).toEqual([
      {
        reasoning: '',
        reasoningIndex: 1,
        reasoningRaw: { source: 'anthropic.content_block', payload: block },
      },
    ]);
  });

  it('emits nothing extra at content_block_stop for a redacted block', () => {
    const block = { type: 'redacted_thinking', data: 'EroB' };
    const out = run([
      { type: 'content_block_start', index: 0, content_block: block },
      { type: 'content_block_stop', index: 0 },
    ]);
    expect(out).toHaveLength(1);
  });

  it('maps a tool_use block through input_json_delta', () => {
    expect(
      run([
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 'toolu_01', name: 'get_weather', input: {} },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '{"ci' },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: 'ty":"Paris"}' },
        },
        { type: 'content_block_stop', index: 1 },
      ]),
    ).toEqual([
      { toolCalls: [{ index: 1, id: 'toolu_01', name: 'get_weather' }] },
      { toolCalls: [{ index: 1, arguments: '{"ci' }] },
      { toolCalls: [{ index: 1, arguments: 'ty":"Paris"}' }] },
    ]);
  });

  it('routes a web_search_tool_result back to its server_tool_use block index', () => {
    const out = run([
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'server_tool_use', id: 'srvtoolu_01', name: 'web_search' },
      },
      {
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'web_search_tool_result',
          tool_use_id: 'srvtoolu_01',
          content: [{ title: 'AI/UI', url: 'https://ui.kitn.ai' }],
        },
      },
    ]);
    expect(out[1]).toEqual({
      toolCalls: [
        {
          index: 0,
          id: 'srvtoolu_01',
          output: { content: [{ title: 'AI/UI', url: 'https://ui.kitn.ai' }] },
        },
      ],
    });
  });

  it('reports a failed provider-executed search as outputError', () => {
    const out = run([
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'server_tool_use', id: 'srvtoolu_01', name: 'web_search' },
      },
      {
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'web_search_tool_result',
          tool_use_id: 'srvtoolu_01',
          content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' },
        },
      },
    ]);
    expect(out[1].toolCalls?.[0].outputError).toBe('max_uses_exceeded');
  });

  it('maps a citations_delta to a source', () => {
    expect(
      run([
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'citations_delta',
            citation: {
              type: 'web_search_result_location',
              url: 'https://a',
              title: 'A',
              cited_text: 'snip',
            },
          },
        },
      ]),
    ).toEqual([{ sources: [{ url: 'https://a', title: 'A', snippet: 'snip' }] }]);
  });

  it('maps message_delta stop_reason verbatim plus its usage', () => {
    expect(
      run([{ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 71 } }]),
    ).toEqual([{ finishReason: 'tool_use', usage: { outputTokens: 71 } }]);
  });

  it('maps an error frame', () => {
    expect(run([{ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }])).toEqual([
      { error: { message: 'Overloaded', code: 'overloaded_error' } },
    ]);
  });

  it('ignores ping, message_stop and any unrecognized event without throwing', () => {
    expect(run([{ type: 'ping' }, { type: 'message_stop' }, { type: 'something_new_2027' }])).toEqual(
      [],
    );
    expect(anthropicMessagesFormat.open().push(null)).toEqual([]);
    expect(anthropicMessagesFormat.open().push('not an object')).toEqual([]);
    expect(anthropicMessagesFormat.open().push({ type: 'content_block_delta', index: 0 })).toEqual([]);
  });

  it('is stateful per open(): two readers share nothing', () => {
    const a = anthropicMessagesFormat.open();
    const b = anthropicMessagesFormat.open();
    a.push({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } });
    a.push({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'from A' } });
    // b never saw a content_block_start, so it has no block state to leak into.
    expect(b.push({ type: 'content_block_stop', index: 0 })).toEqual([]);
    // and a still has its own.
    expect(a.push({ type: 'content_block_stop', index: 0 })[0].reasoningRaw?.payload).toEqual({
      type: 'thinking',
      thinking: 'from A',
    });
  });

  it('keeps parallel thinking blocks on distinct indexes', () => {
    const out = run([
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
      { type: 'content_block_start', index: 1, content_block: { type: 'thinking', thinking: '' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'thinking_delta', thinking: 'second' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'first' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_stop', index: 1 },
    ]);
    const stops = out.filter((c) => c.reasoningRaw);
    expect(stops[0].reasoningIndex).toBe(0);
    expect(stops[0].reasoningRaw?.payload).toEqual({ type: 'thinking', thinking: 'first' });
    expect(stops[1].reasoningIndex).toBe(1);
    expect(stops[1].reasoningRaw?.payload).toEqual({ type: 'thinking', thinking: 'second' });
  });

  // The reason this format is in v1. Anthropic returns 400 invalid_request_error
  // if a thinking or redacted_thinking block in the most recent assistant message
  // is modified, reordered, filtered or reconstructed, so the payload we hand an
  // encoder has to be the provider's own block byte for byte. JSON.stringify
  // equality is the assertion that catches a key-order or extra-key drift that
  // toEqual would wave through.
  describe('verbatim round-trip payload', () => {
    it('rebuilds a streamed thinking block byte-identically to the provider block', () => {
      // What Anthropic sends back non-streamed, and what must go back up on the
      // next turn untouched.
      const providerBlock = {
        type: 'thinking',
        thinking: 'The user asked for the capital. That is Paris.',
        signature: 'ErUBCkYIBRgCIkDx1VzGxQnhcHXmEs8pOhVnJGkAdQ==',
      };
      const out = run([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'thinking', thinking: '' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'The user asked for the capital. ' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'That is Paris.' },
        },
        // The signature always lands AFTER the last thinking_delta, which is why
        // the complete block is only knowable at content_block_stop.
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'signature_delta', signature: providerBlock.signature },
        },
        { type: 'content_block_stop', index: 0 },
      ]);

      const emitted = out.at(-1)?.reasoningRaw;
      expect(emitted?.source).toBe('anthropic.content_block');
      expect(JSON.stringify(emitted?.payload)).toBe(JSON.stringify(providerBlock));
    });

    it('passes a redacted_thinking block through byte-identically, with no text at all', () => {
      const providerBlock = {
        type: 'redacted_thinking',
        data: 'EroBCkYIARgCIkDx1VzGxQnhcHXmEs8pOhVnJGkAdQwSDExvcmVtIGlwc3VtGgxkb2xvciBzaXQ=',
      };
      const out = run([
        { type: 'content_block_start', index: 0, content_block: providerBlock },
        { type: 'content_block_stop', index: 0 },
      ]);

      expect(out).toHaveLength(1);
      expect(out[0].reasoning).toBe('');
      expect(JSON.stringify(out[0].reasoningRaw?.payload)).toBe(JSON.stringify(providerBlock));
    });
  });
});
