// src/primitives/create-kai-chat.test.ts
import { describe, it, expect } from 'vitest';
import { createRoot } from 'solid-js';
import { createKaiChat } from './create-kai-chat';
import { partsToText } from '../state';

describe('createKaiChat (Solid)', () => {
  it('append/update/remove drive the messages accessor', () => {
    createRoot((dispose) => {
      const chat = createKaiChat();
      chat.append({ id: '1', role: 'user', parts: [{ type: 'text', text: 'hi' }] });
      expect(chat.messages().map((m) => m.id)).toEqual(['1']);
      chat.update('1', { parts: [{ type: 'text', text: 'edited' }] });
      expect(partsToText(chat.messages()[0].parts)).toBe('edited');
      chat.remove('1');
      expect(chat.messages()).toEqual([]);
      dispose();
    });
  });

  it('streamAssistant toggles loading true→false around done()', () => {
    createRoot((dispose) => {
      const chat = createKaiChat();
      const s = chat.streamAssistant({ id: 'a1' });
      expect(chat.loading()).toBe(true);
      s.appendText('hello');
      expect(partsToText(chat.messages()[0].parts)).toBe('hello');
      s.done();
      expect(chat.loading()).toBe(false);
      dispose();
    });
  });

  it('suggestions ops are immutable + deduped', () => {
    createRoot((dispose) => {
      const chat = createKaiChat({ initialSuggestions: ['a'] });
      chat.addSuggestion('a');           // dedup
      chat.addSuggestion('b');
      expect(chat.suggestions()).toEqual(['a', 'b']);
      chat.clearSuggestions();
      expect(chat.suggestions()).toEqual([]);
      dispose();
    });
  });

  it('handleSubmit forwards the event detail to onSubmit', () => {
    createRoot((dispose) => {
      let seen: string | undefined;
      const chat = createKaiChat({ onSubmit: ({ value }) => { seen = value; } });
      chat.handleSubmit(new CustomEvent('kai-submit', { detail: { value: 'go', attachments: [] } }));
      expect(seen).toBe('go');
      dispose();
    });
  });

  it('two stores are independent (no shared state)', () => {
    createRoot((dispose) => {
      const a = createKaiChat();
      const b = createKaiChat();
      a.append({ id: 'x', role: 'user', parts: [{ type: 'text', text: '1' }] });
      expect(b.messages()).toEqual([]);
      dispose();
    });
  });
});
