// Replays handcrafted chunk fixtures through the adapter and asserts the MESSAGE
// PARTS the kit actually ends up with. No API key, no network.
//
// The sink is the kit's REAL `createAssistantStream` (from `@kitn.ai/ui/state`),
// not a stub — so these tests also pin the kit's ToolPart lifecycle and its
// new-reference-per-mutation contract.
import { describe, expect, it } from 'vitest';
import { createAssistantStream, type SetMessages } from '@kitn.ai/ui/state';
import type { ChatMessage } from '@kitn.ai/ui/react';
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
    const m = h.message();
    expect(m.content).toBe('Let me check Paris for you.');
    expect(m.reasoning).toEqual({
      text: 'The user wants weather. I should call get_weather with city=Paris.',
      label: 'Thinking',
    });
    expect(m.tools).toEqual([
      {
        type: 'get_weather',
        toolCallId: 'call_wx_001',
        state: 'input-available',
        input: { city: 'Paris', units: 'metric' },
      },
    ]);
  });

  it('never exposes a half-parsed ToolPart: input appears only once the JSON is whole', async () => {
    const h = harness();
    const partials: string[] = [];
    const states: string[] = [];
    await consumeModelStream(replay(TOOL_TURN), h.stream, {
      onToolArgumentsDelta: (call) => {
        partials.push(call.argumentsText);
        // The ToolPart is live in the message at this point — assert it is still
        // `input-streaming` and carries NO partial input.
        const tool = h.message().tools?.[0];
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

  it('hands the kit a NEW message + tools array reference on every mutation', async () => {
    const h = harness();
    await consumeModelStream(replay(TOOL_TURN), h.stream);
    // Every setter call produced a distinct array — the "new reference per chunk"
    // contract <kai-thread> relies on.
    expect(new Set(h.arrayRefs).size).toBe(h.arrayRefs.length);
    expect(h.arrayRefs.length).toBeGreaterThan(5);
    const messageObjects = h.arrayRefs.map((refs) => refs.find((m) => m.id === 'assistant-1'));
    expect(new Set(messageObjects).size).toBe(messageObjects.length);
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
    expect(results[0].message.tools?.[0].input).toEqual({ city: 'Paris', units: 'metric' });
  });

  it('works off a WHATWG ReadableStream (the res.body path) and survives keep-alives', async () => {
    const h = harness();
    const turn = await consumeModelStream(
      sseJson<ModelStreamChunk>(replayReadable(toSseText(TOOL_TURN))),
      h.stream,
    );
    expect(turn.toolCalls[0].input).toEqual({ city: 'Paris', units: 'metric' });
    expect(h.message().content).toBe('Let me check Paris for you.');
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

    expect(h.message().tools).toEqual([
      { type: 'search_docs', toolCallId: 'call_a', state: 'input-available', input: { query: 'theming' } },
      { type: 'get_weather', toolCallId: 'call_b', state: 'input-available', input: { city: 'Tokyo' } },
    ]);
  });
});

describe('failure modes', () => {
  it('moves a truncated argument stream to output-error and says why', async () => {
    const h = harness();
    const turn = await consumeModelStream(replay(TRUNCATED_ARGS), h.stream);

    expect(turn.finishReason).toBe('length');
    expect(turn.toolCalls[0].input).toBeUndefined();
    expect(turn.toolCalls[0].error).toMatch(/token limit/);

    const tool = h.message().tools![0];
    expect(tool.state).toBe('output-error');
    expect(tool.type).toBe('propose_action');
    expect(tool.errorText).toMatch(/Malformed tool arguments/);
    // The raw fragment is surfaced so a human can see what actually arrived.
    expect(tool.errorText).toContain('Deploy to prod');
  });

  it('surfaces an in-band error and fails the in-flight tool call', async () => {
    const h = harness();
    const turn = await consumeModelStream(replay(MID_STREAM_ERROR), h.stream);

    expect(turn.error).toEqual({ code: 'server_error', message: 'Upstream provider dropped the connection' });
    expect(turn.finishReason).toBe('error');
    expect(turn.text).toBe('Checking');
    expect(h.message().tools![0]).toMatchObject({ type: 'get_weather', state: 'output-error' });
    expect(h.message().tools![0].errorText).toMatch(/dropped the connection/);
  });
});

describe('a plain answer turn', () => {
  it('concatenates content deltas and captures usage', async () => {
    const h = harness();
    const turn = await consumeModelStream(replay(FINAL_TURN), h.stream);
    expect(turn.text).toBe("It's **12 °C** and raining in Paris — take a coat. ☔️");
    expect(h.message().content).toBe("It's **12 °C** and raining in Paris — take a coat. ☔️");
    expect(turn.finishReason).toBe('stop');
    expect(turn.usage).toMatchObject({ totalTokens: 858, costUsd: 0.000_081 });
    expect(h.message().tools).toBeUndefined();
  });
});

describe('reasoning', () => {
  it('distinguishes streamed reasoning from a post-hoc token count', async () => {
    const streamed = harness();
    const a = await consumeModelStream(replay(TOOL_TURN), streamed.stream);
    expect(a.reasoningChunks).toBe(2);
    expect(streamed.message().reasoning?.text).not.toBe('');

    const hidden = harness();
    const b = await consumeModelStream(replay(HIDDEN_REASONING), hidden.stream);
    // The model DID reason — 512 tokens of it — but nothing streamed, so
    // <kai-reasoning> has nothing to render. The count is the only evidence.
    expect(b.reasoningChunks).toBe(0);
    expect(b.reasoning).toBe('');
    expect(b.usage?.reasoningTokens).toBe(512);
    expect(hidden.message().reasoning).toBeUndefined();
  });

  it('accepts a custom disclosure label', async () => {
    const h = harness();
    await consumeModelStream(replay(TOOL_TURN), h.stream, { reasoningLabel: 'Reasoning' });
    expect(h.message().reasoning?.label).toBe('Reasoning');
  });
});

describe('structured outputs (Path B)', () => {
  it('buffers the JSON out of the thread, then sets the prose and yields an envelope', async () => {
    const h = harness();
    const buffered = bufferText(h.stream);
    const turn = await consumeModelStream(replay(STRUCTURED_CARD_TURN), buffered);

    // The raw JSON must NEVER have been appended into the visible message.
    expect(h.message().content).toBe('');
    expect(turn.text).toBe(buffered.buffered());

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

    h.stream.setText(value!.reply);
    expect(h.message().content).toBe('I can redeploy staging for you — confirm below.');
  });

  it('degrades to a readable error when the model goes off-schema', async () => {
    const h = harness();
    const buffered = bufferText(h.stream);
    await consumeModelStream(replay(STRUCTURED_BROKEN_TURN), buffered);
    const { value, error } = parseReplyWithCard(buffered.buffered());
    expect(value).toBeUndefined();
    expect(error).toMatch(/not valid JSON/);
    // …and the user has seen NOTHING at all, because the text was buffered.
    expect(h.message().content).toBe('');
  });
});

describe('the second turn (tool results back to the model)', () => {
  it('completes the ToolPart and builds the wire messages', async () => {
    const h = harness();
    const turn = await consumeModelStream(replay(TOOL_TURN), h.stream);
    const call = turn.toolCalls[0];

    const output = { city: 'Paris', condition: 'Light rain', temperature: 12 };
    applyToolOutput(h.stream, call.id, output);

    expect(h.message().tools).toEqual([
      {
        type: 'get_weather',
        toolCallId: 'call_wx_001',
        state: 'output-available',
        input: { city: 'Paris', units: 'metric' },
        output,
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

  it('appends the follow-up answer onto the SAME assistant message', async () => {
    const h = harness();
    await consumeModelStream(replay(TOOL_TURN), h.stream);
    await consumeModelStream(replay(FINAL_TURN), h.stream);
    // FINDING: ChatMessage.content is one flat string, so the pre-tool preamble
    // and the post-tool answer are glued together with no separator and no way
    // to order them around the tool panel.
    expect(h.message().content).toBe(
      "Let me check Paris for you.It's **12 °C** and raining in Paris — take a coat. ☔️",
    );
  });
});
