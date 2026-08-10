import { describe, expect, it } from 'vitest';
import { appendReasoningPart, appendTextPart, fingerprint, upsertToolPart } from './parts';
import type { MessagePart } from '../elements/chat-types';
import type { ToolPart } from '../components/tool-types';

const reasoningAt = (parts: MessagePart[], i: number) =>
  parts[i] as Extract<MessagePart, { type: 'reasoning' }>;

describe('fingerprint', () => {
  it('is stable across key order', () => {
    expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 }));
  });
  it('is stable for nested objects', () => {
    expect(fingerprint({ o: { x: 1, y: 2 } })).toBe(fingerprint({ o: { y: 2, x: 1 } }));
  });
  it('distinguishes different values', () => {
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });

  it('does NOT treat a repeated non-circular reference as circular', () => {
    const shared = { x: 1 };
    expect(fingerprint({ a: shared, b: shared })).toBe(fingerprint({ a: { x: 1 }, b: { x: 1 } }));
  });

  it('still guards a true cycle without throwing', () => {
    const a: Record<string, unknown> = { x: 1 };
    a.self = a;
    expect(() => fingerprint(a)).not.toThrow();
    expect(fingerprint(a)).toContain('[circular]');
  });
});

describe('appendTextPart', () => {
  it('opens a text part when empty', () => {
    expect(appendTextPart([], 'hi')).toEqual([{ type: 'text', text: 'hi' }]);
  });

  it('appends to a trailing text part', () => {
    const out = appendTextPart([{ type: 'text', text: 'he' }], 'llo');
    expect(out).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('OPENS A NEW PART when the last part is not text', () => {
    const parts: MessagePart[] = [
      { type: 'text', text: 'Checking.' },
      { type: 'tool', tool: { type: 'get_weather', state: 'output-available' } },
    ];
    const out = appendTextPart(parts, 'Done.');
    expect(out).toHaveLength(3);
    expect(out[2]).toEqual({ type: 'text', text: 'Done.' });
    expect(out[0]).toEqual({ type: 'text', text: 'Checking.' });
  });

  it('returns a new array reference', () => {
    const parts: MessagePart[] = [];
    expect(appendTextPart(parts, 'x')).not.toBe(parts);
  });
});

describe('appendReasoningPart', () => {
  it('keeps blocks with distinct indexes separate', () => {
    let parts: MessagePart[] = [];
    parts = appendReasoningPart(parts, 'first', { index: 0 });
    parts = appendReasoningPart(parts, 'second', { index: 1 });
    parts = appendReasoningPart(parts, '!', { index: 0 });
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ type: 'reasoning', text: 'first!', index: 0 });
    expect(parts[1]).toMatchObject({ type: 'reasoning', text: 'second', index: 1 });
  });

  it('preserves signature and raw', () => {
    const raw = { source: 'anthropic.content_block', payload: { sig: 'abc' } };
    const parts = appendReasoningPart([], 'x', { index: 0, signature: 'sig', raw });
    expect(parts[0]).toMatchObject({ signature: 'sig', raw });
  });

  /** This is what actually guarantees "a later delta never blanks an established
   *  raw", not any guard at a call site: the builder resolves with `??`, so an
   *  EXPLICIT `raw: undefined` is indistinguishable from an omitted one. A plain
   *  spread here would blank the payload Anthropic requires echoed back verbatim. */
  it('carries an established raw and signature forward when a later delta omits them', () => {
    const raw = { source: 'anthropic.content_block', payload: { type: 'thinking' } };
    let parts = appendReasoningPart([], 'x', { index: 0, signature: 'sig', raw });
    parts = appendReasoningPart(parts, 'y', { index: 0, raw: undefined, signature: undefined });
    expect(reasoningAt(parts, 0).raw).toBe(raw);
    expect(reasoningAt(parts, 0).signature).toBe('sig');
    expect(reasoningAt(parts, 0).text).toBe('xy');
  });

  it('returns a NEW array when text actually arrives', () => {
    const parts = appendReasoningPart([], 'x', { index: 0, label: 'Thinking' });
    expect(appendReasoningPart(parts, 'y', { index: 0, label: 'Thinking' })).not.toBe(parts);
  });

  /** The empty-delta frame that rework 1 deliberately stopped dropping. It must
   *  reach the builder (so a redacted block or an assembled signature is never
   *  lost) WITHOUT costing a re-render when it carries nothing new. */
  it('returns the SAME array when an empty delta changes nothing', () => {
    const raw = { source: 'anthropic.content_block', payload: { type: 'thinking' } };
    const parts = appendReasoningPart([], 'x', { index: 0, label: 'Thinking', raw });
    expect(appendReasoningPart(parts, '', { index: 0, label: 'Thinking' })).toBe(parts);
  });

  it('returns a NEW array when an empty delta carries a raw payload', () => {
    const parts = appendReasoningPart([], '', { index: 0, label: 'Thinking' });
    const raw = { source: 'anthropic.content_block', payload: { type: 'redacted_thinking' } };
    const next = appendReasoningPart(parts, '', { index: 0, label: 'Thinking', raw });
    expect(next).not.toBe(parts);
    expect(reasoningAt(next, 0).raw).toBe(raw);
  });

  it('returns a NEW array when an empty delta carries a signature', () => {
    const parts = appendReasoningPart([], 'x', { index: 0, label: 'Thinking' });
    const next = appendReasoningPart(parts, '', { index: 0, label: 'Thinking', signature: 'sig' });
    expect(next).not.toBe(parts);
    expect(reasoningAt(next, 0).signature).toBe('sig');
  });

  it('returns a NEW array when an empty delta OPENS a block', () => {
    const parts = appendReasoningPart([], 'x', { index: 0 });
    const next = appendReasoningPart(parts, '', { index: 1 });
    expect(next).not.toBe(parts);
    expect(next).toHaveLength(2);
  });
});

describe('upsertToolPart', () => {
  it('creates a tool part and derives kind', () => {
    const parts = upsertToolPart([], 'tc1', { type: 'bash', state: 'input-streaming' });
    expect(parts[0]).toMatchObject({
      type: 'tool',
      tool: { type: 'bash', kind: 'command', state: 'input-streaming', toolCallId: 'tc1' },
    });
  });

  it('merges a patch into the existing tool', () => {
    let parts = upsertToolPart([], 'tc1', { type: 'bash', state: 'input-streaming' });
    parts = upsertToolPart(parts, 'tc1', { state: 'output-available', output: { ok: true } });
    expect(parts).toHaveLength(1);
    expect((parts[0] as { tool: { state: string } }).tool.state).toBe('output-available');
  });

  it('is a NO-OP when the merged tool fingerprints identically', () => {
    const parts = upsertToolPart([], 'tc1', { type: 'bash', state: 'input-streaming', input: { a: 1 } });
    const same = upsertToolPart(parts, 'tc1', { input: { a: 1 } });
    expect(same).toBe(parts);
  });

  it('does NOT dedupe a genuinely changed input', () => {
    const parts = upsertToolPart([], 'tc1', { type: 'bash', state: 'input-streaming', input: { a: 1 } });
    const next = upsertToolPart(parts, 'tc1', { input: { a: 2 } });
    expect(next).not.toBe(parts);
  });

  // Regression: create honored `patch.kind` but update unconditionally re-derived
  // it, so the first `{ state }` patch reverted a consumer classification to
  // 'generic' and the panel changed treatment mid-stream.
  it('preserves a consumer-set kind across later patches', () => {
    let parts = upsertToolPart([], 'tc1', { type: 'my_widget_tool', kind: 'mcp', state: 'input-streaming' });
    expect((parts[0] as { tool: ToolPart }).tool.kind).toBe('mcp');
    parts = upsertToolPart(parts, 'tc1', { state: 'output-available', output: { ok: true } });
    expect((parts[0] as { tool: ToolPart }).tool.kind).toBe('mcp');
  });

  it('an explicit patch.kind still wins over the preserved one', () => {
    let parts = upsertToolPart([], 'tc1', { type: 'my_widget_tool', kind: 'mcp', state: 'input-streaming' });
    parts = upsertToolPart(parts, 'tc1', { kind: 'image' });
    expect((parts[0] as { tool: ToolPart }).tool.kind).toBe('image');
  });

  // The streaming path must still work: a fragment-created tool starts as
  // 'unknown'/'generic' and re-derives once the real name arrives.
  it('re-derives kind when the type changes and the old kind was auto-derived', () => {
    let parts = upsertToolPart([], 'tc1', {});
    expect((parts[0] as { tool: ToolPart }).tool.kind).toBe('generic');
    parts = upsertToolPart(parts, 'tc1', { type: 'web_search' });
    expect((parts[0] as { tool: ToolPart }).tool.kind).toBe('search');
  });

  // Regression: `{ ...cur, ...patch }` let an explicit `raw: undefined` blank an
  // established round-trip payload (the spike defended against this by hand).
  it('an explicit raw: undefined does not blank an established raw', () => {
    const raw = { source: 'anthropic.content_block', payload: { id: 'tu_1' } };
    let parts = upsertToolPart([], 'tc1', { type: 'bash', state: 'input-streaming', raw });
    parts = upsertToolPart(parts, 'tc1', { state: 'output-available', raw: undefined });
    expect((parts[0] as { tool: ToolPart }).tool.raw).toEqual(raw);
  });

  it('a defined raw still replaces the previous one', () => {
    const first = { source: 'openai.delta', payload: { n: 1 } };
    const second = { source: 'openai.delta', payload: { n: 2 } };
    let parts = upsertToolPart([], 'tc1', { type: 'bash', state: 'input-streaming', raw: first });
    parts = upsertToolPart(parts, 'tc1', { raw: second });
    expect((parts[0] as { tool: ToolPart }).tool.raw).toEqual(second);
  });

  it('never serializes `raw` when deciding equality', () => {
    // A payload that EXPLODES if anything walks it. The old code called
    // fingerprint(merged), which JSON-serialized raw.payload on every patch.
    const exploding = {
      source: 'test.explodes',
      payload: {
        get boom(): string {
          throw new Error('raw.payload was serialized');
        },
      },
    };
    let parts = upsertToolPart([], 'tc1', {
      type: 'bash',
      state: 'input-streaming',
      raw: exploding,
    });
    expect(() => {
      parts = upsertToolPart(parts, 'tc1', { rawInput: '{"command":' });
    }).not.toThrow();
    expect(() => {
      parts = upsertToolPart(parts, 'tc1', { rawInput: '{"command":"ls"}' });
    }).not.toThrow();
    const tool = (parts[0] as Extract<MessagePart, { type: 'tool' }>).tool;
    expect(tool.rawInput).toBe('{"command":"ls"}');
    expect(tool.raw).toBe(exploding);
  });

  it('assembles a large rawInput correctly across many fragments', () => {
    let parts = upsertToolPart([], 'tc1', { type: 'write_file', state: 'input-streaming' });
    let text = '';
    for (let i = 0; i < 5000; i++) {
      text += `frag${i},`;
      parts = upsertToolPart(parts, 'tc1', { rawInput: text });
    }
    const tool = (parts[0] as Extract<MessagePart, { type: 'tool' }>).tool;
    expect(tool.rawInput).toBe(text);
    // 5000 fragments of `frag${i},` totals 43890 chars (variable-width `i`
    // means it is not a round number). The assertion checks "assembled a large
    // string correctly", not a specific byte count.
    expect(tool.rawInput!.length).toBeGreaterThan(40_000);
  });

  it('still dedupes a structurally identical input arriving as a fresh object', () => {
    const parts = upsertToolPart([], 'tc1', {
      type: 'bash',
      state: 'input-available',
      input: { command: 'ls', flags: ['-a'] },
    });
    // A DIFFERENT object with the same shape, and reversed key order.
    const same = upsertToolPart(parts, 'tc1', { input: { flags: ['-a'], command: 'ls' } });
    expect(same).toBe(parts);
  });

  it('still dedupes a structurally identical output arriving as a fresh object', () => {
    const parts = upsertToolPart([], 'tc1', {
      type: 'bash',
      state: 'output-available',
      output: { stdout: 'a\nb', code: 0 },
    });
    const same = upsertToolPart(parts, 'tc1', { output: { code: 0, stdout: 'a\nb' } });
    expect(same).toBe(parts);
  });

  it('does NOT dedupe when only rawInput changed', () => {
    const parts = upsertToolPart([], 'tc1', { type: 'bash', state: 'input-streaming', rawInput: '{"a' });
    const next = upsertToolPart(parts, 'tc1', { rawInput: '{"ab' });
    expect(next).not.toBe(parts);
  });
});
