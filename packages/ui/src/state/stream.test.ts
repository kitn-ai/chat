// src/state/stream.test.ts
import { describe, it, expect } from 'vitest';
import type { ChatMessage } from '../elements/chat-types';
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
});
