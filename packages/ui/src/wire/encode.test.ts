import { describe, expect, it } from 'vitest';
import { WireEncodeError, toAnthropicMessages, toOpenAIMessages } from './encode';
import type { ChatMessage } from '../elements/chat-types';

const user = (text: string, id = 'u1'): ChatMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
});

describe('toOpenAIMessages', () => {
  it('encodes a plain exchange', () => {
    expect(
      toOpenAIMessages([
        user('Hi'),
        { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] },
      ]),
    ).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
    ]);
  });

  it('joins multiple text parts into one flat content string', () => {
    expect(
      toOpenAIMessages([
        {
          id: 'a1',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Checking. ' },
            {
              type: 'tool',
              tool: {
                type: 'get_weather',
                state: 'output-available',
                toolCallId: 'c1',
                input: { city: 'Paris' },
                rawInput: '{"city":"Paris"}',
                output: { c: 18 },
              },
            },
            { type: 'text', text: 'It is 18C.' },
          ],
        },
      ])[0],
    ).toEqual({
      role: 'assistant',
      content: 'Checking. It is 18C.',
      tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } },
      ],
    });
  });

  it('emits one role:tool message per executed call, right after the assistant', () => {
    const out = toOpenAIMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool',
            tool: { type: 'a', state: 'output-available', toolCallId: 'c1', rawInput: '{}', output: { ok: true } },
          },
          {
            type: 'tool',
            tool: { type: 'b', state: 'output-error', toolCallId: 'c2', rawInput: '{}', errorText: 'boom' },
          },
        ],
      },
    ]);
    expect(out).toHaveLength(3);
    expect(out[0].role).toBe('assistant');
    expect(out[0].content).toBeNull();
    expect(out[0].tool_calls?.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(out[1]).toEqual({ role: 'tool', tool_call_id: 'c1', name: 'a', content: '{"ok":true}' });
    expect(out[2]).toEqual({ role: 'tool', tool_call_id: 'c2', name: 'b', content: 'boom' });
  });

  it('uses rawInput VERBATIM, not a re-stringified parse', () => {
    // Whitespace and key order that JSON.stringify(input) would destroy.
    const rawInput = '{\n  "units": "metric",\n  "city": "Paris"\n}';
    const out = toOpenAIMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool',
            tool: {
              type: 'get_weather',
              state: 'output-available',
              toolCallId: 'c1',
              rawInput,
              input: { city: 'Paris', units: 'metric' },
              output: {},
            },
          },
        ],
      },
    ]);
    expect(out[0].tool_calls?.[0].function.arguments).toBe(rawInput);
  });

  it('falls back to stringifying input when rawInput is absent', () => {
    const out = toOpenAIMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'tool', tool: { type: 't', state: 'output-available', toolCallId: 'c1', input: { a: 1 }, output: {} } },
        ],
      },
    ]);
    expect(out[0].tool_calls?.[0].function.arguments).toBe('{"a":1}');
  });

  it('falls back to {} when a tool carries neither rawInput nor input', () => {
    const out = toOpenAIMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'tool', tool: { type: 't', state: 'output-available', toolCallId: 'c1', rawInput: '', output: {} } },
        ],
      },
    ]);
    // An EMPTY rawInput is not valid JSON, so it must not be echoed verbatim.
    expect(out[0].tool_calls?.[0].function.arguments).toBe('{}');
  });

  it('SKIPS a tool with no result, call and all, to keep the one-call-one-result invariant', () => {
    const out = toOpenAIMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'working' },
          { type: 'tool', tool: { type: 'pending', state: 'input-available', toolCallId: 'c1', input: {} } },
        ],
      },
    ]);
    expect(out).toEqual([{ role: 'assistant', content: 'working' }]);
  });

  it('never synthesises an id for a tool with no toolCallId', () => {
    const out = toOpenAIMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'tool', tool: { type: 't', state: 'output-available', output: {} } }],
      },
    ]);
    expect(out[0].tool_calls).toBeUndefined();
  });

  it('drops kit-side parts', () => {
    const out = toOpenAIMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'hidden', index: 0 },
          { type: 'source', source: { url: 'https://a' } },
          { type: 'card', envelope: { type: 'confirm', id: 'card1', data: {} } },
          { type: 'text', text: 'answer' },
        ],
      },
    ]);
    expect(out).toEqual([{ role: 'assistant', content: 'answer' }]);
  });

  it('does NOT throw on a reasoning part with no raw', () => {
    // The verbatim requirement is Anthropic-only. OpenAI chat completions has no
    // reasoning channel on the way back in at all, so there is nothing to lose.
    expect(() =>
      toOpenAIMessages([
        { id: 'a1', role: 'assistant', parts: [{ type: 'reasoning', text: 'x', index: 0 }] },
      ]),
    ).not.toThrow();
  });
});

describe('toAnthropicMessages', () => {
  const thinkingPayload = {
    type: 'thinking',
    thinking: 'Let me work through this.',
    signature: 'ErUBCkYIARgCIkAd8xVzGx',
  };

  it('emits a reasoning block as raw.payload VERBATIM', () => {
    const out = toAnthropicMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'reasoning',
            text: 'Let me work through this.',
            index: 0,
            signature: 'ErUBCkYIARgCIkAd8xVzGx',
            raw: { source: 'anthropic.content_block', payload: thinkingPayload },
          },
          { type: 'text', text: 'The answer is 42.' },
        ],
      },
    ]);
    expect(out).toEqual([
      {
        role: 'assistant',
        content: [thinkingPayload, { type: 'text', text: 'The answer is 42.' }],
      },
    ]);
    // The exact object, not a rebuild. Synchronous same-process path, so
    // reference identity holds here; the production contract is bytes.
    expect(out[0].content[0]).toBe(thinkingPayload);
  });

  it('THROWS on a reasoning part with no raw', () => {
    expect(() =>
      toAnthropicMessages([
        { id: 'a1', role: 'assistant', parts: [{ type: 'reasoning', text: 'rebuilt me', index: 0 }] },
      ]),
    ).toThrow(WireEncodeError);
    try {
      toAnthropicMessages([
        { id: 'a1', role: 'assistant', parts: [{ type: 'reasoning', text: 'x', index: 0 }] },
      ]);
      expect.unreachable('the encoder must not reconstruct a thinking block');
    } catch (e) {
      const err = e as WireEncodeError;
      expect(err).toBeInstanceOf(WireEncodeError);
      expect(err.messageId).toBe('a1');
      expect(err.partIndex).toBe(0);
      expect(err.message).toContain('verbatim');
    }
  });

  it('reports the partIndex of the offending part, not of the first part', () => {
    try {
      toAnthropicMessages([
        {
          id: 'a9',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'before' },
            { type: 'reasoning', text: 'x', index: 0 },
          ],
        },
      ]);
      expect.unreachable('the encoder must throw');
    } catch (e) {
      expect((e as WireEncodeError).partIndex).toBe(1);
    }
  });

  it('THROWS on a reasoning raw captured from a different format', () => {
    expect(() =>
      toAnthropicMessages([
        {
          id: 'a1',
          role: 'assistant',
          parts: [
            {
              type: 'reasoning',
              text: 'x',
              index: 0,
              raw: { source: 'openai.reasoning_details', payload: [{ type: 'reasoning.text', text: 'x' }] },
            },
          ],
        },
      ]),
    ).toThrow(/anthropic\./);
  });

  it('keeps an EMPTY-text reasoning block, in order', () => {
    const redacted = { type: 'redacted_thinking', data: 'EroB' };
    const out = toAnthropicMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: '', index: 0, raw: { source: 'anthropic.content_block', payload: redacted } },
          { type: 'reasoning', text: 'visible', index: 1, raw: { source: 'anthropic.content_block', payload: thinkingPayload } },
          { type: 'text', text: 'answer' },
        ],
      },
    ]);
    expect(out[0].content).toEqual([redacted, thinkingPayload, { type: 'text', text: 'answer' }]);
  });

  it('emits tool_use with the PROVIDER id and a parsed input object', () => {
    const out = toAnthropicMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool',
            tool: {
              type: 'get_weather',
              state: 'output-available',
              toolCallId: 'toolu_01WX',
              input: { city: 'Paris' },
              rawInput: '{"city":"Paris"}',
              output: { c: 18 },
            },
          },
        ],
      },
    ]);
    expect(out).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'toolu_01WX', name: 'get_weather', input: { city: 'Paris' } }],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_01WX', content: '{"c":18}' }],
      },
    ]);
  });

  it('marks a failed tool result is_error', () => {
    const out = toAnthropicMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool',
            tool: { type: 't', state: 'output-error', toolCallId: 'toolu_02', input: {}, errorText: 'boom' },
          },
        ],
      },
    ]);
    expect(out[1].content).toEqual([
      { type: 'tool_result', tool_use_id: 'toolu_02', is_error: true, content: 'boom' },
    ]);
  });

  it('SKIPS an unsettled tool entirely, both its call and its result', () => {
    const out = toAnthropicMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'working' },
          { type: 'tool', tool: { type: 'pending', state: 'input-available', toolCallId: 'toolu_03', input: {} } },
        ],
      },
    ]);
    expect(out).toEqual([{ role: 'assistant', content: [{ type: 'text', text: 'working' }] }]);
  });

  it('encodes user text and drops empty text blocks', () => {
    expect(
      toAnthropicMessages([
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }, { type: 'text', text: '' }] },
      ]),
    ).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }]);
  });

  it('emits no message for a turn that encodes to nothing', () => {
    expect(
      toAnthropicMessages([{ id: 'a1', role: 'assistant', parts: [{ type: 'source', source: { url: 'https://a' } }] }]),
    ).toEqual([]);
  });
});
