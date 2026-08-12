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
