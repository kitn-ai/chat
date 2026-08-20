import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createSaveScheduler, parseStoredThread } from './persistence';
import { createAssistantStream, type SetMessages } from './stream';
import type { ChatMessage, MessagePart } from '../elements/chat-types';

const msg = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  role: 'user',
  parts: [{ type: 'text', text: 'hello' }],
  ...over,
});

describe('parseStoredThread', () => {
  it('accepts a well-formed thread verbatim, with nothing dropped', () => {
    const stored: ChatMessage[] = [
      msg(),
      {
        id: 'm2',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'hi' },
          { type: 'reasoning', text: 'thinking…', label: 'Reasoning', index: 0 },
          { type: 'tool', tool: { toolCallId: 't1', type: 'bash', state: 'output-available' } },
          { type: 'card', envelope: { type: 'weather', id: 'c1', data: { temp: 21 } } },
          { type: 'source', source: { url: 'https://example.com', title: 'Example' } },
          { type: 'file', attachment: { id: 'a1', type: 'file', filename: 'x.png', mediaType: 'image/png' } },
        ],
        feedback: 'like',
      },
    ];
    const parsed = parseStoredThread(JSON.parse(JSON.stringify(stored)));
    expect(parsed.dropped).toEqual([]);
    expect(parsed.messages).toEqual(stored);
  });

  it('never throws: a non-array input yields no messages and ONE loud thread-level drop', () => {
    for (const input of [undefined, null, 42, 'nope', { messages: [] }]) {
      const parsed = parseStoredThread(input);
      expect(parsed.messages).toEqual([]);
      expect(parsed.dropped).toHaveLength(1);
      expect(parsed.dropped[0].at).toBe('thread');
      expect(parsed.dropped[0].value).toBe(input);
    }
  });

  it('drops an unreadable message record and keeps the readable ones (a truncated write must not take the thread down)', () => {
    const good = msg();
    const parsed = parseStoredThread([
      good,
      { id: 'half-written' }, // no role, no parts
      null,
      { id: 'm3', role: 'wizard', parts: [] }, // unknown role
    ]);
    expect(parsed.messages).toEqual([good]);
    expect(parsed.dropped).toHaveLength(3);
    expect(parsed.dropped.every((d) => d.at === 'message')).toBe(true);
  });

  it('drops an UNKNOWN part type loudly, with a reason that names it', () => {
    const parsed = parseStoredThread([
      msg({ parts: [{ type: 'text', text: 'kept' }, { type: 'hologram', beam: true } as unknown as MessagePart] }),
    ]);
    expect(parsed.messages[0].parts).toEqual([{ type: 'text', text: 'kept' }]);
    expect(parsed.dropped).toHaveLength(1);
    expect(parsed.dropped[0].at).toBe('part');
    expect(parsed.dropped[0].reason).toContain('unknown part type');
    expect(parsed.dropped[0].reason).toContain('hologram');
  });

  it('a KNOWN part type with a broken payload is dropped with a DIFFERENT reason than an unknown type', () => {
    const parsed = parseStoredThread([
      msg({ parts: [{ type: 'text' } as unknown as MessagePart, { type: 'text', text: 'kept' }] }),
    ]);
    expect(parsed.messages[0].parts).toEqual([{ type: 'text', text: 'kept' }]);
    expect(parsed.dropped[0].at).toBe('part');
    expect(parsed.dropped[0].reason).not.toContain('unknown part type');
    expect(parsed.dropped[0].reason).toContain('text');
  });

  it('a message whose every part was unreadable is dropped too — an empty bubble is not a rendering', () => {
    const parsed = parseStoredThread([msg(), { id: 'm2', role: 'assistant', parts: [{ type: 'nope' }] }]);
    expect(parsed.messages).toHaveLength(1);
    // Both decisions surface: the part, then the message it emptied.
    expect(parsed.dropped.map((d) => d.at)).toEqual(['part', 'message']);
  });

  it('keeps a valid feedback vote and silently-strips is NOT the policy: an invalid one is just absent, not fatal', () => {
    const liked = parseStoredThread([msg({ feedback: 'like' })]);
    expect(liked.messages[0].feedback).toBe('like');
    const junk = parseStoredThread([{ ...msg(), feedback: 'meh' }]);
    expect(junk.messages[0].feedback).toBeUndefined();
    expect(junk.messages).toHaveLength(1);
  });

  /**
   * The derivation cross-check (F-18): every variant DECLARED in the
   * `MessagePart` union must be recognized by the parser. Read by a
   * deliberately different method (source-text slice) from the production
   * derivation (the compile-time `satisfies Record<MessagePart['type'], …>`
   * in persistence.ts), per the convention in
   * tests/scripts/catalog-derived.test.ts. A bare `{ type: <variant> }` has a
   * missing payload, so a COVERED variant drops with the payload reason —
   * only an UNCOVERED one would drop as "unknown part type", which is the
   * failure this test exists to produce when a 7th variant lands.
   */
  it('recognizes every variant the chat-types union declares (derived, not hand-typed)', () => {
    const src = readFileSync(join(__dirname, '..', 'elements', 'chat-types.ts'), 'utf8');
    const start = src.indexOf('export type MessagePart =');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('\n\n', start);
    expect(end).toBeGreaterThan(start);
    const variants = [...src.slice(start, end).matchAll(/\btype: '([a-z-]+)'/g)].map((m) => m[1]);
    expect(variants.length).toBeGreaterThanOrEqual(4); // the shared degradation floor

    for (const variant of variants) {
      const parsed = parseStoredThread([msg({ parts: [{ type: variant } as unknown as MessagePart] })]);
      const partDrop = parsed.dropped.find((d) => d.at === 'part');
      expect(partDrop, `variant "${variant}" should be seen at all`).toBeDefined();
      expect(partDrop?.reason, `variant "${variant}" must be RECOGNIZED (a payload complaint), not unknown`).not.toContain(
        'unknown part type',
      );
    }
  });

  it('round-trip: stream fold → persist shape → parseStoredThread → identical thread', () => {
    // Extends the pattern in ./round-trip.test.ts: the same fold output, but
    // pushed through the serialize/rehydrate boundary a stored thread crosses.
    let messages: ChatMessage[] = [];
    const set: SetMessages = (fn) => {
      messages = fn(messages);
    };
    const raw = {
      source: 'anthropic.content_block',
      payload: { type: 'thinking', thinking: 'Let me see.', signature: 'SIG' },
    };
    const s = createAssistantStream(set, { id: 'turn-1' });
    s.appendReasoning('Let me see.', { index: 0, signature: 'SIG', raw });
    s.appendText('The answer.');
    s.upsertTool('t1', { type: 'web_search', state: 'output-available', output: { hits: 1 } });
    s.addCard({ type: 'weather', id: 'c1', data: { temp: 21 } });
    s.addSource({ url: 'https://example.com', title: 'Example', index: 1 });
    s.addFile({ id: 'a1', type: 'file', filename: 'x.png', mediaType: 'image/png' });
    s.done();

    const rehydrated = parseStoredThread(JSON.parse(JSON.stringify(messages)));
    expect(rehydrated.dropped).toEqual([]);
    // toEqual, not toBe: the JSON boundary forces new references, but nothing —
    // including `raw`, which the wire encoders re-read — may be lost or reshaped.
    expect(rehydrated.messages).toEqual(messages);
  });
});

describe('createSaveScheduler (the debounce/flush seam)', () => {
  /** A hand-cranked scheduler: the seam takes the CONSUMER's scheduler, so the
   *  tests drive one directly rather than faking the globals. */
  const manualTimers = () => {
    let nextId = 0;
    const pending = new Map<number, () => void>();
    return {
      setTimeout: (fn: () => void, _ms: number) => {
        const id = ++nextId;
        pending.set(id, fn);
        return id;
      },
      clearTimeout: (handle: unknown) => {
        pending.delete(handle as number);
      },
      fire: () => {
        const fns = [...pending.values()];
        pending.clear();
        fns.forEach((fn) => fn());
      },
      count: () => pending.size,
    };
  };

  it('debounces: many schedules inside the quiet period become ONE save of the LATEST snapshot', () => {
    const timers = manualTimers();
    const save = vi.fn();
    const saver = createSaveScheduler<string>(save, { delayMs: 250, ...timers });
    saver.schedule('v1');
    saver.schedule('v2');
    saver.schedule('v3');
    expect(save).not.toHaveBeenCalled();
    expect(timers.count()).toBe(1); // restarted, not stacked
    timers.fire();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('v3');
    expect(saver.pending()).toBe(false);
  });

  it('flush() writes the pending snapshot immediately and disarms the timer (the beforeunload story)', () => {
    const timers = manualTimers();
    const save = vi.fn();
    const saver = createSaveScheduler<string>(save, { delayMs: 250, ...timers });
    saver.schedule('mid-stream');
    saver.flush();
    expect(save).toHaveBeenCalledWith('mid-stream');
    timers.fire();
    expect(save).toHaveBeenCalledTimes(1); // no double write
  });

  it('flush() with nothing pending is a no-op — the last save already happened', () => {
    const timers = manualTimers();
    const save = vi.fn();
    const saver = createSaveScheduler<string>(save, { delayMs: 250, ...timers });
    saver.flush();
    expect(save).not.toHaveBeenCalled();
    saver.schedule('v1');
    timers.fire();
    saver.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('cancel() drops the pending write unsaved (the unmount story)', () => {
    const timers = manualTimers();
    const save = vi.fn();
    const saver = createSaveScheduler<string>(save, { delayMs: 250, ...timers });
    saver.schedule('doomed');
    expect(saver.pending()).toBe(true);
    saver.cancel();
    expect(saver.pending()).toBe(false);
    timers.fire();
    expect(save).not.toHaveBeenCalled();
  });

  it('hands the consumer-policy delay to the scheduler untouched', () => {
    const seen: number[] = [];
    const save = vi.fn();
    const saver = createSaveScheduler<string>(save, {
      delayMs: 731,
      setTimeout: (fn, ms) => {
        seen.push(ms);
        return 0;
      },
      clearTimeout: () => {},
    });
    saver.schedule('x');
    expect(seen).toEqual([731]);
  });

  it('defaults to the global timers when no scheduler is injected', () => {
    vi.useFakeTimers();
    try {
      const save = vi.fn();
      const saver = createSaveScheduler<string>(save, { delayMs: 250 });
      saver.schedule('v1');
      vi.advanceTimersByTime(249);
      expect(save).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(save).toHaveBeenCalledWith('v1');
    } finally {
      vi.useRealTimers();
    }
  });
});
