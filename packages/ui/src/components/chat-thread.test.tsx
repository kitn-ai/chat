import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal, flush } from 'solid-js';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { ChatThread } from './chat-thread';
import type { ChatMessage } from '../elements/chat-types';

// Spy on the imperative toast() so we can assert when feedback raises one. The
// feedback controller imports it from primitives/toast-store.
const toastSpy = vi.fn();
vi.mock('../primitives/toast-store', () => {
  const fn = Object.assign((...args: unknown[]) => toastSpy(...args), {
    success: (...args: unknown[]) => toastSpy(...args),
    dismiss: vi.fn(),
    clear: vi.fn(),
  });
  return { toast: fn };
});

// jsdom doesn't implement Element.scrollTo; the auto-scroll container calls it.
if (!Element.prototype.scrollTo) (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};

// jsdom has no clipboard; stub a writeText spy we can assert against.
const writeText = vi.fn();
Object.assign(navigator, { clipboard: { writeText } });

afterEach(cleanup);

// createPresence unmounts the hidden vote button on a microtask in jsdom.
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('ChatThread header composition', () => {
  it('hides the header with no title, models, context, or header slot', () => {
    const { container } = render(() => <ChatThread messages={[]} />);
    expect(container.querySelector('header')).toBeNull();
  });

  it('shows the header when only header-start content is present', () => {
    const { container } = render(() => <ChatThread messages={[]} headerStart />);
    expect(container.querySelector('header')).toBeTruthy();
  });

  it('renders header-start and header-end slots inside the header', () => {
    const { container } = render(() => <ChatThread messages={[]} headerStart headerEnd />);
    expect(container.querySelector('header slot[name="header-start"]')).toBeTruthy();
    expect(container.querySelector('header slot[name="header-end"]')).toBeTruthy();
  });

  it('still shows the header for a chat title (back-compat)', () => {
    const { container, getByText } = render(() => <ChatThread messages={[]} chatTitle="Assistant" />);
    expect(container.querySelector('header')).toBeTruthy();
    expect(getByText('Assistant')).toBeInTheDocument();
  });
});

describe('ChatThread suggestions gating', () => {
  const SUGGESTIONS = ['What can you do?', 'Tell me a joke'];
  const oneMessage = [{ id: '1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'hi' }] }];

  it('renders suggestions when the thread is empty', () => {
    const { getByText } = render(() => <ChatThread messages={[]} suggestions={SUGGESTIONS} />);
    expect(getByText('What can you do?')).toBeInTheDocument();
    expect(getByText('Tell me a joke')).toBeInTheDocument();
  });

  it('hides suggestions once the conversation has messages (default)', () => {
    const { queryByText } = render(() => <ChatThread messages={oneMessage} suggestions={SUGGESTIONS} />);
    expect(queryByText('What can you do?')).toBeNull();
    expect(queryByText('Tell me a joke')).toBeNull();
  });

  it('keeps suggestions visible with messages when persistSuggestions is set', () => {
    const { getByText } = render(() => (
      <ChatThread messages={oneMessage} suggestions={SUGGESTIONS} persistSuggestions />
    ));
    expect(getByText('What can you do?')).toBeInTheDocument();
    expect(getByText('Tell me a joke')).toBeInTheDocument();
  });
});

describe('ChatThread action-row feedback', () => {
  beforeEach(() => {
    toastSpy.mockClear();
    writeText.mockClear();
  });

  const assistant = (text: string): ChatMessage => ({
    id: 'a1', role: 'assistant', parts: [{ type: 'text', text }], actions: ['copy', 'like', 'dislike'],
  });

  it('marks the chosen vote, hides the other, and KEEPS it across a streaming re-render', async () => {
    // Drive `messages` from a signal so we can hand the thread a brand-new array
    // reference (as a real streaming update would).
    const [messages, setMessages] = createSignal<ChatMessage[]>([assistant('Hello')]);
    const { getByLabelText, queryByLabelText } = render(() => <ChatThread messages={messages()} />);

    // Vote up.
    fireEvent.click(getByLabelText('Like'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    await tick();
    expect(getByLabelText('Like')).toHaveAttribute('aria-pressed', 'true');
    expect(getByLabelText('Dislike').closest('[data-feedback-collapsed]')).not.toBeNull();

    // Simulate a stream chunk: a NEW array ref + the SAME id with longer content.
    setMessages([assistant('Hello, world — now with more tokens')]);
    flush(); // V2-FLUSH: commit the staged write
    await tick();

    // The vote must survive the re-render: like still pressed, dislike still collapsed.
    expect(getByLabelText('Like')).toHaveAttribute('aria-pressed', 'true');
    expect(getByLabelText('Dislike').closest('[data-feedback-collapsed]')).not.toBeNull();
  });

  it('copies content to the clipboard, shows the check, and reverts after 2s', async () => {
    vi.useFakeTimers();
    try {
      const { getByLabelText } = render(() => <ChatThread messages={[assistant('Copy me')]} />);
      fireEvent.click(getByLabelText('Copy'));
      flush(); // V2-FLUSH: v2 stages writes; commit before asserting
      expect(writeText).toHaveBeenCalledWith('Copy me');
      // The copy button now shows the emerald check (aria-label flips to "Copied").
      expect(getByLabelText('Copied')).toBeInTheDocument();
      // After the 2s window it reverts.
      vi.advanceTimersByTime(2000);
      flush(); // V2-FLUSH: v2 stages writes; commit before asserting
      expect(getByLabelText('Copy')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits state:"on" on set and state:"off" on the un-vote re-tap', async () => {
    const onMessageAction = vi.fn();
    const { getByLabelText } = render(() => (
      <ChatThread messages={[assistant('Hi')]} onMessageAction={onMessageAction} />
    ));
    fireEvent.click(getByLabelText('Like'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onMessageAction).toHaveBeenLastCalledWith({ messageId: 'a1', action: 'like', state: 'on' });
    await tick();
    // Re-tap the same vote to clear it.
    fireEvent.click(getByLabelText('Like'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onMessageAction).toHaveBeenLastCalledWith({ messageId: 'a1', action: 'like', state: 'off' });
  });

  it('omits state for copy (no on/off)', () => {
    const onMessageAction = vi.fn();
    const { getByLabelText } = render(() => (
      <ChatThread messages={[assistant('Hi')]} onMessageAction={onMessageAction} />
    ));
    fireEvent.click(getByLabelText('Copy'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onMessageAction).toHaveBeenLastCalledWith({ messageId: 'a1', action: 'copy' });
  });

  it('controlled m.feedback renders the vote marked (and collapses the other)', () => {
    const controlled: ChatMessage = {
      id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'x' }], actions: ['like', 'dislike'], feedback: 'dislike',
    };
    const { getByLabelText } = render(() => <ChatThread messages={[controlled]} />);
    expect(getByLabelText('Dislike')).toHaveAttribute('aria-pressed', 'true');
    expect(getByLabelText('Like').closest('[data-feedback-collapsed]')).not.toBeNull();
  });

  it('toasts on copy and on a SET vote, but NOT on the un-vote', async () => {
    const { getByLabelText } = render(() => <ChatThread messages={[assistant('Hi')]} />);

    fireEvent.click(getByLabelText('Copy'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(toastSpy).toHaveBeenCalledWith('Copied to clipboard', expect.anything());

    toastSpy.mockClear();
    fireEvent.click(getByLabelText('Like'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(toastSpy).toHaveBeenCalledWith('Thanks for your feedback', expect.anything());
    await tick();

    // Un-vote: no toast.
    toastSpy.mockClear();
    fireEvent.click(getByLabelText('Like'));
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(toastSpy).not.toHaveBeenCalled();
  });
});

describe('ChatThread composer reset on submit', () => {
  // The input is the contenteditable composer (not a <textarea>): the editable
  // surface is [data-kai-composer-editable], its content is textContent, typing is
  // textContent + an input event, and Enter submits (see composer.test.tsx).
  const editableEl = (c: HTMLElement) => c.querySelector('[data-kai-composer-editable]') as HTMLElement;

  it('clears the typed draft after submit when the value is UNCONTROLLED', () => {
    // No `value` prop → the composer owns its draft. After a send it must reset,
    // so the batteries-included hooks (useKaiChat/createKaiChat) — whose `bind`
    // does not control `value` — get a clean composer each turn.
    const onSubmit = vi.fn();
    const { container } = render(() => <ChatThread messages={[]} onSubmit={onSubmit} />);
    const el = editableEl(container);

    el.textContent = 'hello there';
    fireEvent.input(el);
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting

    fireEvent.keyDown(el, { key: 'Enter' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ value: 'hello there' }));
    expect(el.textContent?.trim() ?? '').toBe(''); // draft cleared
  });

  it('does NOT clear a CONTROLLED value on submit (the host owns it)', () => {
    const onSubmit = vi.fn();
    const { container } = render(() => (
      <ChatThread messages={[]} value="locked" onSubmit={onSubmit} />
    ));
    const el = editableEl(container);
    expect(el.textContent).toContain('locked');

    fireEvent.keyDown(el, { key: 'Enter' });
    flush(); // V2-FLUSH: v2 stages writes; commit before asserting
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ value: 'locked' }));
    expect(el.textContent).toContain('locked'); // controlled — unchanged until the host clears it
  });
});
