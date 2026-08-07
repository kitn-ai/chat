import { describe, it, expect } from 'vitest';
import type { ChatMessage } from '../elements/chat-types';
import { appendMessage, upsertMessage, updateMessage, removeMessage, appendText, textMessage, partsToText } from './messages';
import { appendTextPart } from './parts';

const m = (id: string, text = ''): ChatMessage => ({ id, role: 'assistant', parts: [{ type: 'text', text }] });

describe('message helpers', () => {
  it('appendMessage adds to the end and returns a new array (input untouched)', () => {
    const a = [m('1')];
    const out = appendMessage(a, m('2'));
    expect(out.map((x) => x.id)).toEqual(['1', '2']);
    expect(out).not.toBe(a);
    expect(a).toHaveLength(1);
  });

  it('upsertMessage replaces by id, else appends', () => {
    const a = [m('1', 'old')];
    const replaced = upsertMessage(a, m('1', 'new'));
    expect(replaced).not.toBe(a);
    expect(partsToText(replaced[0].parts)).toBe('new');
    expect(upsertMessage(a, m('2')).map((x) => x.id)).toEqual(['1', '2']);
  });

  it('updateMessage patches the matched id with a new object; leaves others by reference', () => {
    const keep = m('1');
    const a = [keep, m('2', 'a')];
    const out = updateMessage(a, '2', { parts: [{ type: 'text', text: 'b' }] });
    expect(partsToText(out[1].parts)).toBe('b');
    expect(out[1]).not.toBe(a[1]);   // touched → new object
    expect(out[0]).toBe(keep);       // untouched → same reference
  });

  it('updateMessage accepts an updater function', () => {
    const input = m('1', 'x');
    const out = updateMessage([input], '1', (msg) => ({ ...msg, parts: appendTextPart(msg.parts, 'y') }));
    expect(partsToText(out[0].parts)).toBe('xy');
    expect(out[0]).not.toBe(input);
  });

  it('removeMessage drops by id', () => {
    const a = [m('1'), m('2')];
    const out = removeMessage(a, '1');
    expect(out.map((x) => x.id)).toEqual(['2']);
    expect(out).not.toBe(a);
    expect(a).toHaveLength(2);
  });

  it('appendText concatenates the streamed delta on the matched message', () => {
    const input = [m('1', 'He')];
    const out = appendText(input, '1', 'llo');
    expect(partsToText(out[0].parts)).toBe('Hello');
    expect(out).not.toBe(input); // new array reference
  });

  it('textMessage builds a single-text-part message', () => {
    const msg = textMessage('user', 'hello');
    expect(msg.role).toBe('user');
    expect(msg.parts).toEqual([{ type: 'text', text: 'hello' }]);
    expect(typeof msg.id).toBe('string');
  });

  it('partsToText concatenates every text part and ignores others', () => {
    expect(partsToText([
      { type: 'text', text: 'a' },
      { type: 'reasoning', text: 'ignored' },
      { type: 'text', text: 'b' },
    ])).toBe('ab');
  });
});
