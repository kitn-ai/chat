import { describe, expect, it } from 'vitest';
import { WireEncodeError, toAnthropicMessages, toOpenAIMessages } from './encode';
import { consumeModelStream } from './consume';
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

  it('emits NO user message for a turn with no text', () => {
    // An attachment-only turn. Sending `content: ''` carries nothing and is
    // rejected by some endpoints; the Anthropic encoder drops it too.
    expect(
      toOpenAIMessages([
        {
          id: 'u1',
          role: 'user',
          parts: [{ type: 'file', attachment: { id: 'f1', type: 'file', filename: 'a.pdf' } }],
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
