// Replays handcrafted chunk fixtures through the adapter and asserts the MESSAGE
// PARTS the kit actually ends up with. No API key, no network.
//
// The sink is the kit's REAL `createAssistantStream` (from `@kitn.ai/ui/state`),
// not a stub, so these tests also pin the kit's part lifecycle and its
// new-reference-per-mutation contract.
import { describe, expect, it } from 'vitest';
import { createAssistantStream, partsToText, type SetMessages } from '@kitn.ai/ui/state';
import type { ChatMessage } from '@kitn.ai/ui/react';
import type { MessagePart, ToolPart } from '@kitn.ai/ui';
import {
  applyToolOutput,
  assistantWireMessage,
  bufferText,
  consumeModelStream,
  toolResultWireMessage,
} from './model-stream';
import { sseJson } from './sse-frames';
import { parseReplyWithCard } from './card-schema';
import {
  FINAL_TURN,
  HIDDEN_REASONING,
  MID_STREAM_ERROR,
  PARALLEL_TOOLS,
  STRUCTURED_BROKEN_TURN,
  STRUCTURED_CARD_TURN,
  TOOL_TURN,
  TRUNCATED_ARGS,
  replay,
  replayBytes,
  replayReadable,
  toSseText,
} from './fixtures/model-chunks';
import type { ModelStreamChunk } from './model-stream';

/** A tiny host: an array of messages plus the functional setter the kit wants. */
function harness() {
  let messages: ChatMessage[] = [];
  const arrayRefs: ChatMessage[][] = [];
  const set: SetMessages = (updater) => {
    messages = updater(messages);
    arrayRefs.push(messages);
  };
  const stream = createAssistantStream(set, { id: 'assistant-1' });
  return { stream, message: () => messages.find((m) => m.id === 'assistant-1')!, arrayRefs };
}

/** Tool panels, in message order. `parts` is a union, so `flatMap` is the narrowing
 *  filter: there is no `message.tools` array any more. */
const toolsOf = (m: ChatMessage): ToolPart[] => m.parts.flatMap((p) => (p.type === 'tool' ? [p.tool] : []));

/** The reasoning block (index 0, the fixtures never emit parallel blocks). */
const reasoningOf = (m: ChatMessage): Extract<MessagePart, { type: 'reasoning' }> | undefined =>
  m.parts.flatMap((p) => (p.type === 'reasoning' ? [p] : []))[0];

/** What the adapter reassembles and pins to a settled ToolPart so the next turn's
 *  wire echo can be rebuilt from the part alone. */
const toolRaw = (id: string, name: string, args: string) => ({
  source: 'custom.model-stream.tool_call',
  payload: { id, name, arguments: args },
});

describe('a tool-calling turn', () => {
  it('reassembles fragmented arguments into one input-available ToolPart', async () => {
    const h = harness();
    const turn = await consumeModelStream(replay(TOOL_TURN), h.stream);

    // --- what the model produced ---
    expect(turn.finishReason).toBe('tool_calls');
    expect(turn.text).toBe('Let me check Paris for you.');
    expect(turn.toolCalls).toHaveLength(1);
    expect(turn.toolCalls[0]).toMatchObject({
      index: 0,
      id: 'call_wx_001',
      name: 'get_weather',
      // the RAW fragments, reassembled byte-for-byte
      argumentsText: '{"city":"Paris","units":"metric"}',
      input: { city: 'Paris', units: 'metric' },
    });
    expect(turn.toolCalls[0].error).toBeUndefined();
    expect(turn.usage).toMatchObject({ reasoningTokens: 38 });

    // --- what the KIT ended up holding ---
    // ORDERED parts, not three parallel fields: the thinking, then the preamble
    // the model wrote before calling the tool, then the tool panel itself.
    expect(h.message().parts).toEqual([
      {
        type: 'reasoning',
        index: 0,
        label: 'Thinking',
        text: 'The user wants weather. I should call get_weather with city=Paris.',
      },
      { type: 'text', text: 'Let me check Paris for you.' },
      {
        type: 'tool',
        tool: {
          type: 'get_weather',
          kind: 'generic',
          toolCallId: 'call_wx_001',
          state: 'input-available',
          input: { city: 'Paris', units: 'metric' },
          raw: toolRaw('call_wx_001', 'get_weather', '{"city":"Paris","units":"metric"}'),
        },
      },
    ]);

    // `ModelTurn.parts` is teed off the same builders, so it cannot drift from
    // what the sink received.
    expect(turn.parts).toEqual(h.message().parts);
  });

  it('never exposes a half-parsed ToolPart: input appears only once the JSON is whole', async () => {
    const h = harness();
    const partials: string[] = [];
    const states: string[] = [];
    await consumeModelStream(replay(TOOL_TURN), h.stream, {
      onToolArgumentsDelta: (call) => {
        partials.push(call.argumentsText);
        // The ToolPart is live in the message at this point: assert it is still
        // `input-streaming` and carries NO partial input.
        const tool = toolsOf(h.message())[0];
        states.push(tool?.state ?? 'missing');
        expect(tool?.input).toBeUndefined();
      },
    });
    expect(partials).toEqual([
      '{"ci',
      '{"city":"Pa',
      '{"city":"Paris","un',
      '{"city":"Paris","units":"me',
      '{"city":"Paris","units":"metric"}',
    ]);
    expect(new Set(states)).toEqual(new Set(['input-streaming']));
  });

  it('hands the kit a NEW message + parts array reference on every mutation', async () => {
    const h = harness();
    await consumeModelStream(replay(TOOL_TURN), h.stream);
    // Every setter call produced a distinct array: the "new reference per chunk"
    // contract <kai-thread> relies on.
    expect(new Set(h.arrayRefs).size).toBe(h.arrayRefs.length);
    expect(h.arrayRefs.length).toBeGreaterThan(5);
    const messageObjects = h.arrayRefs.map((refs) => refs.find((m) => m.id === 'assistant-1'));
    expect(new Set(messageObjects).size).toBe(messageObjects.length);
    const partsArrays = messageObjects.map((m) => m?.parts);
    expect(new Set(partsArrays).size).toBe(partsArrays.length);
  });
});

describe('the full browser path (bytes → SSE → JSON → adapter)', () => {
  it('produces identical parts no matter where the socket splits the bytes', async () => {
    const sse = toSseText(TOOL_TURN);
    const results: { turn: unknown; message: ChatMessage }[] = [];
    for (const size of [1, 3, 17, 64, 4096]) {
      const h = harness();
      const turn = await consumeModelStream(sseJson<ModelStreamChunk>(replayBytes(sse, size)), h.stream);
      results.push({ turn, message: h.message() });
    }
    for (const r of results.slice(1)) {
      expect(r.turn).toEqual(results[0].turn);
      expect(r.message).toEqual(results[0].message);
    }
    expect(toolsOf(results[0].message)[0].input).toEqual({ city: 'Paris', units: 'metric' });
  });

  it('works off a WHATWG ReadableStream (the res.body path) and survives keep-alives', async () => {
    const h = harness();
    const turn = await consumeModelStream(
      sseJson<ModelStreamChunk>(replayReadable(toSseText(TOOL_TURN))),
      h.stream,
    );
    expect(turn.toolCalls[0].input).toEqual({ city: 'Paris', units: 'metric' });
    expect(partsToText(h.message().parts)).toBe('Let me check Paris for you.');
  });

  it('ignores non-JSON frames instead of throwing', async () => {
    const h = harness();
    const raw = 'data: not json at all\n\ndata: {"text":"ok"}\n\ndata: [DONE]\n\n';
    const turn = await consumeModelStream(sseJson<ModelStreamChunk>(replayBytes(raw, 6)), h.stream);
    expect(turn.text).toBe('ok');
  });
});

describe('parallel tool calls', () => {
  it('correlates interleaved fragments by index and picks up a late id', async () => {
    const h = harness();
    const turn = await consumeModelStream(replay(PARALLEL_TOOLS), h.stream);

    expect(turn.toolCalls.map((c) => [c.index, c.id, c.name])).toEqual([
      [0, 'call_a', 'search_docs'],
      [1, 'call_b', 'get_weather'],
    ]);
    expect(turn.toolCalls[0].input).toEqual({ query: 'theming' });
    expect(turn.toolCalls[1].input).toEqual({ city: 'Tokyo' });

    expect(toolsOf(h.message())).toEqual([
      {
        type: 'search_docs',
        kind: 'search',
        toolCallId: 'call_a',
        state: 'input-available',
        input: { query: 'theming' },
        raw: toolRaw('call_a', 'search_docs', '{"query":"theming"}'),
      },
      {
        type: 'get_weather',
        kind: 'generic',
        toolCallId: 'call_b',
        state: 'input-available',
        input: { city: 'Tokyo' },
        raw: toolRaw('call_b', 'get_weather', '{"city":"Tokyo"}'),
      },
    ]);
    // Two panels, no text and no reasoning around them.
    expect(h.message().parts.map((p) => p.type)).toEqual(['tool', 'tool']);
  });
});

describe('failure modes', () => {
  it('moves a truncated argument stream to output-error and says why', async () => {
    const h = harness();
    const turn = await consumeModelStream(replay(TRUNCATED_ARGS), h.stream);

    expect(turn.finishReason).toBe('length');
    expect(turn.toolCalls[0].input).toBeUndefined();
    expect(turn.toolCalls[0].error).toMatch(/token limit/);

    const tool = toolsOf(h.message())[0];
    expect(tool.state).toBe('output-error');
    expect(tool.type).toBe('propose_action');
    expect(tool.errorText).toMatch(/Malformed tool arguments/);
    // The raw fragment is surfaced so a human can see what actually arrived.
    expect(tool.errorText).toContain('Deploy to prod');
    // …and it survives on the part itself, not just in the error prose.
    expect(tool.raw).toEqual(toolRaw('call_cut', 'propose_action', '{"title":"Deploy to prod'));
  });

  it('surfaces an in-band error and fails the in-flight tool call', async () => {
    const h = harness();
    const turn = await consumeModelStream(replay(MID_STREAM_ERROR), h.stream);

    expect(turn.error).toEqual({ code: 'server_error', message: 'Upstream provider dropped the connection' });
    expect(turn.finishReason).toBe('error');
    expect(turn.text).toBe('Checking');
    const tool = toolsOf(h.message())[0];
    expect(tool).toMatchObject({ type: 'get_weather', state: 'output-error' });
    expect(tool.errorText).toMatch(/dropped the connection/);
    // The text that did arrive is kept as its own part, ahead of the dead panel.
    expect(h.message().parts.map((p) => p.type)).toEqual(['text', 'tool']);
  });
});

describe('a plain answer turn', () => {
  it('concatenates content deltas and captures usage', async () => {
    const h = harness();
    const turn = await consumeModelStream(replay(FINAL_TURN), h.stream);
    expect(turn.text).toBe("It's **12 °C** and raining in Paris — take a coat. ☔️");
    // One text part, nothing else: no empty reasoning block, no tool panel.
    expect(h.message().parts).toEqual([
      { type: 'text', text: "It's **12 °C** and raining in Paris — take a coat. ☔️" },
    ]);
    expect(turn.finishReason).toBe('stop');
    expect(turn.usage).toMatchObject({ totalTokens: 858, costUsd: 0.000_081 });
    expect(toolsOf(h.message())).toEqual([]);
  });
});

describe('reasoning', () => {
  it('distinguishes streamed reasoning from a post-hoc token count', async () => {
    const streamed = harness();
    const a = await consumeModelStream(replay(TOOL_TURN), streamed.stream);
    expect(a.reasoningChunks).toBe(2);
    expect(reasoningOf(streamed.message())?.text).not.toBe('');

    const hidden = harness();
    const b = await consumeModelStream(replay(HIDDEN_REASONING), hidden.stream);
    // The model DID reason (512 tokens of it) but nothing streamed, so
    // <kai-reasoning> has nothing to render. The count is the only evidence.
    expect(b.reasoningChunks).toBe(0);
    expect(b.reasoning).toBe('');
    expect(b.usage?.reasoningTokens).toBe(512);
    expect(reasoningOf(hidden.message())).toBeUndefined();
  });

  it('accepts a custom disclosure label', async () => {
    const h = harness();
    await consumeModelStream(replay(TOOL_TURN), h.stream, { reasoningLabel: 'Reasoning' });
    expect(reasoningOf(h.message())?.label).toBe('Reasoning');
  });

  it('pins the provider block to the reasoning part when the bridge supplies one', async () => {
    const h = harness();
    // What server/sdk-bridge.ts attaches when OpenRouter sends `reasoningDetails`
    // rather than a bare `reasoning` string: the untranslated array, so an encoder
    // can echo the block back verbatim instead of rebuilding it.
    const details = [{ type: 'reasoning.encrypted', data: 'BLOB' }];
    const chunks: ModelStreamChunk[] = [
      { reasoning: 'weighed it up' },
      { reasoning: ' carefully', reasoningRaw: { source: 'openrouter.reasoning_details', payload: details } },
      { finishReason: 'stop' },
    ];
    await consumeModelStream(replay(chunks), h.stream);
    expect(reasoningOf(h.message())).toEqual({
      type: 'reasoning',
      index: 0,
      label: 'Thinking',
      text: 'weighed it up carefully',
      raw: { source: 'openrouter.reasoning_details', payload: details },
    });
  });
});

describe('structured outputs (Path B)', () => {
  it('buffers the JSON out of the thread, then sets the prose and yields an envelope', async () => {
    const h = harness();
    const buffered = bufferText(h.stream);
    const turn = await consumeModelStream(replay(STRUCTURED_CARD_TURN), buffered);

    // The raw JSON must NEVER have been appended into the visible message: not
    // as a text part, not as anything.
    expect(h.message().parts).toEqual([]);
    expect(turn.text).toBe(buffered.buffered());
    // `ModelTurn.parts` still reports it: it describes what the MODEL produced,
    // not what the host chose to show.
    expect(turn.parts).toEqual([{ type: 'text', text: buffered.buffered() }]);

    const { value, error } = parseReplyWithCard(buffered.buffered());
    expect(error).toBeUndefined();
    expect(value!.reply).toBe('I can redeploy staging for you — confirm below.');
    expect(value!.card).toEqual({
      type: 'confirm',
      id: 'card-1',
      title: 'Redeploy staging',
      data: {
        body: 'This restarts the staging service.',
        tone: 'warning',
        dismissible: true,
        actions: [
          { id: 'approve', label: 'Redeploy', style: 'primary', default: true },
          { id: 'cancel', label: 'Not now', style: 'default' },
        ],
      },
    });

    // FINDING: `AssistantStream` has no `setText`/`replaceText`. `appendText` is
    // the substitute and is only correct BECAUSE the buffer guarantees the message
    // holds no text part yet, so the append opens the one and only text part.
    h.stream.appendText(value!.reply);
    expect(h.message().parts).toEqual([{ type: 'text', text: 'I can redeploy staging for you — confirm below.' }]);
  });

  it('degrades to a readable error when the model goes off-schema', async () => {
    const h = harness();
    const buffered = bufferText(h.stream);
    await consumeModelStream(replay(STRUCTURED_BROKEN_TURN), buffered);
    const { value, error } = parseReplyWithCard(buffered.buffered());
    expect(value).toBeUndefined();
    expect(error).toMatch(/not valid JSON/);
    // …and the user has seen NOTHING at all, because the text was buffered.
    expect(h.message().parts).toEqual([]);
    expect(partsToText(h.message().parts)).toBe('');
  });
});

describe('the second turn (tool results back to the model)', () => {
  it('completes the ToolPart and builds the wire messages', async () => {
    const h = harness();
    const turn = await consumeModelStream(replay(TOOL_TURN), h.stream);
    const call = turn.toolCalls[0];

    const output = { city: 'Paris', condition: 'Light rain', temperature: 12 };
    applyToolOutput(h.stream, call.id, output);

    expect(toolsOf(h.message())).toEqual([
      {
        type: 'get_weather',
        kind: 'generic',
        toolCallId: 'call_wx_001',
        state: 'output-available',
        input: { city: 'Paris', units: 'metric' },
        output,
        // the patch carried no `raw`, so the settled snapshot survives the merge
        raw: toolRaw('call_wx_001', 'get_weather', '{"city":"Paris","units":"metric"}'),
      },
    ]);

    // The assistant echo must reuse the RAW argument text, not a re-stringify.
    expect(assistantWireMessage(turn)).toEqual({
      role: 'assistant',
      content: 'Let me check Paris for you.',
      toolCalls: [{ id: 'call_wx_001', name: 'get_weather', arguments: '{"city":"Paris","units":"metric"}' }],
    });

    expect(toolResultWireMessage(call, output)).toEqual({
      role: 'tool',
      toolCallId: 'call_wx_001',
      name: 'get_weather',
      content: JSON.stringify(output),
    });
  });

  it('drops unusable tool calls from the assistant echo', async () => {
    const h = harness();
    const turn = await consumeModelStream(replay(TRUNCATED_ARGS), h.stream);
    // Keeps the API invariant: one tool result per echoed tool call.
    expect(assistantWireMessage(turn).toolCalls).toBeUndefined();
  });

  it('opens a SECOND text part for the follow-up answer, after the tool panel', async () => {
    const h = harness();
    await consumeModelStream(replay(TOOL_TURN), h.stream);
    await consumeModelStream(replay(FINAL_TURN), h.stream);
    // FIXED by parts: the pre-tool preamble and the post-tool answer are two
    // separate text parts either side of the panel, in the order they happened.
    // Under the old flat `content` string they were glued into
    // "…for you.It's **12 °C**…" with no separator and no way to order them.
    expect(h.message().parts.map((p) => p.type)).toEqual(['reasoning', 'text', 'tool', 'text']);
    expect(h.message().parts.filter((p) => p.type === 'text')).toEqual([
      { type: 'text', text: 'Let me check Paris for you.' },
      { type: 'text', text: "It's **12 °C** and raining in Paris — take a coat. ☔️" },
    ]);
    // `partsToText` still concatenates for the places that genuinely need a flat
    // string (copy-to-clipboard, the provider wire): that is now a deliberate
    // flattening, not the content model.
    expect(partsToText(h.message().parts)).toBe(
      "Let me check Paris for you.It's **12 °C** and raining in Paris — take a coat. ☔️",
    );
  });
});
