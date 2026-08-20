import { describe, expect, it, vi } from 'vitest';
import {
  bindThreadMessages,
  createThreadSessions,
  updateThreadMessages,
  type SetThreads,
  type ThreadLike,
} from './threads';
import { createAssistantStream } from './stream';
import type { ChatMessage } from '../elements/chat-types';

interface Convo extends ThreadLike {
  title: string;
  updatedAt: string;
}

const msg = (id: string, text: string): ChatMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
});

const convo = (id: string, ...messages: ChatMessage[]): Convo => ({
  id,
  title: id,
  updatedAt: 't0',
  messages,
});

describe('updateThreadMessages (the pure fold)', () => {
  it('applies the updater only to the matched thread', () => {
    const threads = [convo('a', msg('m1', 'hi')), convo('b')];
    const next = updateThreadMessages(threads, 'a', (m) => [...m, msg('m2', 'yo')]);
    expect(next.find((t) => t.id === 'a')?.messages).toHaveLength(2);
    expect(next.find((t) => t.id === 'b')?.messages).toHaveLength(0);
  });

  it('reactivity two-halves: new array AND a new object for the hit; untouched threads keep their reference', () => {
    const threads = [convo('a'), convo('b')];
    const next = updateThreadMessages(threads, 'a', (m) => [...m, msg('m1', 'x')]);
    expect(next).not.toBe(threads); // the array notifies
    expect(next[0]).not.toBe(threads[0]); // the object makes it visible
    expect(next[1]).toBe(threads[1]); // bystanders untouched
  });

  it('a miss returns the SAME array reference so nothing re-renders (deleted-thread deltas are dropped)', () => {
    const threads = [convo('a')];
    const next = updateThreadMessages(threads, 'gone', (m) => [...m, msg('m1', 'late')]);
    expect(next).toBe(threads);
  });

  it('runs `touch` on the hit only (updatedAt stamping stays consumer policy)', () => {
    const threads = [convo('a'), convo('b')];
    const next = updateThreadMessages(threads, 'a', (m) => m.concat(msg('m1', 'x')), {
      touch: (t) => ({ ...t, updatedAt: 't1' }),
    });
    expect(next[0].updatedAt).toBe('t1');
    expect(next[1].updatedAt).toBe('t0');
  });

  it('reports a miss through onDrop — the drop is loud, not silent', () => {
    const onDrop = vi.fn();
    updateThreadMessages([convo('a')], 'gone', (m) => m, { onDrop });
    expect(onDrop).toHaveBeenCalledWith('gone');
    updateThreadMessages([convo('a')], 'a', (m) => m, { onDrop });
    expect(onDrop).toHaveBeenCalledTimes(1);
  });
});

describe('bindThreadMessages (the id-bound SetMessages)', () => {
  const harness = () => {
    let threads: Convo[] = [convo('x'), convo('y')];
    const setThreads: SetThreads<Convo> = (up) => {
      threads = up(threads);
    };
    return { setThreads, get: () => threads, remove: (id: string) => { threads = threads.filter((t) => t.id !== id); } };
  };

  it('a late delta for thread X never lands in thread Y (the id is captured at send time)', () => {
    const h = harness();
    const setForX = bindThreadMessages(h.setThreads, 'x');
    const stream = createAssistantStream(setForX);
    // The user "switches" to y: nothing about the bound setter changes.
    stream.appendText('hello ');
    stream.appendText('world');
    stream.done();
    expect(h.get().find((t) => t.id === 'y')?.messages).toHaveLength(0);
    const xMsgs = h.get().find((t) => t.id === 'x')?.messages;
    expect(xMsgs).toHaveLength(1);
    expect(xMsgs?.[0].parts).toEqual([{ type: 'text', text: 'hello world' }]);
  });

  it('delete-under-stream: deltas after the thread is removed are dropped, and loudly', () => {
    const h = harness();
    const onDrop = vi.fn();
    const setForX = bindThreadMessages(h.setThreads, 'x', { onDrop });
    const stream = createAssistantStream(setForX);
    stream.appendText('partial');
    h.remove('x');
    const before = h.get();
    stream.appendText(' — never seen');
    expect(h.get()).toBe(before); // reference untouched: no re-render, no resurrection
    expect(h.get().some((t) => t.id === 'x')).toBe(false);
    expect(onDrop).toHaveBeenCalledWith('x');
  });

  it('touch stamps the bound thread on every landed delta', () => {
    const h = harness();
    const setForX = bindThreadMessages(h.setThreads, 'x', {
      touch: (t) => ({ ...t, updatedAt: 't9' }),
    });
    createAssistantStream(setForX).appendText('hi').done();
    expect(h.get().find((t) => t.id === 'x')?.updatedAt).toBe('t9');
    expect(h.get().find((t) => t.id === 'y')?.updatedAt).toBe('t0');
  });
});

describe('createThreadSessions (per-thread loading + the abort map)', () => {
  it('tracks per-thread streaming state independently', () => {
    const s = createThreadSessions();
    const ca = s.begin('a');
    expect(s.isStreaming('a')).toBe(true);
    expect(s.isStreaming('b')).toBe(false);
    s.begin('b');
    expect(s.streamingIds().sort()).toEqual(['a', 'b']);
    s.end('a', ca);
    expect(s.isStreaming('a')).toBe(false);
    expect(s.isStreaming('b')).toBe(true);
  });

  it('begin() aborts a prior in-flight turn for the SAME thread (one turn per thread)', () => {
    const s = createThreadSessions();
    const first = s.begin('a');
    const second = s.begin('a');
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    expect(s.isStreaming('a')).toBe(true);
  });

  it('end() with a stale controller is a no-op — a finished old turn cannot clear the new one', () => {
    const s = createThreadSessions();
    const stale = s.begin('a');
    const current = s.begin('a');
    s.end('a', stale); // the old turn's finally block fires late
    expect(s.isStreaming('a')).toBe(true);
    s.end('a', current);
    expect(s.isStreaming('a')).toBe(false);
  });

  it('abort() (delete-under-stream) aborts the controller and clears streaming state', () => {
    const s = createThreadSessions();
    const c = s.begin('doomed');
    expect(s.abort('doomed')).toBe(true);
    expect(c.signal.aborted).toBe(true);
    expect(s.isStreaming('doomed')).toBe(false);
    expect(s.abort('doomed')).toBe(false); // nothing left in flight
  });

  it('notifies onChange with a FRESH snapshot array on every transition', () => {
    const seen: string[][] = [];
    const s = createThreadSessions((ids) => seen.push(ids));
    const c = s.begin('a');
    s.begin('b');
    s.end('a', c);
    s.abort('b');
    expect(seen).toEqual([['a'], ['a', 'b'], ['b'], []]);
    // Fresh references each time — safe to hand straight to a state setter.
    expect(seen[1]).not.toBe(seen[2]);
    const snap = s.streamingIds();
    expect(s.streamingIds()).not.toBe(snap);
  });

  it('end() with the wrong thread id does not clear another thread', () => {
    const s = createThreadSessions();
    const c = s.begin('a');
    s.end('b', c);
    expect(s.isStreaming('a')).toBe(true);
  });

  it('full story: switching away DETACHES (stream keeps landing, id-bound); deleting ABORTS and drops late deltas', () => {
    let threads: Convo[] = [convo('x'), convo('y')];
    const setThreads: SetThreads<Convo> = (up) => { threads = up(threads); };
    const sessions = createThreadSessions();
    const controller = sessions.begin('x');
    const stream = createAssistantStream(bindThreadMessages(setThreads, 'x'));
    stream.appendText('streamed while open. ');
    // Switch to y: NOTHING is aborted; the reply keeps landing in x.
    stream.appendText('streamed while away.');
    expect(threads.find((t) => t.id === 'x')?.messages[0].parts).toEqual([
      { type: 'text', text: 'streamed while open. streamed while away.' },
    ]);
    // Delete x mid-stream.
    sessions.abort('x');
    threads = threads.filter((t) => t.id !== 'x');
    expect(controller.signal.aborted).toBe(true);
    stream.appendText('too late');
    expect(threads.some((t) => t.id === 'x')).toBe(false);
    expect(threads.find((t) => t.id === 'y')?.messages).toHaveLength(0);
  });
});
