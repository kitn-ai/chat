// src/primitives/create-kai-chat.test.ts
import { describe, it, expect } from 'vitest';
import { createRoot, flush } from 'solid-js';
import { createKaiChat } from './create-kai-chat';
import { partsToText } from '../state';

describe('createKaiChat (Solid)', () => {
  it('append/update/remove drive the messages accessor', () => {
    // V2-SHAPE: create inside the root, DRIVE outside it — v2 rejects reactive
    // writes inside a root's synchronous owned scope (REACTIVE_WRITE_IN_OWNED_SCOPE).
    const [chat, dispose] = createRoot((d) => [createKaiChat(), d] as const);
    chat.append({ id: '1', role: 'user', parts: [{ type: 'text', text: 'hi' }] });
    flush(); // V2-FLUSH: commit the staged write
    expect(chat.messages().map((m) => m.id)).toEqual(['1']);
    chat.update('1', { parts: [{ type: 'text', text: 'edited' }] });
    flush(); // V2-FLUSH: commit the staged write
    expect(partsToText(chat.messages()[0].parts)).toBe('edited');
    chat.remove('1');
    flush(); // V2-FLUSH: commit the staged write
    expect(chat.messages()).toEqual([]);
    dispose();
  });

  it('streamAssistant toggles loading true→false around done()', () => {
    // V2-SHAPE: create inside the root, DRIVE outside it — v2 rejects reactive
    // writes inside a root's synchronous owned scope (REACTIVE_WRITE_IN_OWNED_SCOPE).
    const [chat, dispose] = createRoot((d) => [createKaiChat(), d] as const);
    const s = chat.streamAssistant({ id: 'a1' });
    flush(); // V2-FLUSH: commit the staged write
    expect(chat.loading()).toBe(true);
    s.appendText('hello');
    flush(); // V2-FLUSH: commit the staged write
    expect(partsToText(chat.messages()[0].parts)).toBe('hello');
    s.done();
    flush(); // V2-FLUSH: commit the staged write
    expect(chat.loading()).toBe(false);
    dispose();
  });

  it('suggestions ops are immutable + deduped', () => {
    // V2-SHAPE: create inside the root, DRIVE outside it — v2 rejects reactive
    // writes inside a root's synchronous owned scope (REACTIVE_WRITE_IN_OWNED_SCOPE).
    const [chat, dispose] = createRoot((d) => [createKaiChat({ initialSuggestions: ['a'] }), d] as const);
    chat.addSuggestion('a');           // dedup
    flush(); // V2-FLUSH: commit the staged write
    chat.addSuggestion('b');
    flush(); // V2-FLUSH: commit the staged write
    expect(chat.suggestions()).toEqual(['a', 'b']);
    chat.clearSuggestions();
    flush(); // V2-FLUSH: commit the staged write
    expect(chat.suggestions()).toEqual([]);
    dispose();
  });

  it('handleSubmit forwards the event detail to onSubmit', () => {
    createRoot((dispose) => {
      let seen: string | undefined;
      const chat = createKaiChat({ onSubmit: ({ value }) => { seen = value; } });
      chat.handleSubmit(new CustomEvent('kai-submit', { detail: { value: 'go', attachments: [] } }));
      flush(); // V2-FLUSH: commit the staged write
      expect(seen).toBe('go');
      dispose();
    });
  });

  it('two stores are independent (no shared state)', () => {
    // V2-SHAPE: create inside the root, DRIVE outside it — v2 rejects reactive
    // writes inside a root's synchronous owned scope (REACTIVE_WRITE_IN_OWNED_SCOPE).
    const [a, dispose] = createRoot((d) => [createKaiChat(), d] as const);
    const b = createKaiChat();
    a.append({ id: 'x', role: 'user', parts: [{ type: 'text', text: '1' }] });
    flush(); // V2-FLUSH: commit the staged write
    expect(b.messages()).toEqual([]);
    dispose();
  });
});
