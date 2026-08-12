import { describe, expect, it } from 'vitest';
import { WireEncodeError, toAnthropicMessages, toOpenAIMessages } from './encode';
import { consumeModelStream } from './consume';
import { readOpenAIStream } from './read';
import { OPENAI_FIXTURES } from './fixtures/openai';
import { nullSink, replayBytes } from './fixtures/replay';
import type { AssistantStreamSink, ModelStreamChunk } from './chunk';
import { appendReasoningPart, appendTextPart, upsertToolPart } from '../state/parts';
import type { ChatMessage, MessagePart } from '../elements/chat-types';

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

  it('SPLITS one assistant turn at the tool boundary, so the answer follows the result', () => {
    // The kit streams a whole turn into ONE message. Flattening it would put the
    // model's answer before the tool result it was based on.
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
      ]),
    ).toEqual([
      {
        role: 'assistant',
        content: 'Checking. ',
        tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'c1', name: 'get_weather', content: '{"c":18}' },
      { role: 'assistant', content: 'It is 18C.' },
    ]);
  });

  it('joins text parts that sit on the SAME side of a tool boundary', () => {
    expect(
      toOpenAIMessages([
        {
          id: 'a1',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Hello, ' },
            { type: 'text', text: 'world.' },
          ],
        },
      ]),
    ).toEqual([{ role: 'assistant', content: 'Hello, world.' }]);
  });

  it('splits again at every later tool boundary', () => {
    const tool = (id: string): Extract<ChatMessage['parts'][number], { type: 'tool' }> => ({
      type: 'tool',
      tool: { type: 't', state: 'output-available', toolCallId: id, rawInput: '{}', output: { id } },
    });
    const out = toOpenAIMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'one' },
          tool('c1'),
          { type: 'text', text: 'two' },
          tool('c2'),
          { type: 'text', text: 'three' },
        ],
      },
    ]);
    expect(out.map((m) => `${m.role}:${m.content ?? ''}`)).toEqual([
      'assistant:one',
      'tool:{"id":"c1"}',
      'assistant:two',
      'tool:{"id":"c2"}',
      'assistant:three',
    ]);
    expect(out[0].tool_calls?.map((c) => c.id)).toEqual(['c1']);
    expect(out[2].tool_calls?.map((c) => c.id)).toEqual(['c2']);
    expect(out[4].tool_calls).toBeUndefined();
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
        parts: [
          { type: 'text', text: 'answer' },
          { type: 'tool', tool: { type: 't', state: 'output-available', output: {} } },
        ],
      },
    ]);
    expect(out).toEqual([{ role: 'assistant', content: 'answer' }]);
    expect(out[0].tool_calls).toBeUndefined();
  });

  it('prefers errorText over output when a tool carries BOTH', () => {
    const out = toOpenAIMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool',
            tool: {
              type: 't',
              state: 'output-error',
              toolCallId: 'c1',
              rawInput: '{}',
              output: { partial: true },
              errorText: 'boom',
            },
          },
        ],
      },
    ]);
    expect(out[1].content).toBe('boom');
    // The Anthropic encoder makes the same call, so the two agree.
    expect(
      toAnthropicMessages([
        {
          id: 'a1',
          role: 'assistant',
          parts: [
            {
              type: 'tool',
              tool: {
                type: 't',
                state: 'output-error',
                toolCallId: 'toolu_1',
                input: {},
                output: { partial: true },
                errorText: 'boom',
              },
            },
          ],
        },
      ])[1].content,
    ).toEqual([{ type: 'tool_result', tool_use_id: 'toolu_1', is_error: true, content: 'boom' }]);
  });

  it('emits NO message for a turn that encodes to nothing', () => {
    // The mirror of the Anthropic case. `{ role: 'assistant', content: null }`
    // with no tool_calls is rejected by strict-compatible endpoints.
    expect(
      toOpenAIMessages([
        {
          id: 'a1',
          role: 'assistant',
          parts: [
            { type: 'reasoning', text: 'thought about it', index: 0 },
            { type: 'tool', tool: { type: 'pending', state: 'input-available', toolCallId: 'c1', input: {} } },
          ],
        },
      ]),
    ).toEqual([]);
  });

  it('emits NO user message for a turn whose only parts are kit-side', () => {
    // Sending `content: ''` carries nothing and is rejected by some endpoints;
    // the Anthropic encoder drops it too. A `source-document` attachment is the
    // citation chip an app renders, not an upload, so it is kit-side and this
    // turn really is empty.
    //
    // This used to be asserted with a REAL attachment, which is how the encoder
    // came to drop uploads silently: an attachment-only turn now encodes to a
    // user message. See encode-files.test.ts.
    expect(
      toOpenAIMessages([
        {
          id: 'u1',
          role: 'user',
          parts: [
            { type: 'file', attachment: { id: 's1', type: 'source-document', title: 'Policy' } },
            { type: 'source', source: { url: 'https://a' } },
          ],
        },
      ]),
    ).toEqual([]);
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
    // The verbatim requirement is Anthropic-only. Omitting reasoning on this wire
    // is accepted by every configuration measured, so an unencodable block is
    // dropped rather than thrown on.
    expect(() =>
      toOpenAIMessages([
        { id: 'a1', role: 'assistant', parts: [{ type: 'reasoning', text: 'x', index: 0 }] },
      ]),
    ).not.toThrow();
  });
});

/**
 * REASONING BACK ONTO THE OPENAI WIRE, PROVED AGAINST RECORDED STREAMS.
 *
 * Two captures carry this whole block, both copied byte-for-byte out of the
 * spike's live conformance sweep:
 *
 *   `reasoning-signed-tool-call`    anthropic/claude-haiku-4.5 on the OPENAI wire.
 *                                   21 `reasoning_details` entries; the last one
 *                                   carries the signature and NO text.
 *   `reasoning-encrypted-summary`   openai/gpt-5.4-mini. 76 `reasoning.summary`
 *                                   entries at block index 0, then ONE
 *                                   `reasoning.encrypted` entry at index 1.
 *
 * Hand-written frames are deliberately not used for the shapes: a wire test
 * written from imagination asserts a shape no provider sends. The only synthetic
 * part in here is the post-tool ORDERING case, which needs a second round the
 * captures do not contain; its block is copied field-for-field off the recorded
 * one and the test says so.
 */
describe('toOpenAIMessages reasoning', () => {
  const readFixture = (name: string) => {
    const sse = OPENAI_FIXTURES[name];
    if (!sse) throw new Error(`missing fixture openai/${name}`);
    return readOpenAIStream(replayBytes(sse, 17), nullSink());
  };

  const reasoningParts = (parts: MessagePart[]) =>
    parts.filter((p): p is Extract<MessagePart, { type: 'reasoning' }> => p.type === 'reasoning');

  /** The recorded turn as a host holds it AFTER running the tool it announced.
   *  An unsettled call encodes to nothing, so without this the turn would not
   *  produce an assistant message at all and there would be nothing to assert. */
  const settled = (parts: MessagePart[]): MessagePart[] =>
    parts.map((p) =>
      p.type === 'tool'
        ? { ...p, tool: { ...p.tool, state: 'output-available' as const, output: { c: 18 } } }
        : p,
    );

  const assistantOf = (parts: MessagePart[], reasoning?: 'omit' | 'include') =>
    toOpenAIMessages(
      [user('What is the weather in Paris?'), { id: 'a1', role: 'assistant', parts }],
      reasoning ? { reasoning } : undefined,
    );

  it('round-trips a SIGNED reasoning block, signature intact', async () => {
    const turn = await readFixture('reasoning-signed-tool-call');
    const part = reasoningParts(turn.parts)[0];
    const out = assistantOf(settled(turn.parts), 'include');

    // assistant(reasoning + tool_calls) -> tool(result). The reasoning belongs to
    // the message that ANNOUNCED the call, not to a later one.
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
    const assistant = out[1];
    expect(assistant.tool_calls).toHaveLength(1);
    expect(assistant.reasoning_details).toEqual([
      {
        type: 'reasoning.text',
        text: part.text,
        signature: part.signature,
        format: 'anthropic-claude-v1',
        index: 0,
      },
    ]);
    // The signature is the load-bearing field: stripping it is a hard 400 from
    // Anthropic upstream, measured, on all four providers OpenRouter tried.
    expect(assistant.reasoning_details?.[0].signature).toMatch(/^EqkECkgIEBABGAIqQ/);
  });

  it('emits the REASSEMBLED block, never the textless signature fragment in `raw`', async () => {
    const turn = await readFixture('reasoning-signed-tool-call');
    const part = reasoningParts(turn.parts)[0];

    // THE TRAP, asserted on the recorded data itself. `appendReasoningPart`
    // resolves `raw` last-write-wins and the signature arrives in the FINAL
    // frame, alone, so `raw` is one fragment and not the block.
    const fragment = (part.raw?.payload as Record<string, unknown>[])[0];
    expect(part.raw?.source).toBe('openai.reasoning_details');
    expect(fragment.text).toBeUndefined();
    expect(fragment.signature).toEqual(expect.any(String));
    // ...while the assembled reasoning lives in the part's own fields.
    expect(part.text.length).toBeGreaterThan(300);

    const entry = assistantOf(settled(turn.parts), 'include')[1].reasoning_details?.[0];
    // An encoder that echoed `raw`, the way the Anthropic one does, sends the
    // fragment: same signature, no text. Both halves have to be checked, because
    // the signature alone passes either way.
    expect(entry?.text).toBe(part.text);
    expect(entry).not.toEqual(fragment);
  });

  it('sends an ENCRYPTED block verbatim and DROPS the unsigned summary beside it', async () => {
    const turn = await readFixture('reasoning-encrypted-summary');
    const parts = reasoningParts(turn.parts);
    // One turn, two block indices: the readable summary and the opaque carrier.
    expect(parts.map((p) => p.index)).toEqual([0, 1]);
    expect(parts[0].text.length).toBeGreaterThan(300);
    expect(parts[1].text).toBe('');

    const encrypted = (parts[1].raw?.payload as Record<string, unknown>[])[0];
    const out = assistantOf(turn.parts, 'include');
    const details = out[1].reasoning_details;

    // `data` cannot be rebuilt from text plus signature -- there is no text and no
    // signature -- so this is the one entry that has to go back exactly as it came.
    expect(details).toEqual([encrypted]);
    expect(details?.[0].data).toEqual(expect.any(String));
    expect(details?.[0].id).toEqual(expect.any(String));
    // The summary carries no signature and no `data`, so nothing the provider can
    // verify. It also proves the fragment trap twice over: its own `raw` is the
    // last summary delta, the single character '.'.
    expect((parts[0].raw?.payload as Record<string, unknown>[])[0].summary).toBe('.');
    expect(details).toHaveLength(1);
  });

  it('DROPS reasoning with text but nothing verifiable, from a real deepseek capture', async () => {
    const turn = await readFixture('reasoning-both-fields');
    const part = reasoningParts(turn.parts)[0];
    expect(part.text.length).toBeGreaterThan(50);
    expect(part.signature).toBeUndefined();
    expect((part.raw?.payload as Record<string, unknown>[])[0].format).toBe('unknown');

    const out = assistantOf(turn.parts, 'include');
    expect(out[1].reasoning_details).toBeUndefined();
  });

  it('puts a post-tool reasoning block on the assistant message AFTER the tool result', async () => {
    // The second block is SYNTHETIC: the captures are single-round, so there is no
    // recorded post-tool block to use. Its fields are copied off the recorded one.
    const turn = await readFixture('reasoning-signed-tool-call');
    const first = reasoningParts(turn.parts)[0];
    const second: MessagePart = {
      type: 'reasoning',
      text: 'Paris is 18C, so I can answer now.',
      index: 0,
      streamId: 'round-2',
      signature: 'EqkE-ROUND-2-SIGNATURE',
      raw: {
        source: 'openai.reasoning_details',
        payload: [
          {
            type: 'reasoning.text',
            signature: 'EqkE-ROUND-2-SIGNATURE',
            format: 'anthropic-claude-v1',
            index: 0,
          },
        ],
      },
    };
    const out = assistantOf([...settled(turn.parts), second, { type: 'text', text: 'It is 18C.' }], 'include');

    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect(out[1].reasoning_details?.[0].signature).toBe(first.signature);
    expect(out[3].content).toBe('It is 18C.');
    expect(out[3].reasoning_details).toEqual([
      {
        type: 'reasoning.text',
        text: 'Paris is 18C, so I can answer now.',
        signature: 'EqkE-ROUND-2-SIGNATURE',
        format: 'anthropic-claude-v1',
        index: 0,
      },
    ]);
  });

  it('OMITS reasoning by default, on the same thread that carries it', async () => {
    // The opt-in guarantee. Every configuration measured returns 200 with the
    // reasoning omitted, and sending it costs ~25% more prompt tokens per round,
    // so the working path stays the default and nothing changes for a caller that
    // does not ask.
    const turn = await readFixture('reasoning-signed-tool-call');
    const parts = settled(turn.parts);
    expect(assistantOf(parts)).toEqual(assistantOf(parts, 'omit'));
    for (const message of assistantOf(parts)) {
      expect('reasoning_details' in message).toBe(false);
    }
  });

  it('leaves a thread with NO reasoning byte-identical, either way', () => {
    // The regression pin. This is what `toOpenAIMessages` emits today and must
    // keep emitting: no new key, no reordering, on the path that already works.
    const thread: ChatMessage[] = [
      user('What is the weather in Paris?'),
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
    ];
    const expected = [
      { role: 'user', content: 'What is the weather in Paris?' },
      {
        role: 'assistant',
        content: 'Checking. ',
        tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'c1', name: 'get_weather', content: '{"c":18}' },
      { role: 'assistant', content: 'It is 18C.' },
    ];
    expect(toOpenAIMessages(thread)).toEqual(expected);
    // Asking for reasoning on a thread that has none must not change one byte.
    expect(JSON.stringify(toOpenAIMessages(thread, { reasoning: 'include' }))).toBe(
      JSON.stringify(expected),
    );
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

  /** The Anthropic mirror of the OpenAI split test above. Flattened, this emits
   *  tool_use then text("It is 72F.") then user[tool_result], so the model's
   *  answer precedes the result it was based on. */
  it('SPLITS one assistant turn at the tool boundary, so the answer follows the result', () => {
    const out = toAnthropicMessages([
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
              toolCallId: 'toolu_01',
              input: { city: 'SF' },
              output: { f: 72 },
            },
          },
          { type: 'text', text: 'It is 72F.' },
        ],
      },
    ]);
    expect(out).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Checking. ' },
          { type: 'tool_use', id: 'toolu_01', name: 'get_weather', input: { city: 'SF' } },
        ],
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01', content: '{"f":72}' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'It is 72F.' }] },
    ]);
  });

  it('splits again at every later tool boundary', () => {
    const tool = (id: string): Extract<ChatMessage['parts'][number], { type: 'tool' }> => ({
      type: 'tool',
      tool: { type: 't', state: 'output-available', toolCallId: id, input: {}, output: { id } },
    });
    const out = toAnthropicMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'one' },
          tool('toolu_1'),
          { type: 'text', text: 'two' },
          tool('toolu_2'),
          { type: 'text', text: 'three' },
        ],
      },
    ]);
    expect(out.map((m) => `${m.role}:${m.content.map((b) => b.type).join(',')}`)).toEqual([
      'assistant:text,tool_use',
      'user:tool_result',
      'assistant:text,tool_use',
      'user:tool_result',
      'assistant:text',
    ]);
  });

  /** A round-2 thinking block belongs to the assistant message that READ the
   *  result, never to the one that requested it. */
  it('puts a post-tool reasoning block in the message AFTER the tool result', () => {
    const out = toAnthropicMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool',
            tool: { type: 't', state: 'output-available', toolCallId: 'toolu_1', input: {}, output: {} },
          },
          {
            type: 'reasoning',
            text: 'Now I know.',
            index: 0,
            streamId: 'wire-2',
            raw: { source: 'anthropic.content_block', payload: thinkingPayload },
          },
          { type: 'text', text: 'Done.' },
        ],
      },
    ]);
    expect(out.map((m) => m.role)).toEqual(['assistant', 'user', 'assistant']);
    expect(out[2].content).toEqual([thinkingPayload, { type: 'text', text: 'Done.' }]);
  });

  it('MERGES adjacent user messages rather than emitting two turns in a row', () => {
    const out = toAnthropicMessages([
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool',
            tool: { type: 't', state: 'output-available', toolCallId: 'toolu_1', input: {}, output: { ok: true } },
          },
        ],
      },
      user('And also this', 'u2'),
    ]);
    expect(out.map((m) => m.role)).toEqual(['assistant', 'user']);
    // The tool_result stays FIRST; the later user turn is appended after it.
    expect(out[1].content).toEqual([
      { type: 'tool_result', tool_use_id: 'toolu_1', content: '{"ok":true}' },
      { type: 'text', text: 'And also this' },
    ]);
  });

  it('merges two consecutive user turns', () => {
    expect(toAnthropicMessages([user('first', 'u1'), user('second', 'u2')])).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'first' }, { type: 'text', text: 'second' }] },
    ]);
  });
});

/**
 * THE HEADLINE GUARANTEE, end to end: two Anthropic rounds read into ONE assistant
 * message must round-trip with BOTH provider thinking blocks intact, byte for byte
 * and in order.
 *
 * This drives the real adapter twice over ONE sink -- exactly what a tool loop does
 * with a single `streamAssistant()` -- so it covers the per-stream namespacing in
 * `consume.ts`, the keying in `appendReasoningPart`, and the turn split in
 * `toAnthropicMessages` together. Anthropic restarts content-block indices at 0 on
 * the second round, which is the whole point: both rounds use index 0.
 */
describe('two Anthropic rounds through one sink', () => {
  const ROUND_1_BLOCK = { type: 'thinking', thinking: 'R1 thinking.', signature: 'SIG-ROUND-1' };
  const ROUND_2_BLOCK = { type: 'thinking', thinking: 'R2 thinking.', signature: 'SIG-ROUND-2' };

  /** The sink a host owns across rounds: one parts array, the kit's own builders. */
  function sharedSink(): AssistantStreamSink & { parts(): MessagePart[] } {
    let parts: MessagePart[] = [];
    return {
      appendText(delta) {
        parts = appendTextPart(parts, delta);
      },
      appendReasoning(delta, opts) {
        parts = appendReasoningPart(parts, delta, opts);
      },
      upsertTool(toolCallId, patch) {
        parts = upsertToolPart(parts, toolCallId, patch);
      },
      parts: () => parts,
    };
  }

  async function* replay(chunks: ModelStreamChunk[]): AsyncGenerator<ModelStreamChunk> {
    for (const chunk of chunks) yield chunk;
  }

  // Round 1: think (block 0), then call a tool (block 1).
  const ROUND_1: ModelStreamChunk[] = [
    { reasoning: 'R1 thinking.', reasoningIndex: 0 },
    { reasoning: '', reasoningIndex: 0, reasoningSignature: 'SIG-ROUND-1' },
    { reasoning: '', reasoningIndex: 0, reasoningRaw: { source: 'anthropic.content_block', payload: ROUND_1_BLOCK } },
    { toolCalls: [{ index: 1, id: 'toolu_01', name: 'get_weather' }] },
    { toolCalls: [{ index: 1, arguments: '{"city":"SF"}' }] },
    { finishReason: 'tool_use' },
  ];

  // Round 2: a NEW response, so the provider's block indices START OVER at 0.
  const ROUND_2: ModelStreamChunk[] = [
    { reasoning: 'R2 thinking.', reasoningIndex: 0 },
    { reasoning: '', reasoningIndex: 0, reasoningSignature: 'SIG-ROUND-2' },
    { reasoning: '', reasoningIndex: 0, reasoningRaw: { source: 'anthropic.content_block', payload: ROUND_2_BLOCK } },
    { text: 'It is 72F in SF.' },
    { finishReason: 'end_turn' },
  ];

  async function runBothRounds(): Promise<MessagePart[]> {
    const sink = sharedSink();
    await consumeModelStream(replay(ROUND_1), sink);
    // The host executes the tool and reports the result, as `applyToolOutput` does.
    sink.upsertTool('toolu_01', { state: 'output-available', output: { f: 72 } });
    await consumeModelStream(replay(ROUND_2), sink);
    return sink.parts();
  }

  it('keeps both rounds as SEPARATE reasoning parts', async () => {
    const parts = await runBothRounds();
    const reasoning = parts.filter(
      (p): p is Extract<MessagePart, { type: 'reasoning' }> => p.type === 'reasoning',
    );
    expect(reasoning).toHaveLength(2);
    expect(reasoning[0].text).toBe('R1 thinking.');
    expect(reasoning[1].text).toBe('R2 thinking.');
    // Distinct namespaces are what makes two index-0 blocks two parts.
    expect(reasoning[0].streamId).not.toBe(reasoning[1].streamId);
  });

  it('round-trips BOTH provider blocks byte-identically, in order', async () => {
    const parts = await runBothRounds();
    const out = toAnthropicMessages([{ id: 'a1', role: 'assistant', parts }]);

    // assistant(think1, tool_use) -> user(tool_result) -> assistant(think2, text)
    expect(out.map((m) => m.role)).toEqual(['assistant', 'user', 'assistant']);
    expect(out[0].content.map((b) => b.type)).toEqual(['thinking', 'tool_use']);
    expect(out[1].content.map((b) => b.type)).toEqual(['tool_result']);
    expect(out[2].content.map((b) => b.type)).toEqual(['thinking', 'text']);

    // Byte-identical is the actual contract; reference identity is the stronger
    // claim that holds on this synchronous path.
    expect(JSON.stringify(out[0].content[0])).toBe(JSON.stringify(ROUND_1_BLOCK));
    expect(JSON.stringify(out[2].content[0])).toBe(JSON.stringify(ROUND_2_BLOCK));
    expect(out[0].content[0]).toBe(ROUND_1_BLOCK);
    expect(out[2].content[0]).toBe(ROUND_2_BLOCK);

    // The failure this exists to catch: one thinking block carrying SIG-ROUND-2 in
    // round 1's position, with round 1's block gone entirely.
    expect(JSON.stringify(out)).toContain('SIG-ROUND-1');
    expect(JSON.stringify(out)).toContain('SIG-ROUND-2');
  });

  it('puts the tool result BEFORE the answer that used it', async () => {
    const parts = await runBothRounds();
    const out = toAnthropicMessages([{ id: 'a1', role: 'assistant', parts }]);
    const flat = JSON.stringify(out);
    expect(flat.indexOf('tool_result')).toBeLessThan(flat.indexOf('It is 72F in SF.'));
  });
});
