import { afterEach, describe, expect, it, vi } from 'vitest';

// The globals a Node/Deno/Workers server does NOT have. `window` and `document`
// alone are not enough: a module touching `customElements` or `HTMLElement` at
// import time crashes on a server just as hard, and jsdom leaves those defined
// even after window is gone.
const BROWSER_GLOBALS = [
  'window',
  'document',
  'customElements',
  'HTMLElement',
  'navigator',
  'localStorage',
  'requestAnimationFrame',
  'matchMedia',
] as const;

const saved = new Map<string, PropertyDescriptor | undefined>();

/** Remove the browser globals and PROVE they are gone. A bare `delete` on a
 *  non-configurable property silently fails, which would let this whole suite
 *  pass while still running in a browser-shaped environment. */
function enterServerEnvironment(): void {
  for (const name of BROWSER_GLOBALS) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    // Reflect.deleteProperty rather than `delete`: it reports failure instead of
    // throwing in strict mode, and some jsdom globals are accessors.
    if (!Reflect.deleteProperty(globalThis, name)) {
      Object.defineProperty(globalThis, name, { value: undefined, configurable: true });
    }
    expect(
      (globalThis as Record<string, unknown>)[name],
      `${name} must be undefined before the import, or this test proves nothing`,
    ).toBeUndefined();
  }
}

function restoreBrowserEnvironment(): void {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  saved.clear();
}

afterEach(() => {
  restoreBrowserEnvironment();
  vi.resetModules();
});

describe('SSR safety', () => {
  it('imports the whole entry in a server-shaped environment', async () => {
    // The unit project runs in jsdom, so every browser global exists. Strip them
    // for the duration of the import to prove nothing reachable from the entry
    // touches the DOM, or constructs a TextDecoder / Response / ReadableStream,
    // at MODULE scope.
    vi.resetModules();
    enterServerEnvironment();

    const mod = await import('./index');

    // Still absent: importing must not have polyfilled its way around the check.
    for (const name of BROWSER_GLOBALS) {
      expect((globalThis as Record<string, unknown>)[name]).toBeUndefined();
    }

    expect(typeof mod.readOpenAIStream).toBe('function');
    expect(typeof mod.readAnthropicStream).toBe('function');
    expect(typeof mod.readModelStream).toBe('function');
    expect(typeof mod.consumeModelStream).toBe('function');
    expect(typeof mod.createToolCallAccumulator).toBe('function');
    expect(typeof mod.sseJson).toBe('function');
    expect(typeof mod.sseDataFrames).toBe('function');
    expect(typeof mod.readableToAsyncIterable).toBe('function');
    expect(typeof mod.normalizeStopReason).toBe('function');
    expect(typeof mod.applyToolOutput).toBe('function');
    expect(typeof mod.applyToolFailure).toBe('function');
    expect(typeof mod.bufferText).toBe('function');
    expect(mod.openaiChatFormat.id).toBe('openai.chat-completions');
    expect(mod.anthropicMessagesFormat.id).toBe('anthropic.messages');
    expect(typeof mod.WireError).toBe('function');
  });

  it('PARSES a stream with no browser globals present', async () => {
    // Importing cleanly is the weaker half. A server actually has to RUN the
    // adapter, so drive a real turn end to end while the globals are gone.
    vi.resetModules();
    enterServerEnvironment();

    const { readOpenAIStream } = await import('./index');

    const sse =
      'data: {"choices":[{"delta":{"content":"from"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":" the server"},"finish_reason":"stop"}]}\n\n' +
      'data: [DONE]\n\n';
    const buf = new TextEncoder().encode(sse);
    async function* source(): AsyncGenerator<Uint8Array> {
      for (let i = 0; i < buf.length; i += 13) {
        yield buf.subarray(i, Math.min(i + 13, buf.length));
      }
    }

    let text = '';
    const turn = await readOpenAIStream(source(), {
      appendText: (d) => {
        text += d;
      },
      appendReasoning: () => undefined,
      upsertTool: () => undefined,
    });

    expect(text).toBe('from the server');
    expect(turn.text).toBe('from the server');
    expect(turn.stopReason).toBe('stop');
    expect(turn.parts.map((p) => p.type)).toEqual(['text']);
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
