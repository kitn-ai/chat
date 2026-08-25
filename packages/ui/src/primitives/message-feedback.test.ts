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
import { createRoot, flush } from 'solid-js';
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
    // V2-SHAPE: create inside the root, DRIVE outside it — v2 rejects reactive
    // writes inside a root's synchronous owned scope (REACTIVE_WRITE_IN_OWNED_SCOPE).
    const [emit, dispose] = createRoot((d) => [vi.fn(), d] as const);
    const fb = createMessageFeedback({ emit });
    const m = msg();

    // set
    fb.handleAction(m, 'like');
    flush(); // V2-FLUSH: commit the staged write
    expect(fb.resolveFeedback(m)).toBe('like');
    expect(emit).toHaveBeenLastCalledWith({ messageId: 'm1', action: 'like', state: 'on' });
    expect(toastSpy).toHaveBeenCalledWith('Thanks for your feedback', expect.anything());

    // switch to the other vote (no un-vote in between)
    fb.handleAction(m, 'dislike');
    flush(); // V2-FLUSH: commit the staged write
    expect(fb.resolveFeedback(m)).toBe('dislike');
    expect(emit).toHaveBeenLastCalledWith({ messageId: 'm1', action: 'dislike', state: 'on' });

    // re-tap to clear → off, no toast
    toastSpy.mockClear();
    fb.handleAction(m, 'dislike');
    flush(); // V2-FLUSH: commit the staged write
    expect(fb.resolveFeedback(m)).toBeUndefined();
    expect(emit).toHaveBeenLastCalledWith({ messageId: 'm1', action: 'dislike', state: 'off' });
    expect(toastSpy).not.toHaveBeenCalled();

    dispose();
  });

  it('controlled m.feedback wins over the internal optimistic map', () => {
    // V2-SHAPE: create inside the root, DRIVE outside it — v2 rejects reactive
    // writes inside a root's synchronous owned scope (REACTIVE_WRITE_IN_OWNED_SCOPE).
    const [fb, dispose] = createRoot((d) => [createMessageFeedback({ emit: vi.fn() }), d] as const);
    const controlled = msg({ feedback: 'like' });
    // even after an internal dislike, the controlled value wins
    fb.handleAction({ id: 'm1', parts: [{ type: 'text', text: 'x' }] }, 'dislike');
    flush(); // V2-FLUSH: commit the staged write
    expect(fb.resolveFeedback(controlled)).toBe('like');
    dispose();
  });

  it('copy writes the clipboard, marks copied, toasts, emits without state, and auto-clears', () => {
    vi.useFakeTimers();
    // V2-SHAPE: create inside the root, DRIVE outside it — v2 rejects reactive
    // writes inside a root's synchronous owned scope (REACTIVE_WRITE_IN_OWNED_SCOPE).
    const [emit, dispose] = createRoot((d) => [vi.fn(), d] as const);
    const fb = createMessageFeedback({ emit });
    const m = msg({ parts: [{ type: 'text', text: 'Copy me' }] });

    fb.handleAction(m, 'copy');
    flush(); // V2-FLUSH: commit the staged write
    expect(writeText).toHaveBeenCalledWith('Copy me');
    expect(fb.isCopied('m1')).toBe(true);
    expect(toastSpy).toHaveBeenCalledWith('Copied to clipboard', expect.anything());
    expect(emit).toHaveBeenLastCalledWith({ messageId: 'm1', action: 'copy' });

    vi.advanceTimersByTime(2000);
    flush(); // V2-FLUSH: the timer handler's write is staged; commit
    expect(fb.isCopied('m1')).toBe(false);
    dispose();
  });

  it('copy concatenates only text parts, skipping reasoning/tool/card parts', () => {
    // V2-SHAPE: create inside the root, DRIVE outside it — v2 rejects reactive
    // writes inside a root's synchronous owned scope (REACTIVE_WRITE_IN_OWNED_SCOPE).
    const [fb, dispose] = createRoot((d) => [createMessageFeedback({ emit: vi.fn() }), d] as const);
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
    flush(); // V2-FLUSH: commit the staged write
    expect(writeText).toHaveBeenCalledWith('AB');
    dispose();
  });

  it('passes non-feedback actions through with no state and no toast', () => {
    // V2-SHAPE: create inside the root, DRIVE outside it — v2 rejects reactive
    // writes inside a root's synchronous owned scope (REACTIVE_WRITE_IN_OWNED_SCOPE).
    const [emit, dispose] = createRoot((d) => [vi.fn(), d] as const);
    const fb = createMessageFeedback({ emit });
    fb.handleAction(msg(), 'regenerate');
    flush(); // V2-FLUSH: commit the staged write
    expect(emit).toHaveBeenLastCalledWith({ messageId: 'm1', action: 'regenerate' });
    expect(toastSpy).not.toHaveBeenCalled();
    dispose();
  });
});
