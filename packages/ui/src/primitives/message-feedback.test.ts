/**
 * Unit tests for `createMessageFeedback` — the action-row state controller both
 * `ChatThread` and the `<kai-message>` element delegate to.
 *
 * Strategy: the `<kai-message>` facade is a `defineWebComponent` Shadow-DOM
 * element, which needs a full browser environment and isn't unit-testable in
 * jsdom. But its copy/vote behavior lives ENTIRELY in this controller (the facade
 * just wires `dispatch` + the rendered `MessageBody` props to it). So we test the
 * controller directly inside a reactive root — this is the standalone-message
 * regression surface (the controller is created once, above the body, so a fresh
 * `message` object during streaming never resets it).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'solid-js';
import type { ChatMessage } from '../elements/chat-types';

const toastSpy = vi.fn();
vi.mock('./toast-store', () => {
  const fn = Object.assign((...a: unknown[]) => toastSpy(...a), {
    success: (...a: unknown[]) => toastSpy(...a),
    dismiss: vi.fn(),
    clear: vi.fn(),
  });
  return { toast: fn };
});

const writeText = vi.fn();
Object.assign(globalThis, { navigator: { ...globalThis.navigator, clipboard: { writeText } } });

import { createMessageFeedback } from './message-feedback';

const msg = (over: Partial<ChatMessage> = {}): ChatMessage =>
  ({ id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }], ...over });

describe('createMessageFeedback', () => {
  beforeEach(() => { toastSpy.mockClear(); writeText.mockClear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('toggles a vote on/off, resolves it, and emits the right state', () => {
    createRoot((dispose) => {
      const emit = vi.fn();
      const fb = createMessageFeedback({ emit });
      const m = msg();

      // set
      fb.handleAction(m, 'like');
      expect(fb.resolveFeedback(m)).toBe('like');
      expect(emit).toHaveBeenLastCalledWith({ messageId: 'm1', action: 'like', state: 'on' });
      expect(toastSpy).toHaveBeenCalledWith('Thanks for your feedback', expect.anything());

      // switch to the other vote (no un-vote in between)
      fb.handleAction(m, 'dislike');
      expect(fb.resolveFeedback(m)).toBe('dislike');
      expect(emit).toHaveBeenLastCalledWith({ messageId: 'm1', action: 'dislike', state: 'on' });

      // re-tap to clear → off, no toast
      toastSpy.mockClear();
      fb.handleAction(m, 'dislike');
      expect(fb.resolveFeedback(m)).toBeUndefined();
      expect(emit).toHaveBeenLastCalledWith({ messageId: 'm1', action: 'dislike', state: 'off' });
      expect(toastSpy).not.toHaveBeenCalled();

      dispose();
    });
  });

  it('controlled m.feedback wins over the internal optimistic map', () => {
    createRoot((dispose) => {
      const fb = createMessageFeedback({ emit: vi.fn() });
      const controlled = msg({ feedback: 'like' });
      // even after an internal dislike, the controlled value wins
      fb.handleAction({ id: 'm1', parts: [{ type: 'text', text: 'x' }] }, 'dislike');
      expect(fb.resolveFeedback(controlled)).toBe('like');
      dispose();
    });
  });

  it('copy writes the clipboard, marks copied, toasts, emits without state, and auto-clears', () => {
    vi.useFakeTimers();
    createRoot((dispose) => {
      const emit = vi.fn();
      const fb = createMessageFeedback({ emit });
      const m = msg({ parts: [{ type: 'text', text: 'Copy me' }] });

      fb.handleAction(m, 'copy');
      expect(writeText).toHaveBeenCalledWith('Copy me');
      expect(fb.isCopied('m1')).toBe(true);
      expect(toastSpy).toHaveBeenCalledWith('Copied to clipboard', expect.anything());
      expect(emit).toHaveBeenLastCalledWith({ messageId: 'm1', action: 'copy' });

      vi.advanceTimersByTime(2000);
      expect(fb.isCopied('m1')).toBe(false);
      dispose();
    });
  });

  it('copy concatenates only text parts, skipping reasoning/tool/card parts', () => {
    createRoot((dispose) => {
      const fb = createMessageFeedback({ emit: vi.fn() });
      const m = msg({
        parts: [
          { type: 'text', text: 'A' },
          { type: 'reasoning', text: 'thinking...' },
          { type: 'tool', tool: { type: 'get_weather', state: 'output-available' } },
          { type: 'card', envelope: { type: 'weather-card', id: 'c1', data: {} } },
          { type: 'text', text: 'B' },
        ],
      });

      fb.handleAction(m, 'copy');
      expect(writeText).toHaveBeenCalledWith('AB');
      dispose();
    });
  });

  it('passes non-feedback actions through with no state and no toast', () => {
    createRoot((dispose) => {
      const emit = vi.fn();
      const fb = createMessageFeedback({ emit });
      fb.handleAction(msg(), 'regenerate');
      expect(emit).toHaveBeenLastCalledWith({ messageId: 'm1', action: 'regenerate' });
      expect(toastSpy).not.toHaveBeenCalled();
      dispose();
    });
  });

  describe("built-in 'speak' action (B-7a)", () => {
    it('speaks the message text through SpeechSynthesis (cancel-then-speak) and emits', () => {
      const speak = vi.fn();
      const cancel = vi.fn();
      vi.stubGlobal('speechSynthesis', { speak, cancel });
      vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
      const emit = vi.fn();
      const feedback = createMessageFeedback({ emit });
      feedback.handleAction(
        { id: 'm1', parts: [{ type: 'text', text: 'hello world' }] },
        'speak',
      );
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(speak).toHaveBeenCalledTimes(1);
      expect((speak.mock.calls[0][0] as { text: string }).text).toBe('hello world');
      expect(emit).toHaveBeenCalledWith({ messageId: 'm1', action: 'speak' });
      vi.unstubAllGlobals();
    });

    it('no-ops the speech (but still emits) where SpeechSynthesis is absent', () => {
      const emit = vi.fn();
      const feedback = createMessageFeedback({ emit });
      expect(() =>
        feedback.handleAction({ id: 'm2', parts: [{ type: 'text', text: 'x' }] }, 'speak'),
      ).not.toThrow();
      expect(emit).toHaveBeenCalledWith({ messageId: 'm2', action: 'speak' });
    });
  });
});
