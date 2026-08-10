import { describe, expect, it, vi } from 'vitest';

describe('SSR safety', () => {
  it('imports the whole entry with no window and no document', async () => {
    // The unit project runs in jsdom, so both globals exist. Delete them for the
    // duration of the import to prove nothing in `wire` touches the DOM, or
    // constructs a TextDecoder / Response / ReadableStream, at MODULE scope.
    const win = globalThis.window;
    const doc = globalThis.document;
    vi.resetModules();
    // @ts-expect-error deleting a DOM global on purpose
    delete globalThis.window;
    // @ts-expect-error deleting a DOM global on purpose
    delete globalThis.document;
    try {
      const mod = await import('./index');
      expect(typeof mod.readOpenAIStream).toBe('function');
      expect(typeof mod.readAnthropicStream).toBe('function');
      expect(typeof mod.readModelStream).toBe('function');
      expect(typeof mod.consumeModelStream).toBe('function');
      expect(typeof mod.sseJson).toBe('function');
      expect(typeof mod.bufferText).toBe('function');
      expect(mod.openaiChatFormat.id).toBe('openai.chat-completions');
      expect(mod.anthropicMessagesFormat.id).toBe('anthropic.messages');
      expect(typeof mod.WireError).toBe('function');
    } finally {
      Object.defineProperty(globalThis, 'window', { value: win, configurable: true, writable: true });
      Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true });
      vi.resetModules();
    }
  });

  it('exposes every format through the same WireFormat shape', async () => {
    const { anthropicMessagesFormat, openaiChatFormat } = await import('./index');
    for (const format of [openaiChatFormat, anthropicMessagesFormat]) {
      expect(typeof format.id).toBe('string');
      expect(typeof format.open).toBe('function');
      expect(typeof format.open().push).toBe('function');
    }
  });
});
