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

  /* ── abort() must not DISCARD its reason ─────────────────────────────────
   * The headline case is the one with no tool part at all: a text-only turn,
   * which is every turn of a text-only support widget. `abort(reason)` used to
   * map over `parts` looking for a tool to stamp, find none, and drop the
   * string on the floor -- so a failed request rendered an EMPTY assistant
   * bubble while the consumer believed it had reported the failure. That is a
   * silent drop on the error path. The reason now lands in the thread. */

  it('abort(reason) on a TEXT-ONLY turn puts the reason in the thread instead of dropping it', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.abort('Support is unavailable (HTTP 502).');
    const parts = sink.get()[0].parts;
    expect(parts).toEqual([{ type: 'text', text: 'Support is unavailable (HTTP 502).' }]);
  });

  it('abort(reason) keeps the partial text and does NOT glue the reason onto it', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.appendText('Let me check that');
    s.abort('Connection lost.');
    const parts = sink.get()[0].parts;
    // Two parts, not one concatenated blob: the model's half-sentence stays the
    // model's, and the failure reads as its own thing.
    expect(parts).toEqual([
      { type: 'text', text: 'Let me check that' },
      { type: 'text', text: 'Connection lost.' },
    ]);
  });

  it('abort(reason) does NOT double-stamp: an in-flight tool carries the reason, no text part is added', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.appendText('Searching. ');
    s.upsertTool('t1', { type: 'search', state: 'input-streaming' });
    s.abort('network down');
    const parts = sink.get()[0].parts;
    expect(parts.map((p) => p.type)).toEqual(['text', 'tool']);
    const tool = (parts[1] as { tool: { state: string; errorText?: string } }).tool;
    expect(tool.state).toBe('output-error');
    expect(tool.errorText).toBe('network down');
  });

  it('abort(reason) surfaces the reason when every tool part has ALREADY settled', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.upsertTool('t1', { type: 'search', state: 'output-available', output: { hits: 1 } });
    s.abort('The answer never arrived.');
    const parts = sink.get()[0].parts;
    // The finished tool panel is left alone -- it did finish -- but the turn
    // still failed, and nothing on the message was able to say so.
    expect(parts.map((p) => p.type)).toEqual(['tool', 'text']);
    expect((parts[0] as { tool: { state: string } }).tool.state).toBe('output-available');
    expect(parts[1]).toEqual({ type: 'text', text: 'The answer never arrived.' });
  });

  it('abort() with NO reason appends nothing: there is no reason to discard', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.appendText('partial');
    s.abort();
    expect(sink.get()[0].parts).toEqual([{ type: 'text', text: 'partial' }]);
  });

  it('abort() with an EMPTY reason appends nothing', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.abort('');
    expect(sink.get()[0].parts).toEqual([]);
  });

  /* A WHITESPACE-ONLY reason is the same nothing as an empty one, and it is not
   * hypothetical: the emitted scaffold passes `err.message`, and an Error can
   * carry '' or ' '. Appending it would produce an INVISIBLE text part -- a
   * blank bubble that now also claims a part exists, which is worse than the
   * defect this whole change is about. */
  it('abort() with a WHITESPACE-ONLY reason appends nothing', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.abort('   \n\t ');
    expect(sink.get()[0].parts).toEqual([]);
  });

  it('abort(reason) trims the reason it puts in the thread and on a tool', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.abort('  Connection lost.\n');
    expect(sink.get()[0].parts).toEqual([{ type: 'text', text: 'Connection lost.' }]);

    const sink2 = makeSink();
    const s2 = createAssistantStream(sink2.set, { id: 'a2' });
    s2.upsertTool('t1', { type: 'search', state: 'input-streaming' });
    s2.abort('  network down\n');
    const tool = (sink2.get()[0].parts[0] as { tool: { errorText?: string } }).tool;
    expect(tool.errorText).toBe('network down');
  });

  it('abort() with a whitespace-only reason stamps a tool with errorText undefined, not blank', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.upsertTool('t1', { type: 'search', state: 'input-streaming' });
    s.abort('  ');
    const tool = (sink.get()[0].parts[0] as { tool: { state: string; errorText?: string } }).tool;
    expect(tool.state).toBe('output-error');
    expect(tool.errorText).toBeUndefined();
  });

  /* A tool that already FAILED on its own knows more than the turn-level reason
   * does. "search index offline" is the answer to what went wrong; "Connection
   * lost." is the generic outer symptom. Overwriting the specific with the
   * generic loses the only information anyone can act on, so a tool already
   * showing its own error keeps it -- and still counts as carrying the failure,
   * because the reader can see A failure on that part. */
  it('abort(reason) does not overwrite a tool that already reported its OWN error', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.upsertTool('t1', { type: 'search', state: 'output-error', errorText: 'search index offline' });
    s.abort('Connection lost.');
    const parts = sink.get()[0].parts;
    expect(parts.map((p) => p.type)).toEqual(['tool']);
    const tool = (parts[0] as { tool: { state: string; errorText?: string } }).tool;
    expect(tool.state).toBe('output-error');
    expect(tool.errorText).toBe('search index offline');
  });

  it('abort(reason) DOES fill in a tool that is output-error with no errorText', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.upsertTool('t1', { type: 'search', state: 'output-error' });
    s.abort('Connection lost.');
    const parts = sink.get()[0].parts;
    // An error panel with nothing in it says no more than a blank bubble does.
    expect(parts.map((p) => p.type)).toEqual(['tool']);
    expect((parts[0] as { tool: { errorText?: string } }).tool.errorText).toBe('Connection lost.');
  });

  it('abort(reason) stamps the in-flight tool and leaves the already-errored one alone', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.upsertTool('t1', { type: 'search', state: 'output-error', errorText: 'search index offline' });
    s.upsertTool('t2', { type: 'fetch', state: 'input-streaming' });
    s.abort('Connection lost.');
    const parts = sink.get()[0].parts;
    expect(parts.map((p) => p.type)).toEqual(['tool', 'tool']);
    expect((parts[0] as { tool: { errorText?: string } }).tool.errorText).toBe('search index offline');
    expect((parts[1] as { tool: { errorText?: string } }).tool.errorText).toBe('Connection lost.');
  });

  it('abort(reason) after done() is a no-op: a settled message is never rewritten', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.appendText('all done');
    s.done();
    s.abort('too late to complain');
    expect(sink.get()[0].parts).toEqual([{ type: 'text', text: 'all done' }]);
  });

  it('a second abort(reason) does not append the reason twice', () => {
    const sink = makeSink();
    const s = createAssistantStream(sink.set, { id: 'a1' });
    s.abort('gone');
    s.abort('gone');
    expect(sink.get()[0].parts).toEqual([{ type: 'text', text: 'gone' }]);
  });

  it('abort(reason) through onStreamSettled reaches the thread too', () => {
    const sink = makeSink();
    let settled = 0;
    const s = onStreamSettled(createAssistantStream(sink.set, { id: 'a1' }), () => { settled++; });
    s.abort('wrapped failure');
    expect(sink.get()[0].parts).toEqual([{ type: 'text', text: 'wrapped failure' }]);
    expect(settled).toBe(1);
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
