/**
 * The mock responder.
 *
 * The assertions that matter here are NOT "does it produce text" — that is the
 * easy half and it is why the previous seven hand-rolled copies all looked fine.
 * They are:
 *
 *   · it runs through the kit's REAL parser (`readOpenAIStream`), not around it;
 *   · it is impossible to mistake for a provider, at four separate altitudes;
 *   · it keeps the re-render contract (a new array AND a new message object per
 *     chunk), which is the thing that silently stops the UI updating;
 *   · it never touches the network.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readOpenAIStream } from '../wire';
import { createAssistantStream, type SetMessages } from './stream';
import type { ChatMessage } from '../elements/chat-types';
import {
  createMockResponder,
  DEFAULT_MOCK_REPLIES,
  MOCK_BANNER,
  MOCK_MARKER,
  MOCK_MARKER_KEY,
  MOCK_MODEL_ID,
} from './mock';

/** Collect the raw wire the responder emits, without a parser in the way. */
async function collect(source: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const chunk of source) out += chunk;
  return out;
}

/** Drive one turn through the REAL adapter and report what the UI would see. */
async function runTurn(respond: ReturnType<typeof createMockResponder>, prompt = 'hi') {
  let messages: ChatMessage[] = [];
  /** Every array reference handed to the renderer, in order. */
  const commits: ChatMessage[][] = [];
  const set: SetMessages = (fn) => {
    messages = fn(messages);
    commits.push(messages);
  };
  const stream = createAssistantStream(set);
  const turn = await readOpenAIStream(respond(prompt), stream);
  stream.done();
  return { messages, commits, turn };
}

const quiet = { announce: false as const };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createMockResponder — it streams through the kit\'s own parser', () => {
  it('the canned reply arrives as ONE text part, via readOpenAIStream', async () => {
    const respond = createMockResponder({ ...quiet, delayMs: 0 });
    const { messages, turn } = await runTurn(respond);

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('assistant');
    // One text part, not one per token: this is `appendTextPart` folding onto the
    // trailing part, which is the behaviour the inlined copies got wrong.
    expect(messages[0].parts).toHaveLength(1);
    expect(messages[0].parts[0].type).toBe('text');
    expect(turn.text).toBe(DEFAULT_MOCK_REPLIES[0]);
    // Round trip: the whitespace-preserving tokenizer must rebuild the reply
    // byte for byte, or the preview shows mangled spacing.
    expect((messages[0].parts[0] as { text: string }).text).toBe(DEFAULT_MOCK_REPLIES[0]);
  });

  it('folds onto an EXISTING message without deleting its other parts', async () => {
    // The specific regression the inlined `{ ...m, parts: [{ type: 'text' }] }`
    // fold caused: a seeded reasoning/tool part vanished the moment text streamed.
    let messages: ChatMessage[] = [];
    const set: SetMessages = (fn) => { messages = fn(messages); };
    const stream = createAssistantStream(set);
    stream.appendReasoning('thinking about it');

    const respond = createMockResponder({ ...quiet, delayMs: 0 });
    await readOpenAIStream(respond('hi'), stream);
    stream.done();

    const kinds = messages[0].parts.map((p) => p.type);
    expect(kinds).toEqual(['reasoning', 'text']);
  });

  it('commits a NEW array and a NEW message object per chunk (the re-render contract)', async () => {
    const respond = createMockResponder({ ...quiet, delayMs: 0 });
    const { commits } = await runTurn(respond);

    // Several tokens => several commits, or nothing streamed.
    expect(commits.length).toBeGreaterThan(5);
    for (let i = 1; i < commits.length; i += 1) {
      expect(commits[i], `commit ${i} reused the previous ARRAY reference`).not.toBe(commits[i - 1]);
      expect(commits[i][0], `commit ${i} reused the previous MESSAGE reference`).not.toBe(
        commits[i - 1][0],
      );
    }
  });

  it('never touches the network', async () => {
    const fetchSpy = vi.fn();
    const realFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = fetchSpy;
    try {
      await runTurn(createMockResponder({ ...quiet, delayMs: 0 }));
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      (globalThis as unknown as { fetch: unknown }).fetch = realFetch;
    }
  });

  it('cycles its replies so a multi-turn preview stays coherent', async () => {
    const respond = createMockResponder({ ...quiet, delayMs: 0 });
    const first = (await runTurn(respond)).turn.text;
    const second = (await runTurn(respond)).turn.text;
    expect(first).toBe(DEFAULT_MOCK_REPLIES[0]);
    expect(second).toBe(DEFAULT_MOCK_REPLIES[1]);
    expect(second).not.toBe(first);
  });

  it('honours replies / chunkSize / delayMs', async () => {
    const respond = createMockResponder({ ...quiet, delayMs: 0, chunkSize: 3, replies: ['one two three four'] });
    const { turn } = await runTurn(respond);
    expect(turn.text).toBe('one two three four');
    // chunkSize 3 groups token+separator pairs, so this is materially fewer
    // frames than the 7 a chunkSize of 1 would send.
    expect(turn.chunks).toBeLessThan(7);
  });
});

describe('createMockResponder — you can tell it is a mock', () => {
  it('tell 1: the RAW stream opens with an SSE comment banner', async () => {
    const raw = await collect(createMockResponder({ ...quiet, delayMs: 0 })());
    expect(raw.startsWith(MOCK_BANNER)).toBe(true);
    expect(MOCK_BANNER.startsWith(':')).toBe(true);
    expect(raw).toContain('NO PROVIDER WAS CONTACTED');
  });

  it('tell 1: and the banner is DROPPED by the parser, so it costs nothing', async () => {
    const { turn, messages } = await runTurn(createMockResponder({ ...quiet, delayMs: 0 }));
    // If the banner leaked through as content the reply would be prefixed by it.
    expect(turn.text).not.toContain('NO PROVIDER WAS CONTACTED');
    expect((messages[0].parts[0] as { text: string }).text.startsWith(':')).toBe(false);
  });

  it('tell 2: EVERY data frame carries the marker naming createMockResponder', async () => {
    const raw = await collect(createMockResponder({ ...quiet, delayMs: 0 })());
    const frames = raw
      .split('\n\n')
      .filter((f) => f.startsWith('data: ') && !f.includes('[DONE]'))
      .map((f) => JSON.parse(f.slice(6)) as Record<string, unknown>);

    expect(frames.length).toBeGreaterThan(3);
    for (const f of frames) {
      expect(f[MOCK_MARKER_KEY]).toBe(MOCK_MARKER);
    }
    expect(MOCK_MARKER).toContain('createMockResponder');
    expect(MOCK_MARKER).toContain('no provider was contacted');
  });

  it('tell 3: the model id is not one any provider serves', async () => {
    const raw = await collect(createMockResponder({ ...quiet, delayMs: 0 })());
    const frames = raw
      .split('\n\n')
      .filter((f) => f.startsWith('data: ') && !f.includes('[DONE]'))
      .map((f) => JSON.parse(f.slice(6)) as { model: string });
    for (const f of frames) expect(f.model).toBe(MOCK_MODEL_ID);
    expect(MOCK_MODEL_ID).toBe('kai-mock');
  });

  it('tell 4: the finished turn reports ZERO usage, which a real turn cannot', async () => {
    const { turn } = await runTurn(createMockResponder({ ...quiet, delayMs: 0 }));
    expect(turn.text.length).toBeGreaterThan(0);
    expect(turn.usage).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    expect(turn.stopReason).toBe('stop');
  });

  it('tell 5: the reply itself says so', async () => {
    const { turn } = await runTurn(createMockResponder({ ...quiet, delayMs: 0 }));
    expect(turn.text.toLowerCase()).toContain('mock');
  });

  it('announces itself ONCE on the first turn, and can be silenced', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const respond = createMockResponder({ delayMs: 0 });
    await runTurn(respond);
    await runTurn(respond);
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0][0])).toContain('NO PROVIDER WAS CONTACTED');

    info.mockClear();
    await runTurn(createMockResponder({ ...quiet, delayMs: 0 }));
    expect(info).not.toHaveBeenCalled();
  });
});

describe('createMockResponder — scripted tool calls (F-35)', () => {
  // The acceptance that matters: the SAME fold path real wire output takes —
  // frames -> readOpenAIStream -> createAssistantStream -> parts. No hand-rolled
  // tool-call SSE framing in the app, which is what every ladder rung paid for.

  it('a scripted tool call becomes a tool part with parsed input, via the real parser', async () => {
    const respond = createMockResponder({
      ...quiet,
      delayMs: 0,
      replies: [{ toolCalls: [{ name: 'get_weather', arguments: { city: 'Oslo', units: 'metric' } }] }],
    });
    const { messages, turn } = await runTurn(respond);

    const toolParts = messages[0].parts.filter((p) => p.type === 'tool');
    expect(toolParts).toHaveLength(1);
    const tool = (toolParts[0] as { tool: { type: string; state: string; input?: unknown } }).tool;
    expect(tool.type).toBe('get_weather');
    expect(tool.state).toBe('input-available');
    expect(tool.input).toEqual({ city: 'Oslo', units: 'metric' });

    // The turn settles the way a real tool-calling turn does.
    expect(turn.finishReason).toBe('tool_calls');
    expect(turn.toolCalls).toHaveLength(1);
    expect(turn.toolCalls[0].name).toBe('get_weather');
    expect(turn.toolCalls[0].input).toEqual({ city: 'Oslo', units: 'metric' });
  });

  it('text + tool call in one turn arrive as ordered text-then-tool parts', async () => {
    const respond = createMockResponder({
      ...quiet,
      delayMs: 0,
      replies: [{
        text: 'Let me check that for you.',
        toolCalls: [{ id: 'call_mock_1', name: 'kai_confirm', arguments: { title: 'Proceed?', actions: [{ id: 'ok', label: 'OK' }] } }],
      }],
    });
    const { messages, turn } = await runTurn(respond);

    expect(messages[0].parts.map((p) => p.type)).toEqual(['text', 'tool']);
    expect(turn.text).toBe('Let me check that for you.');
    expect(turn.toolCalls[0].id).toBe('call_mock_1');
  });

  it('argument JSON is streamed in fragments, not delivered in one frame', async () => {
    const respond = createMockResponder({
      ...quiet,
      delayMs: 0,
      replies: [{ toolCalls: [{ name: 'kai_form', arguments: { fields: ['a', 'b', 'c', 'd'], reason: 'exercise the fragment reassembly path the real wire hits' } }] }],
    });
    const raw = await collect(respond('hi'));
    const toolFrames = raw
      .split('\n\n')
      .filter((f) => f.startsWith('data: ') && !f.includes('[DONE]'))
      .map((f) => JSON.parse(f.slice(6)) as { choices?: { delta?: { tool_calls?: unknown[] } }[] })
      .filter((f) => Array.isArray(f.choices?.[0]?.delta?.tool_calls));
    expect(toolFrames.length).toBeGreaterThan(1);
    // And the reassembled result still parses to the exact object.
    const { turn } = await runTurn(respond);
    expect(turn.toolCalls[0].input).toEqual({
      fields: ['a', 'b', 'c', 'd'],
      reason: 'exercise the fragment reassembly path the real wire hits',
    });
  });

  it('every tool-call frame still carries the mock marker and model id', async () => {
    const respond = createMockResponder({
      ...quiet,
      delayMs: 0,
      replies: [{ toolCalls: [{ name: 'get_weather', arguments: { city: 'Oslo' } }] }],
    });
    const frames = (await collect(respond('hi')))
      .split('\n\n')
      .filter((f) => f.startsWith('data: ') && !f.includes('[DONE]'))
      .map((f) => JSON.parse(f.slice(6)) as Record<string, unknown>);
    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) {
      expect(f[MOCK_MARKER_KEY]).toBe(MOCK_MARKER);
      expect(f.model).toBe(MOCK_MODEL_ID);
    }
  });

  it('plain-string replies and MockTurn replies mix and cycle together', async () => {
    const respond = createMockResponder({
      ...quiet,
      delayMs: 0,
      replies: ['just text', { text: 'then a tool', toolCalls: [{ name: 't', arguments: {} }] }],
    });
    const first = await runTurn(respond);
    expect(first.turn.text).toBe('just text');
    expect(first.turn.toolCalls).toHaveLength(0);
    expect(first.turn.finishReason).toBe('stop');
    const second = await runTurn(respond);
    expect(second.turn.text).toBe('then a tool');
    expect(second.turn.toolCalls).toHaveLength(1);
    expect(second.turn.finishReason).toBe('tool_calls');
  });
});

describe('createMockResponder — scripted reasoning and citations (S-1)', () => {
  // The template-purpose audit's S-1: a mock turn could only say plain text, so
  // reasoning blocks and citation strips were unobservable in EVERY emitted
  // starter. These pin that a scripted turn takes the SAME parse path a real
  // provider's reasoning/annotations take — no hand-rolled folding anywhere.

  it('scripted reasoning arrives as ONE reasoning part BEFORE the text, via the real parser', async () => {
    const respond = createMockResponder({
      ...quiet,
      delayMs: 0,
      replies: [{ reasoning: 'The user asked about X. Check the docs first.', text: 'Here is the answer.' }],
    });
    const { messages, turn } = await runTurn(respond);

    expect(messages[0].parts.map((p) => p.type)).toEqual(['reasoning', 'text']);
    const reasoning = messages[0].parts[0] as { type: 'reasoning'; text: string };
    // Round trip: the whitespace-preserving tokenizer must rebuild it exactly.
    expect(reasoning.text).toBe('The user asked about X. Check the docs first.');
    expect(turn.text).toBe('Here is the answer.');
  });

  it('scripted sources arrive as source parts AFTER the text, one per citation', async () => {
    const respond = createMockResponder({
      ...quiet,
      delayMs: 0,
      replies: [{
        text: 'Cited answer.',
        sources: [
          { url: 'https://ui.kitn.ai/wire/', title: 'Wire adapters', snippet: 'The kit parses, the consumer fetches.' },
          { url: 'https://ui.kitn.ai/state/' },
        ],
      }],
    });
    const { messages } = await runTurn(respond);

    expect(messages[0].parts.map((p) => p.type)).toEqual(['text', 'source', 'source']);
    const first = messages[0].parts[1] as { type: 'source'; source: { url?: string; title?: string; snippet?: string } };
    expect(first.source.url).toBe('https://ui.kitn.ai/wire/');
    expect(first.source.title).toBe('Wire adapters');
    // `snippet` rides the wire as the annotation's `content` field and comes
    // back as `snippet` — the field mapping is part of the contract.
    expect(first.source.snippet).toBe('The kit parses, the consumer fetches.');
    const second = messages[0].parts[2] as { type: 'source'; source: { url?: string; title?: string } };
    expect(second.source).toEqual({ url: 'https://ui.kitn.ai/state/' });
  });

  it('a full turn orders parts reasoning -> text -> sources -> tool, and still finishes tool_calls', async () => {
    const respond = createMockResponder({
      ...quiet,
      delayMs: 0,
      replies: [{
        reasoning: 'Think.',
        text: 'Answer.',
        sources: [{ url: 'https://ui.kitn.ai/' }],
        toolCalls: [{ name: 'search_docs', arguments: { query: 'parts' } }],
      }],
    });
    const { messages, turn } = await runTurn(respond);

    expect(messages[0].parts.map((p) => p.type)).toEqual(['reasoning', 'text', 'source', 'tool']);
    expect(turn.finishReason).toBe('tool_calls');
  });

  it('reasoning and annotation frames still carry the mock marker and model id', async () => {
    const respond = createMockResponder({
      ...quiet,
      delayMs: 0,
      replies: [{ reasoning: 'why', text: 'what', sources: [{ url: 'https://ui.kitn.ai/' }] }],
    });
    const frames = (await collect(respond('hi')))
      .split('\n\n')
      .filter((f) => f.startsWith('data: ') && !f.includes('[DONE]'))
      .map((f) => JSON.parse(f.slice(6)) as Record<string, unknown>);
    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) {
      expect(f[MOCK_MARKER_KEY]).toBe(MOCK_MARKER);
      expect(f.model).toBe(MOCK_MODEL_ID);
    }
  });
});
