import { describe, expect, it } from 'vitest';
import { openaiChatFormat } from './openai';

const push = (frame: unknown) => openaiChatFormat.open().push(frame);

describe('openaiChatFormat', () => {
  it('has a stable id', () => {
    expect(openaiChatFormat.id).toBe('openai.chat-completions');
  });

  it('maps a content delta to text', () => {
    expect(push({ choices: [{ delta: { content: 'Hello' } }] })).toEqual([{ text: 'Hello' }]);
  });

  it('maps finish_reason verbatim', () => {
    expect(push({ choices: [{ delta: {}, finish_reason: 'length' }] })).toEqual([
      { finishReason: 'length' },
    ]);
  });

  it('maps usage, including reasoning tokens, cached tokens and cost', () => {
    expect(
      push({
        choices: [],
        usage: {
          prompt_tokens: 640,
          completion_tokens: 71,
          total_tokens: 711,
          completion_tokens_details: { reasoning_tokens: 38 },
          prompt_tokens_details: { cached_tokens: 512 },
          cost: 0.000081,
        },
      }),
    ).toEqual([
      {
        usage: {
          inputTokens: 640,
          outputTokens: 71,
          totalTokens: 711,
          reasoningTokens: 38,
          cachedInputTokens: 512,
          costUsd: 0.000081,
        },
      },
    ]);
  });

  it('maps tool_call fragments, keeping the array index as the correlator', () => {
    expect(
      push({
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'call_a', function: { name: 'get_weather', arguments: '' } },
                { index: 1, function: { arguments: '{"ci' } },
              ],
            },
          },
        ],
      }),
    ).toEqual([
      {
        toolCalls: [
          { index: 0, id: 'call_a', name: 'get_weather', arguments: '' },
          { index: 1, arguments: '{"ci' },
        ],
      },
    ]);
  });

  it('prefers `reasoning` over `reasoning_details` text (the doubling trap)', () => {
    const out = push({
      choices: [
        {
          delta: {
            reasoning: 'Weighing options.',
            reasoning_details: [{ type: 'reasoning.text', text: 'Weighing options.', index: 0 }],
          },
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].reasoning).toBe('Weighing options.');
    expect(out[0].reasoningIndex).toBe(0);
    expect(out[0].reasoningRaw).toEqual({
      source: 'openai.reasoning_details',
      payload: [{ type: 'reasoning.text', text: 'Weighing options.', index: 0 }],
    });
  });

  it('falls back to reasoning_details text when `reasoning` is absent or empty', () => {
    expect(
      push({ choices: [{ delta: { reasoning_details: [{ type: 'reasoning.text', text: 'abc' }] } }] })[0]
        .reasoning,
    ).toBe('abc');
    expect(
      push({
        choices: [
          { delta: { reasoning: '', reasoning_details: [{ type: 'reasoning.text', text: 'abc' }] } },
        ],
      })[0].reasoning,
    ).toBe('abc');
  });

  it('emits an EMPTY reasoning delta for an encrypted-only detail entry', () => {
    // No readable text, but a payload that must round-trip. This is exactly the
    // case the old `if (chunk.reasoning)` guard threw away.
    const out = push({
      choices: [
        { delta: { reasoning_details: [{ type: 'reasoning.encrypted', data: 'EroBCkYIA==' }] } },
      ],
    });
    expect(out[0].reasoning).toBe('');
    expect(out[0].reasoningRaw?.payload).toEqual([
      { type: 'reasoning.encrypted', data: 'EroBCkYIA==' },
    ]);
  });

  it('carries a signature off a reasoning detail', () => {
    const out = push({
      choices: [
        { delta: { reasoning_details: [{ type: 'reasoning.text', text: 'x', signature: 'SIG' }] } },
      ],
    });
    expect(out[0].reasoningSignature).toBe('SIG');
  });

  it('maps url_citation annotations to sources', () => {
    const out = push({
      choices: [
        {
          delta: {
            annotations: [
              { type: 'url_citation', url_citation: { url: 'https://a', title: 'A', content: 'snip' } },
              { type: 'url_citation' },
            ],
          },
        },
      ],
    });
    expect(out[0].sources).toEqual([{ url: 'https://a', title: 'A', snippet: 'snip' }]);
  });

  it('maps an in-band error frame', () => {
    expect(push({ error: { code: 'server_error', message: 'upstream dropped' } })).toEqual([
      { error: { message: 'upstream dropped', code: 'server_error' } },
    ]);
  });

  it('returns [] for frames that carry nothing, and never throws', () => {
    expect(push({ choices: [{ delta: { role: 'assistant' } }] })).toEqual([]);
    expect(push({ choices: [] })).toEqual([]);
    expect(push({})).toEqual([]);
    expect(push(null)).toEqual([]);
    expect(push('not an object')).toEqual([]);
    expect(push({ choices: [{ delta: { content: null } }] })).toEqual([]);
    expect(push({ object: 'chat.completion.chunk', system_fingerprint: 'fp_x' })).toEqual([]);
  });

  it('is stateless: two readers share nothing', () => {
    const a = openaiChatFormat.open();
    const b = openaiChatFormat.open();
    a.push({ choices: [{ delta: { content: 'one' } }] });
    expect(b.push({ choices: [{ delta: { content: 'two' } }] })).toEqual([{ text: 'two' }]);
  });
});
