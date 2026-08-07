// Pins the ONE provider-specific layer. The fixtures below are typed as the
// installed SDK's `ChatStreamChunk`, so if @openrouter/sdk renames a field this
// test stops COMPILING — which is the whole point of keeping the mapping thin
// and isolated from `src/model-stream.ts`.
//
// Runs in node with no key and no network.
import { describe, expect, it } from 'vitest';
import type { ChatStreamChunk } from '@openrouter/sdk/models';
import { reasoningTextOf, toModelChunk, toSdkMessages } from './sdk-bridge';
import type { WireMessage } from '../src/model-stream';

const base = {
  id: 'gen-1',
  created: 1_785_000_000,
  model: '~deepseek/deepseek-v4-flash-latest',
  object: 'chat.completion.chunk',
} satisfies Pick<ChatStreamChunk, 'id' | 'created' | 'model' | 'object'>;

const chunk = (
  delta: ChatStreamChunk['choices'][number]['delta'],
  finishReason: ChatStreamChunk['choices'][number]['finishReason'] = null,
): ChatStreamChunk => ({ ...base, choices: [{ index: 0, delta, finishReason }] });

describe('toModelChunk', () => {
  it('maps a text delta', () => {
    expect(toModelChunk(chunk({ content: 'hello' }))).toEqual({ text: 'hello' });
  });

  it('drops role-only / empty frames', () => {
    expect(toModelChunk(chunk({ role: 'assistant', content: '' }))).toBeNull();
  });

  it('camelCase toolCalls → our index/id/name/arguments delta', () => {
    expect(
      toModelChunk(
        chunk({
          toolCalls: [
            { index: 0, id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"ci' } },
          ],
        }),
      ),
    ).toEqual({ toolCalls: [{ index: 0, id: 'call_1', name: 'get_weather', arguments: '{"ci' }] });
  });

  it('keeps an argument fragment that has no id or name', () => {
    expect(toModelChunk(chunk({ toolCalls: [{ index: 1, function: { arguments: 'ty":"Paris"}' } }] }))).toEqual({
      toolCalls: [{ index: 1, arguments: 'ty":"Paris"}' }],
    });
  });

  it('lifts reasoningTokens off the final usage chunk', () => {
    const usageChunk: ChatStreamChunk = {
      ...base,
      choices: [],
      usage: {
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
        cost: 0.000_02,
        completionTokensDetails: { reasoningTokens: 64 },
      },
    };
    expect(toModelChunk(usageChunk)).toEqual({
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120, reasoningTokens: 64, costUsd: 0.000_02 },
    });
  });

  it('passes an in-band error through', () => {
    const errChunk: ChatStreamChunk = {
      ...base,
      choices: [{ index: 0, delta: {}, finishReason: 'error' }],
      error: { code: 502, message: 'provider exploded' },
    };
    expect(toModelChunk(errChunk)).toEqual({
      error: { code: 502, message: 'provider exploded' },
      finishReason: 'error',
    });
  });
});

describe('reasoningTextOf', () => {
  it('prefers `reasoning` so text mirrored into reasoningDetails is not doubled', () => {
    expect(
      reasoningTextOf({ reasoning: 'once', reasoningDetails: [{ type: 'reasoning.text', text: 'once' }] }),
    ).toBe('once');
  });

  it('falls back to reasoningDetails and skips text-free blocks', () => {
    expect(
      reasoningTextOf({
        reasoningDetails: [
          { type: 'reasoning.encrypted', data: 'BLOB' },
          { type: 'reasoning.summary', summary: 'weighed it up' },
        ],
      }),
    ).toBe('weighed it up');
  });

  it('returns empty when there is nothing readable', () => {
    expect(reasoningTextOf({ content: 'hi' })).toBe('');
  });
});

describe('toSdkMessages', () => {
  it('maps our neutral wire messages onto the SDK camelCase union', () => {
    const wire: WireMessage[] = [
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'weather in Paris?' },
      {
        role: 'assistant',
        content: 'Let me check.',
        toolCalls: [{ id: 'call_1', name: 'get_weather', arguments: '{"city":"Paris"}' }],
      },
      { role: 'tool', toolCallId: 'call_1', content: '{"temperature":12}' },
    ];
    expect(toSdkMessages(wire)).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'weather in Paris?' },
      {
        role: 'assistant',
        content: 'Let me check.',
        toolCalls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } }],
      },
      // `toolCallId`, not `tool_call_id` — the SDK serialises it.
      { role: 'tool', toolCallId: 'call_1', content: '{"temperature":12}' },
    ]);
  });

  it('keeps a null assistant content (a pure tool-call turn)', () => {
    expect(toSdkMessages([{ role: 'assistant', content: null }])).toEqual([{ role: 'assistant', content: null }]);
  });
});
