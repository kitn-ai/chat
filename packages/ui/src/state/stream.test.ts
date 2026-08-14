// src/state/stream.test.ts
import { describe, it, expect } from 'vitest';
import type { ChatMessage, Source } from '../elements/chat-types';
import type { AttachmentData } from '../components/attachment-types';
import { createAssistantStream, onStreamSettled, type SetMessages } from './stream';

/** A fake setter that records each emitted array + applies it. */
function makeSink(initial: ChatMessage[] = []) {
  let current = initial;
  const emissions: ChatMessage[][] = [];
  const set = (updater: (p: ChatMessage[]) => ChatMessage[]) => {
    current = updater(current);
    emissions.push(current);
  };
  return { set, get: () => current, emissions };
}

describe('createAssistantStream', () => {
  it('appends an empty assistant message on construction', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    expect(s.id).toBe('a1');
    expect(sink.get()).toEqual([{ id: 'a1', role: 'assistant', parts: [] }]);
  });

  it('appendReasoning wires opts through to a labeled part', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.appendReasoning('thinking', { label: 'Reasoning' });
    expect(sink.get()[0].parts).toEqual([{ type: 'reasoning', text: 'thinking', index: 0, label: 'Reasoning', signature: undefined, raw: undefined }]);
  });

  it('upsertTool adds then merges a patch by toolCallId', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.upsertTool('t1', { type: 'search', state: 'input-streaming', input: { q: 'x' } });
    s.upsertTool('t1', { state: 'output-available', output: { hits: 3 } });
    const parts = sink.get()[0].parts;
    expect(parts).toHaveLength(1);
    const tool = (parts[0] as { tool: { state: string; input?: unknown; output?: unknown } }).tool;
    expect(tool.state).toBe('output-available');
    expect(tool.output).toEqual({ hits: 3 });
    // the earlier input must survive the merge -- this is what distinguishes merge from replace.
    expect(tool.input).toEqual({ q: 'x' });
  });

  it('does not produce a new messages array when upsertTool is a no-op', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set);
    s.upsertTool('tc1', { type: 'bash', state: 'input-streaming', input: { a: 1 } });
    const before = sink.get();
    s.upsertTool('tc1', { input: { a: 1 } });
    expect(sink.get()).toBe(before);
  });

  it('abort(reason) marks non-settled tool parts output-error without dropping the message', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.upsertTool('t1', { type: 'search', state: 'input-streaming' });
    s.abort('network down');
    const parts = sink.get()[0].parts;
    const tool = (parts[0] as { tool: { state: string; errorText?: string } }).tool;
    expect(tool.state).toBe('output-error');
    expect(tool.errorText).toBe('network down');
    expect(sink.get().map((m) => m.id)).toEqual(['a1']);
  });

  it('abort() leaves an already output-available tool part alone', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.upsertTool('t1', { type: 'search', state: 'output-available', output: { hits: 1 } });
    s.abort('too late');
    const tool = (sink.get()[0].parts[0] as { tool: { state: string } }).tool;
    expect(tool.state).toBe('output-available');
  });

  it('abort() with no reason still settles non-available tools, with errorText undefined', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.upsertTool('t1', { type: 'search', state: 'input-streaming' });
    s.abort();
    const tool = (sink.get()[0].parts[0] as { tool: { state: string; errorText?: string } }).tool;
    expect(tool.state).toBe('output-error');
    expect(tool.errorText).toBeUndefined();
  });

  it('opens a new text part after a tool call', () => {
    const messages: ChatMessage[] = [];
    const set: SetMessages = (fn) => { messages.splice(0, messages.length, ...fn(messages)); };
    const s = createAssistantStream(set);
    s.appendText('Checking. ');
    s.upsertTool('tc1', { type: 'get_weather', state: 'output-available', output: { c: 18 } });
    s.appendText('It is 18C.');
    const parts = messages[0].parts;
    expect(parts.map((p) => p.type)).toEqual(['text', 'tool', 'text']);
    expect((parts[0] as { text: string }).text).toBe('Checking. ');
    expect((parts[2] as { text: string }).text).toBe('It is 18C.');
  });

  it('keeps parallel reasoning blocks distinct', () => {
    const messages: ChatMessage[] = [];
    const set: SetMessages = (fn) => { messages.splice(0, messages.length, ...fn(messages)); };
    const s = createAssistantStream(set);
    s.appendReasoning('a', { index: 0 });
    s.appendReasoning('b', { index: 1 });
    expect(messages[0].parts.filter((p) => p.type === 'reasoning')).toHaveLength(2);
  });

  it('preserves raw on reasoning for round-trip', () => {
    const messages: ChatMessage[] = [];
    const set: SetMessages = (fn) => { messages.splice(0, messages.length, ...fn(messages)); };
    const raw = { source: 'anthropic.content_block', payload: { type: 'thinking', thinking: 'x', signature: 'SIG' } };
    const s = createAssistantStream(set);
    s.appendReasoning('x', { index: 0, raw });
    const part = messages[0].parts[0] as { raw?: unknown };
    expect(part.raw).toEqual(raw);
    expect(part.raw).toBe(raw);
  });

  it('produces a new array reference per mutation', () => {
    const seen: ChatMessage[][] = [];
    let cur: ChatMessage[] = [];
    const set: SetMessages = (fn) => { cur = fn(cur); seen.push(cur); };
    const s = createAssistantStream(set);
    s.appendText('a');
    s.appendText('b');
    expect(seen[0]).not.toBe(seen[1]);
  });

  it('leaves preceding messages intact and splices around a non-zero index', () => {
    const sink = makeSink([{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]);
    const s = createAssistantStream(sink.set);
    s.appendText('reply');
    const msgs = sink.get();
    expect(msgs.map((m) => m.id)).toEqual(['u1', s.id]);
    expect(msgs[0].parts).toEqual([{ type: 'text', text: 'hi' }]);
  });

  it('drops deltas for a message removed externally, without resurrecting it', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set);
    s.appendText('a');
    sink.set(() => []); // consumer clears the thread mid-stream
    s.appendText('b');
    expect(sink.get()).toEqual([]);
  });

  it('done() is a no-op call that settles the stream against further mutation', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.appendText('partial');
    s.done();
    s.appendText('ignored');
    expect(sink.get()[0].parts).toEqual([{ type: 'text', text: 'partial' }]);
  });

  it('onStreamSettled fires onSettle on done and on abort, preserving chaining', () => {
    const sink = makeSink();
    let settled = 0;
    const s = onStreamSettled(createAssistantStream(sink.set, { id: 'a1' }), () => { settled++; });
    s.appendText('x').appendText('y');
    expect((sink.get()[0].parts[0] as { text: string }).text).toBe('xy');
    s.done();
    expect(settled).toBe(1);
    let settledOnAbort = 0;
    const s2 = onStreamSettled(createAssistantStream(sink.set, { id: 'a2' }), () => { settledOnAbort++; });
    s2.appendText('x').abort('boom');
    expect(settledOnAbort).toBe(1);
  });

  // THE headline for card upsert: a model that revises the same card mid-turn
  // must end up with ONE card carrying the latest data, not N copies.
  it('addCard REVISES a card with the same id instead of appending a copy', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.addCard({ type: 'tasks', id: 'card-1', data: { items: [{ label: 'draft' }] } });
    s.addCard({ type: 'tasks', id: 'card-1', data: { items: [{ label: 'final' }] } });
    const parts = sink.get()[0].parts;
    expect(parts).toHaveLength(1);
    expect((parts[0] as { envelope: { data: unknown } }).envelope.data).toEqual({
      items: [{ label: 'final' }],
    });
  });

  it('addCard keeps two DIFFERENT ids as two parts', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.addCard({ type: 'confirm', id: 'card-1', data: { n: 1 } });
    s.addCard({ type: 'confirm', id: 'card-2', data: { n: 2 } });
    expect(sink.get()[0].parts).toHaveLength(2);
  });

  it('does not produce a new messages array when addCard is a no-op', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set);
    s.addCard({ type: 'confirm', id: 'card-1', data: { a: 1 } });
    const before = sink.get();
    s.addCard({ type: 'confirm', id: 'card-1', data: { a: 1 } });
    expect(sink.get()).toBe(before);
  });

  it('addCard upserts through the onStreamSettled wrapper too', () => {
    const sink = makeSink();
    const s = onStreamSettled(createAssistantStream(sink.set, { id: 'a1' }), () => {});
    s.addCard({ type: 'confirm', id: 'card-1', data: { a: 1 } })
      .addCard({ type: 'confirm', id: 'card-1', data: { a: 2 } });
    const parts = sink.get()[0].parts;
    expect(parts).toHaveLength(1);
    expect((parts[0] as { envelope: { data: unknown } }).envelope.data).toEqual({ a: 2 });
  });

  // Every row of the onStreamSettled wrapper is HAND-WRITTEN delegation -- one
  // `inner.X(...); return wrapper;` per method -- so a copy-paste slip that points a
  // row at the wrong inner method, drops an argument, or drops the `return wrapper`
  // is invisible unless that row is driven through the WRAPPER. Exercising it on the
  // bare stream from `createAssistantStream` proves nothing about the wrapper.
  // appendText/addCard/done/abort are covered above; these four cover the rest.
  //
  // Each asserts both halves a slip breaks: the part the right inner method produced
  // from the right arguments, and that the return value is the wrapper itself.
  // Identity matters because `return inner` still chains -- only `toBe(s)` catches it.

  it('appendReasoning delegates through the onStreamSettled wrapper, opts and all', () => {
    const sink = makeSink();
    const s = onStreamSettled(createAssistantStream(sink.set, { id: 'a1' }), () => {});
    expect(s.appendReasoning('thinking', { index: 2, label: 'Reasoning' })).toBe(s);
    // a non-default index: dropping the `opts` argument would silently land on 0.
    expect(sink.get()[0].parts).toEqual([
      { type: 'reasoning', text: 'thinking', index: 2, label: 'Reasoning', signature: undefined, raw: undefined },
    ]);
  });

  it('upsertTool delegates through the onStreamSettled wrapper with both args', () => {
    const sink = makeSink();
    const s = onStreamSettled(createAssistantStream(sink.set, { id: 'a1' }), () => {});
    expect(s.upsertTool('t1', { type: 'search', state: 'input-streaming', input: { q: 'x' } })).toBe(s);
    s.upsertTool('t1', { state: 'output-available', output: { hits: 3 } });
    const parts = sink.get()[0].parts;
    expect(parts).toHaveLength(1);
    const tool = (parts[0] as { tool: { toolCallId: string; state: string; input?: unknown; output?: unknown } }).tool;
    // toolCallId proves arg 1 arrived; the surviving input proves arg 2 did, twice.
    expect(tool.toolCallId).toBe('t1');
    expect(tool.state).toBe('output-available');
    expect(tool.input).toEqual({ q: 'x' });
    expect(tool.output).toEqual({ hits: 3 });
  });

  it('addSource delegates through the onStreamSettled wrapper', () => {
    const sink = makeSink();
    const s = onStreamSettled(createAssistantStream(sink.set, { id: 'a1' }), () => {});
    const source: Source = { id: 's1', url: 'https://example.com/a', title: 'A', index: 1 };
    expect(s.addSource(source)).toBe(s);
    const parts = sink.get()[0].parts;
    expect(parts).toEqual([{ type: 'source', source }]);
    // the same object, not a copy -- this is what pins the argument to inner.addSource.
    expect((parts[0] as { source: unknown }).source).toBe(source);
  });

  it('addFile delegates through the onStreamSettled wrapper', () => {
    const sink = makeSink();
    const s = onStreamSettled(createAssistantStream(sink.set, { id: 'a1' }), () => {});
    const attachment: AttachmentData = { id: 'f1', type: 'file', filename: 'notes.md', mediaType: 'text/markdown' };
    expect(s.addFile(attachment)).toBe(s);
    const parts = sink.get()[0].parts;
    expect(parts).toEqual([{ type: 'file', attachment }]);
    expect((parts[0] as { attachment: unknown }).attachment).toBe(attachment);
  });
});
