import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal } from 'solid-js';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { ChatThread, type ChatThreadController } from './chat-thread';
import type { ChatMessage } from '../elements/chat-types';
import { localStorageStore } from '../primitives/conversation-store';

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

// jsdom has no ResizeObserver; ReasoningContent wires one when it mounts (same
// stub as reasoning.test.tsx / message.test.tsx) — needed for the new
// reasoningOpen forwarding tests below, which render a real reasoning part.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

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

  // headerEndContent: a Solid-composed caller's JSX escape hatch for the header-end
  // region (a docked widget's own close control being the motivating case — see
  // ui/dock.tsx's hideClose doc). Renders ALONGSIDE the named slot, not instead of
  // it, and counts toward showHeader() on its own.
  it('shows the header for headerEndContent alone, with no title/models/context/slots', () => {
    const { container } = render(() => <ChatThread messages={[]} headerEndContent={<button>Close</button>} />);
    expect(container.querySelector('header')).toBeTruthy();
  });

  it('renders headerEndContent in the header, alongside (not instead of) the header-end slot', () => {
    const { container, getByText } = render(() => (
      <ChatThread messages={[]} headerEnd headerEndContent={<button>Close</button>} />
    ));
    const header = container.querySelector('header');
    expect(header).toBeTruthy();
    expect(header!.querySelector('slot[name="header-end"]')).toBeTruthy();
    expect(getByText('Close')).toBeInTheDocument();
  });
});

// emptyContent: a Solid-composed caller's JSX escape hatch for the empty-state
// region, rendered in-tree (fully styled by the adopted stylesheet) rather than
// through the light-DOM `slot="empty"` boundary `empty` targets. Wins over
// `empty`/`slot="empty"` when both are set.
describe('ChatThread emptyContent (JSX empty-state escape hatch)', () => {
  it('renders emptyContent while the thread is empty', () => {
    const { getByText } = render(() => <ChatThread messages={[]} emptyContent={<div>Welcome!</div>} />);
    expect(getByText('Welcome!')).toBeInTheDocument();
  });

  it('does not render emptyContent once the thread has messages', () => {
    const messages: ChatMessage[] = [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }];
    const { queryByText } = render(() => <ChatThread messages={messages} emptyContent={<div>Welcome!</div>} />);
    expect(queryByText('Welcome!')).toBeNull();
  });

  it('emptyContent wins over the empty/slot="empty" boundary when both are set', () => {
    const { container, getByText, queryByText } = render(() => (
      <ChatThread messages={[]} empty emptyContent={<div>Welcome!</div>} />
    ));
    expect(getByText('Welcome!')).toBeInTheDocument();
    expect(container.querySelector('slot[name="empty"]')).toBeNull();
    expect(queryByText('Welcome!')).not.toBeNull();
  });

  it('empty alone (no emptyContent) still falls back to the slot', () => {
    const { container } = render(() => <ChatThread messages={[]} empty />);
    expect(container.querySelector('slot[name="empty"]')).toBeTruthy();
  });
});

// `attach` passthrough: mirrors the existing webSearch/voice pattern (ChatThreadProps
// -> the composer fallback branch -> DefaultPromptInput), but with the OPPOSITE
// default direction. webSearch/voice default OFF when undeclared (`props.webSearch
// === true`); attach must default ON when undeclared, so kit consumers who never
// heard of this prop keep today's behavior (attach visible) and only an explicit
// `attach={false}` hides it — forwarded as `props.attach` unchanged, not coerced.
describe('ChatThread attach passthrough', () => {
  const attachButton = (container: HTMLElement) => container.querySelector('button[aria-label="Attach files"]');

  it('shows the attach button when attach is undeclared (default)', () => {
    const { container } = render(() => <ChatThread messages={[]} />);
    expect(attachButton(container)).toBeTruthy();
  });

  it('shows the attach button when attach is explicitly true', () => {
    const { container } = render(() => <ChatThread messages={[]} attach={true} />);
    expect(attachButton(container)).toBeTruthy();
  });

  it('removes the attach button when attach is explicitly false', () => {
    const { container } = render(() => <ChatThread messages={[]} attach={false} />);
    expect(attachButton(container)).toBeNull();
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
    await tick();
    expect(getByLabelText('Like')).toHaveAttribute('aria-pressed', 'true');
    expect(getByLabelText('Dislike').closest('[data-feedback-collapsed]')).not.toBeNull();

    // Simulate a stream chunk: a NEW array ref + the SAME id with longer content.
    setMessages([assistant('Hello, world — now with more tokens')]);
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
      expect(writeText).toHaveBeenCalledWith('Copy me');
      // The copy button now shows the emerald check (aria-label flips to "Copied").
      expect(getByLabelText('Copied')).toBeInTheDocument();
      // After the 2s window it reverts.
      vi.advanceTimersByTime(2000);
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
    expect(onMessageAction).toHaveBeenLastCalledWith({ messageId: 'a1', action: 'like', state: 'on' });
    await tick();
    // Re-tap the same vote to clear it.
    fireEvent.click(getByLabelText('Like'));
    expect(onMessageAction).toHaveBeenLastCalledWith({ messageId: 'a1', action: 'like', state: 'off' });
  });

  it('omits state for copy (no on/off)', () => {
    const onMessageAction = vi.fn();
    const { getByLabelText } = render(() => (
      <ChatThread messages={[assistant('Hi')]} onMessageAction={onMessageAction} />
    ));
    fireEvent.click(getByLabelText('Copy'));
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
    expect(toastSpy).toHaveBeenCalledWith('Copied to clipboard', expect.anything());

    toastSpy.mockClear();
    fireEvent.click(getByLabelText('Like'));
    expect(toastSpy).toHaveBeenCalledWith('Thanks for your feedback', expect.anything());
    await tick();

    // Un-vote: no toast.
    toastSpy.mockClear();
    fireEvent.click(getByLabelText('Like'));
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

    fireEvent.keyDown(el, { key: 'Enter' });
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
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ value: 'locked' }));
    expect(el.textContent).toContain('locked'); // controlled — unchanged until the host clears it
  });
});

// Task 19f (owner ruling 2026-08-26): `reasoningOpen` forwards to every
// MessageBody as `reasoningDefaultOpen`, which seeds the Reasoning disclosure
// open AND (via openOnStream) keeps it tracking the stream — reproducing the
// pre-19f auto-open default losslessly for a consumer who opts back in.
describe('ChatThread reasoningOpen forwarding (Task 19f)', () => {
  const reasoningTrigger = (c: HTMLElement) =>
    Array.from(c.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Reasoning')) as HTMLButtonElement;

  const streamingMessages: ChatMessage[] = [
    { id: 'a1', role: 'assistant', parts: [{ type: 'reasoning', text: 'Considering the options.' }] },
  ];

  it('default (reasoningOpen absent): a streaming reasoning disclosure starts closed', () => {
    const { container } = render(() => <ChatThread messages={streamingMessages} loading={true} />);
    expect(reasoningTrigger(container)).toHaveAttribute('aria-expanded', 'false');
  });

  it('reasoningOpen={true} reaches MessageBody: a streaming reasoning disclosure starts open', () => {
    const { container } = render(() => <ChatThread messages={streamingMessages} loading={true} reasoningOpen={true} />);
    expect(reasoningTrigger(container)).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('conversations (C-1, C-2, C-6, C-8)', () => {
  beforeEach(() => localStorage.clear());

  it('conversations=false renders no list-toggle button (off by default)', () => {
    const { container } = render(() => (
      <ChatThread messages={[]} conversations={false} store={localStorageStore('t')} onSubmit={() => {}} />
    ));
    expect(container.querySelector('[data-kai-conversations-toggle]')).toBeNull();
  });

  it('conversations=true with no store: decides loudly, feature stays off', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(() => <ChatThread messages={[]} conversations={true} onSubmit={() => {}} />);
    expect(err).toHaveBeenCalled();
    expect(container.querySelector('[data-kai-conversations-toggle]')).toBeNull();
    err.mockRestore();
  });

  // CRITICAL-1 (2026-08-26 final review): `store` alone is not enough — a
  // consumer who forgets `onConversationLoad` gets an inert row-tap/new/
  // restore (ChatThread updates its own internal view/list state but the
  // rendered `messages` never changes) AND mount's auto-restore can stamp an
  // active conversation id that the save effect then clobbers with whatever
  // `messages` the caller drives in. Decide loudly instead, mirroring the
  // missing-`store` guard above.
  it('conversations=true with a store but no onConversationLoad handler: decides loudly, feature stays off', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = localStorageStore('t');
    const { container } = render(() => <ChatThread messages={[]} conversations={true} store={store} onSubmit={() => {}} />);
    expect(err).toHaveBeenCalled();
    expect(container.querySelector('[data-kai-conversations-toggle]')).toBeNull();
    err.mockRestore();
  });

  it('opening the list calls store.list(); a row select calls store.load() and swaps messages with a fresh array', async () => {
    const store = localStorageStore('t');
    await store.save('c1', [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]);
    const onMessagesChange = vi.fn();
    const { container } = render(() => (
      <ChatThread messages={[]} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={onMessagesChange} />
    ));
    fireEvent.click(container.querySelector('[data-kai-conversations-toggle]')!);
    await tick();
    expect(container.querySelector('[data-conversation-id="c1"]')).toBeTruthy();
    fireEvent.click(container.querySelector('[data-conversation-id="c1"]')!);
    await tick();
    expect(onMessagesChange).toHaveBeenCalledWith([{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }], 'c1');
  });

  it('C-6: no id is generated and nothing is saved until the first message', async () => {
    const store = localStorageStore('t');
    const saveSpy = vi.spyOn(store, 'save');
    render(() => <ChatThread messages={[]} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={() => {}} />);
    await tick();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(await store.list()).toEqual([]);
  });

  // Fix-round-1 regression: the save effect used to read activeConversationId()
  // tracked while also being the thing that WRITES it (minting the lazy id) —
  // the effect's own dependency set included a signal it set, so it re-ran and
  // fired store.save() twice with identical args on a new conversation's first
  // message. Reviewer verified empirically pre-fix: msg1 -> 2 calls, msg2 -> 3
  // cumulative. Post-fix (untrack the id read): exactly one save() per
  // message-array change.
  it('exactly one save() call per message-array change (no double-fire minting the lazy id)', async () => {
    const store = localStorageStore('t');
    const saveSpy = vi.spyOn(store, 'save');
    const [messages, setMessages] = createSignal<ChatMessage[]>([]);
    render(() => <ChatThread messages={messages()} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={() => {}} />);
    await tick();
    expect(saveSpy).not.toHaveBeenCalled();

    setMessages([{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]);
    await tick();
    expect(saveSpy).toHaveBeenCalledTimes(1);

    setMessages([
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'hello' }] },
    ]);
    await tick();
    expect(saveSpy).toHaveBeenCalledTimes(2);
  });

  // IMPORTANT-1 (2026-08-26 final review): the save effect used to fire right
  // after mount's auto-restore hands the loaded messages back through
  // `onConversationLoad` — a real consumer feeds that straight into
  // `messages`, so the save effect saw a "change" that was really just the
  // load bouncing back, stamped a fresh `updatedAt`, and called
  // `store.save()`. With the widget closed (`hostOpen={false}`) that phantom-
  // unreads a fully-read conversation on every single page reload (and fires
  // a needless full-thread PUT for `fetchStore`). This wires the consumer
  // side exactly like a real app would (`onConversationLoad` feeding a
  // signal back into `messages`) to catch the bounce, not just assert on
  // ChatThread's own internals.
  it('a reload (hostOpen=false, already fully read) does not phantom-badge or call save() for the load bounce — a REAL new message still saves and badges', async () => {
    const store = localStorageStore('t');
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-26T12:00:00.000Z'));
      await store.save('c1', [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]);
      await store.markRead!('c1'); // lastReadAt === updatedAt: fully read.
    } finally {
      vi.useRealTimers();
    }
    const saveSpy = vi.spyOn(store, 'save');
    const onUnreadChange = vi.fn();
    const [messages, setMessages] = createSignal<ChatMessage[]>([]);
    render(() => (
      <ChatThread
        messages={messages()}
        conversations={true}
        store={store}
        hostOpen={false}
        onUnreadChange={onUnreadChange}
        onSubmit={() => {}}
        onConversationLoad={(msgs) => setMessages(msgs)}
      />
    ));
    // Mount auto-restore selects c1 (the only conversation; `messages` starts
    // empty) and hands its messages back through `onConversationLoad`; the
    // wiring above feeds them straight into `messages` — the exact bounce
    // this fix is about.
    await tick();

    expect(saveSpy).not.toHaveBeenCalled();
    expect(onUnreadChange).not.toHaveBeenCalledWith(true);

    // A genuine new message (widget still closed) IS a real change: it must
    // still save, and — because the host is closed, so nothing marks it
    // read — must still badge.
    setMessages([
      ...messages(),
      { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'a reply while closed' }] },
    ]);
    await tick();
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(onUnreadChange).toHaveBeenCalledWith(true);
  });

  it('list() rejection degrades to chat-only mode with a visible warning, not a dead widget', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failingStore = { ...localStorageStore('t'), list: () => Promise.reject(new Error('offline')) };
    const { container } = render(() => (
      <ChatThread messages={[]} conversations={true} store={failingStore} onSubmit={() => {}} onConversationLoad={() => {}} />
    ));
    fireEvent.click(container.querySelector('[data-kai-conversations-toggle]')!);
    await tick();
    expect(warn).toHaveBeenCalled();
    // Chat-only mode: the composer is still usable, not a blank/dead panel.
    expect(container.querySelector('textarea, [contenteditable]')).toBeTruthy();
    warn.mockRestore();
  });
});

// Rework, 2026-08-26: the owner rejected the retrofit at the live demo — a
// desktop-shaped list (search box, group headers, a header "+" AND a
// full-width "+ New conversation" footer bar, suggestions and the composer
// still visible underneath). This is now a purpose-built widget-box list
// view (`ConversationPanel`) that TAKES OVER the full content area: no
// composer, no suggestions, ONE new-conversation control (a floating pill),
// and a row shows a last-message preview instead of a message count.
describe('conversations — list view is a full content-area takeover (owner rework, 2026-08-26)', () => {
  beforeEach(() => localStorage.clear());

  it('opening the list hides the composer entirely — not just the thread', async () => {
    const store = localStorageStore('t');
    await store.save('c1', [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]);
    const { container } = render(() => (
      <ChatThread messages={[]} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={() => {}} />
    ));
    // Chat view: the composer is present.
    expect(container.querySelector('textarea, [contenteditable]')).toBeTruthy();
    fireEvent.click(container.querySelector('[data-kai-conversations-toggle]')!);
    await tick();
    // List view: the discriminating query — no composer input anywhere in the DOM.
    expect(container.querySelector('textarea, [contenteditable]')).toBeNull();
  });

  it('the list view has exactly ONE new-conversation control — the floating pill — and no old footer bar, no search box, no group headers', async () => {
    const store = localStorageStore('t');
    await store.save('c1', [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]);
    const onMessagesChange = vi.fn();
    const { container } = render(() => (
      <ChatThread messages={[]} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={onMessagesChange} />
    ));
    fireEvent.click(container.querySelector('[data-kai-conversations-toggle]')!);
    await tick();
    const controls = container.querySelectorAll('[data-kai-new-conversation]');
    expect(controls).toHaveLength(1);
    // No desktop-ConversationList chrome: search box, group headers.
    expect(container.querySelector('input[aria-label="Search chats"]')).toBeNull();
    fireEvent.click(controls[0] as HTMLButtonElement);
    await tick();
    expect(onMessagesChange).toHaveBeenCalledWith([], undefined);
    // C-6: still nothing persisted for the new conversation.
    expect(await store.list()).toHaveLength(1);
  });

  it('a row shows the last-message preview text, not a message count', async () => {
    const store = localStorageStore('t');
    // Two saves — title fixes from the first message; trailing (the preview)
    // tracks the latest, so the two must differ to discriminate this test
    // from a false pass where both happen to read the same text.
    await store.save('c1', [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi there' }] }]);
    await store.save('c1', [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi there' }] },
      { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'Here is the answer you were looking for' }] },
    ]);
    const { container, getByText } = render(() => (
      <ChatThread messages={[]} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={() => {}} />
    ));
    fireEvent.click(container.querySelector('[data-kai-conversations-toggle]')!);
    await tick();
    expect(getByText('Here is the answer you were looking for')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d+ messages?/);
  });

  it('the header toggle swaps between a chat-bubble icon and a back arrow, each with its own aria-label', async () => {
    const store = localStorageStore('t');
    const { container } = render(() => (
      <ChatThread messages={[]} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={() => {}} />
    ));
    const toggle = () => container.querySelector('[data-kai-conversations-toggle]') as HTMLButtonElement;
    expect(toggle()).toHaveAttribute('aria-label', 'Conversations');
    expect(toggle().querySelector('svg')).toBeTruthy();
    fireEvent.click(toggle());
    await tick();
    expect(toggle()).toHaveAttribute('aria-label', 'Back to chat');
    expect(toggle().querySelector('svg')).toBeTruthy();
  });
});

// Cross-task fix (Task 5's review flagged this against Task 2's mount-time
// state machine): mount used to only call refreshConversations() — nothing
// ever loaded the visitor's own previously-active thread into `messages`, so
// a construct upgraded from plain history to `conversations` booted to an
// EMPTY composer, and the migrated (C-7) thread was reachable only by
// opening the list and tapping it. The owner's contract is explicit
// resume-between-pages: auto-restore on mount.
describe('conversations — visitor continuity: auto-restore on mount (cross-task fix)', () => {
  beforeEach(() => localStorage.clear());

  it('(a) mount with 2 stored conversations: the newer one auto-loads, view stays chat, exactly one load() call', async () => {
    const store = localStorageStore('t');
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      await store.save('older', [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'older msg' }] }]);
      vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
      await store.save('newer', [{ id: 'm2', role: 'user', parts: [{ type: 'text', text: 'newer msg' }] }]);
    } finally {
      vi.useRealTimers();
    }
    const loadSpy = vi.spyOn(store, 'load');
    const onMessagesChange = vi.fn();
    const { container } = render(() => (
      <ChatThread messages={[]} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={onMessagesChange} />
    ));
    await tick();
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(loadSpy).toHaveBeenCalledWith('newer');
    expect(onMessagesChange).toHaveBeenCalledWith([{ id: 'm2', role: 'user', parts: [{ type: 'text', text: 'newer msg' }] }], 'newer');
    // Stays in the 'chat' view — the list-view search chrome never rendered.
    expect(container.querySelector('input[aria-label="Search chats"]')).toBeNull();
    expect(container.querySelector('textarea, [contenteditable]')).toBeTruthy();
  });

  it('(b) mount with an empty store: no load() call, stays on the empty chat', async () => {
    const store = localStorageStore('t');
    const loadSpy = vi.spyOn(store, 'load');
    const onMessagesChange = vi.fn();
    render(() => (
      <ChatThread messages={[]} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={onMessagesChange} />
    ));
    await tick();
    expect(loadSpy).not.toHaveBeenCalled();
    expect(onMessagesChange).not.toHaveBeenCalled();
  });

  it('(c) mount with parent-seeded messages: no auto-restore (never clobbers a caller-owned thread)', async () => {
    const store = localStorageStore('t');
    await store.save('c1', [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'stored' }] }]);
    const loadSpy = vi.spyOn(store, 'load');
    const onMessagesChange = vi.fn();
    const seeded: ChatMessage[] = [{ id: 'seed', role: 'user', parts: [{ type: 'text', text: 'seeded' }] }];
    const { getByText } = render(() => (
      <ChatThread messages={seeded} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={onMessagesChange} />
    ));
    await tick();
    expect(loadSpy).not.toHaveBeenCalled();
    expect(onMessagesChange).not.toHaveBeenCalled();
    expect(getByText('seeded')).toBeInTheDocument();
  });

  it('(d) C-7 migration + auto-restore composed: a legacy single-thread key becomes the visitor\'s auto-restored conversation', async () => {
    // The exact legacy key shape localStorageStore's migrateLegacyThread() reads
    // (name 't', no userId): `kai:{name}:thread`.
    localStorage.setItem('kai:t:thread', JSON.stringify([{ id: 'legacy1', role: 'user', parts: [{ type: 'text', text: 'legacy message' }] }]));
    const store = localStorageStore('t');
    const onMessagesChange = vi.fn();
    render(() => (
      <ChatThread messages={[]} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={onMessagesChange} />
    ));
    await tick();
    // The end-to-end continuity the finding is about: the visitor SEES their
    // pre-upgrade thread with no extra tap into the list.
    expect(onMessagesChange).toHaveBeenCalledWith([{ id: 'legacy1', role: 'user', parts: [{ type: 'text', text: 'legacy message' }] }], expect.any(String));
  });
});

// Owner follow-up, 2026-08-26: closing the widget while the list is open used
// to leave `view` at 'list' — reopening landed back on the list instead of
// the default chat screen. ChatThread has no knowledge of whatever chrome
// hosts it (a Dock, a plain page, …), so the fix is a seam it DOES own: an
// imperative `closeConversationsList()` on the existing `controllerRef`
// handle, which a host calls on every hide. `Dock`'s own `onOpenChange`
// already fires on every close path (header X, launcher toggle, Escape), so
// the emitted App wires this once, at the Dock level, rather than per path
// (see codegen.ts's `emitDockOnOpenChangeProp`).
describe('conversations — closeConversationsList() resets the list view back to chat (owner follow-up)', () => {
  beforeEach(() => localStorage.clear());

  it('calling it while the list is open swaps back to the chat view (composer visible again)', async () => {
    const store = localStorageStore('t');
    await store.save('c1', [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]);
    let controller: ChatThreadController | undefined;
    const { container } = render(() => (
      <ChatThread
        messages={[]} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={() => {}}
        controllerRef={(c) => { controller = c; }}
      />
    ));
    fireEvent.click(container.querySelector('[data-kai-conversations-toggle]')!);
    await tick();
    // List view: no composer.
    expect(container.querySelector('textarea, [contenteditable]')).toBeNull();

    controller!.closeConversationsList();
    await tick();
    // Back to chat view: composer is back, and the toggle reads "Conversations" again.
    expect(container.querySelector('textarea, [contenteditable]')).toBeTruthy();
    expect(container.querySelector('[data-kai-conversations-toggle]')).toHaveAttribute('aria-label', 'Conversations');
  });

  it('is a no-op when already on the chat view', async () => {
    const store = localStorageStore('t');
    let controller: ChatThreadController | undefined;
    const { container } = render(() => (
      <ChatThread
        messages={[]} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={() => {}}
        controllerRef={(c) => { controller = c; }}
      />
    ));
    await tick();
    controller!.closeConversationsList();
    await tick();
    expect(container.querySelector('textarea, [contenteditable]')).toBeTruthy();
  });

  it('the NEXT open after a reset lands on the chat view, not the list (the exact regression: reopening a closed widget)', async () => {
    const store = localStorageStore('t');
    await store.save('c1', [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]);
    let controller: ChatThreadController | undefined;
    const { container } = render(() => (
      <ChatThread
        messages={[]} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={() => {}}
        controllerRef={(c) => { controller = c; }}
      />
    ));
    fireEvent.click(container.querySelector('[data-kai-conversations-toggle]')!);
    await tick();
    expect(container.querySelector('[data-conversation-id="c1"]')).toBeTruthy();

    // Simulate the host (Dock) closing and reopening: it calls
    // closeConversationsList() on close; ChatThread itself is never
    // unmounted (Dock keeps its panel mounted while hidden — see dock.tsx).
    controller!.closeConversationsList();
    await tick();

    expect(container.querySelector('textarea, [contenteditable]')).toBeTruthy();
    expect(container.querySelector('[data-conversation-id="c1"]')).toBeNull();
  });
});

// Unread indicators (owner round, 2026-08-26). Seeded `messages` (non-empty)
// keeps mount-time auto-restore from selecting the newest conversation
// itself (it only runs when `props.messages` is empty), so `c2` stays
// unselected/unread until a test explicitly picks it — otherwise auto-
// restore would immediately mark it read via the "seen" effect before any
// assertion ran.
describe('conversations — unread indicators (owner round, 2026-08-26)', () => {
  beforeEach(() => localStorage.clear());

  const seedUnreadConversation = async (store: ReturnType<typeof localStorageStore>) => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-26T12:00:00.000Z'));
      await store.save('c2', [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]);
      await store.markRead!('c2');
      vi.setSystemTime(new Date('2026-08-26T12:05:00.000Z'));
      await store.save('c2', [
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
        { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'a new reply' }] },
      ]);
    } finally {
      vi.useRealTimers();
    }
  };
  const seededMessages: ChatMessage[] = [{ id: 'seed', role: 'user', parts: [{ type: 'text', text: 'seeded' }] }];

  it('a row whose updatedAt advanced after its lastReadAt shows the unread dot', async () => {
    const store = localStorageStore('t');
    await seedUnreadConversation(store);
    const { container } = render(() => (
      <ChatThread messages={seededMessages} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={() => {}} />
    ));
    fireEvent.click(container.querySelector('[data-kai-conversations-toggle]')!);
    await tick();
    expect(container.querySelector('[data-conversation-id="c2"]')).toHaveAttribute('data-unread', '');
  });

  it('the header toggle shows a badge when any OTHER conversation is unread', async () => {
    const store = localStorageStore('t');
    await seedUnreadConversation(store);
    const { container } = render(() => (
      <ChatThread messages={seededMessages} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={() => {}} />
    ));
    await tick();
    expect(container.querySelector('[data-kai-conversations-unread]')).toBeTruthy();
    expect(container.querySelector('[data-kai-conversations-toggle]')).toHaveAttribute('aria-label', 'Conversations (unread)');
  });

  it('no unread conversations: no badge on the toggle', async () => {
    const store = localStorageStore('t');
    await store.save('c1', [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]);
    await store.markRead!('c1');
    const { container } = render(() => (
      <ChatThread messages={seededMessages} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={() => {}} />
    ));
    await tick();
    expect(container.querySelector('[data-kai-conversations-unread]')).toBeNull();
    expect(container.querySelector('[data-kai-conversations-toggle]')).toHaveAttribute('aria-label', 'Conversations');
  });

  it('selecting the unread conversation clears the header badge immediately (excluded by id) and persists lastReadAt (row loses its dot on the next list open)', async () => {
    const store = localStorageStore('t');
    await seedUnreadConversation(store);
    const onMessagesChange = vi.fn();
    const { container } = render(() => (
      <ChatThread messages={seededMessages} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={onMessagesChange} />
    ));
    await tick();
    // Chat view, before touching the list: the badge is present (only
    // rendered over the chat-bubble glyph — see the prop's own doc).
    expect(container.querySelector('[data-kai-conversations-unread]')).toBeTruthy();

    fireEvent.click(container.querySelector('[data-kai-conversations-toggle]')!);
    await tick();
    fireEvent.click(container.querySelector('[data-conversation-id="c2"]')!);
    await tick();
    // Back in chat view; the badge is gone immediately (c2 is now the active
    // conversation, excluded from "any OTHER conversation is unread" by id —
    // it doesn't need to wait on a fresh list() round-trip).
    expect(container.querySelector('[data-kai-conversations-toggle]')).toHaveAttribute('aria-label', 'Conversations');

    // And the persistence side actually happened: reopening the list re-fetches
    // from the store, and c2's row no longer carries data-unread.
    fireEvent.click(container.querySelector('[data-kai-conversations-toggle]')!);
    await tick();
    expect(container.querySelector('[data-conversation-id="c2"]')).not.toHaveAttribute('data-unread');
  });

  it('the unread dot/badge use the dedicated --color-unread token (bg-unread), not bg-accent', async () => {
    const store = localStorageStore('t');
    await seedUnreadConversation(store);
    const { container } = render(() => (
      <ChatThread messages={seededMessages} conversations={true} store={store} onSubmit={() => {}} onConversationLoad={() => {}} />
    ));
    await tick();
    // Header badge (chat view, before opening the list).
    expect(container.querySelector('[data-kai-conversations-unread]')).toHaveClass('bg-unread');
    expect(container.querySelector('[data-kai-conversations-unread]')).not.toHaveClass('bg-accent');
    // List-row trailing dot.
    fireEvent.click(container.querySelector('[data-kai-conversations-toggle]')!);
    await tick();
    const row = container.querySelector('[data-conversation-id="c2"]')!;
    const dot = row.querySelector('.rounded-full');
    expect(dot).toHaveClass('bg-unread');
    expect(dot).not.toHaveClass('bg-accent');
  });

  // hostOpen (owner review, 2026-08-26 follow-up): no prior test exercised
  // `hostOpen={false}` directly. These two pin (a) the markRead gate and (b)
  // the CRITICAL regression the review found — `anyUnread` excluding the
  // active conversation by id UNCONDITIONALLY, which combined with the
  // markRead gate correctly not firing while closed, silently dropped the
  // one case the whole feature exists for: an agent reply landing on the
  // currently-active conversation while the widget is closed. Both fail on
  // the pre-fix code (case (b) never reflects "unread" while hostOpen is
  // false; case (a)'s own markRead-gate existed before but had no direct
  // test with hostOpen threaded through ChatThread's own prop).
  describe('hostOpen (seenNow) — the shared seen memo', () => {
    it('markRead does NOT fire while hostOpen={false}, even with the conversation active in chat view', async () => {
      const store = localStorageStore('t');
      const markReadSpy = vi.spyOn(store, 'markRead');
      // Non-empty `messages` mints a lazy conversation id on mount (the
      // save-on-change effect) and makes it the active conversation, landing
      // in `view() === 'chat'` by default — the only leg missing for "seen"
      // is `hostOpen`, which is false here throughout.
      render(() => (
        <ChatThread messages={seededMessages} conversations={true} store={store} hostOpen={false} onSubmit={() => {}} onConversationLoad={() => {}} />
      ));
      await tick();
      expect(markReadSpy).not.toHaveBeenCalled();
    });

    it('CRITICAL: a message arriving on the ACTIVE conversation while hostOpen={false} surfaces the badge; reopening (hostOpen=true) marks it read and clears it', async () => {
      const store = localStorageStore('t');
      const onUnreadChange = vi.fn();
      const [hostOpen, setHostOpen] = createSignal(true);
      const [messages, setMessages] = createSignal<ChatMessage[]>([
        { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      ]);
      const { container } = render(() => (
        <ChatThread
          messages={messages()}
          conversations={true}
          store={store}
          hostOpen={hostOpen()}
          onUnreadChange={onUnreadChange}
          onSubmit={() => {}}
          onConversationLoad={() => {}}
        />
      ));
      await tick();
      // The lazy-id mint (save-on-change effect) made this the active
      // conversation; hostOpen is true and view is 'chat', so it was marked
      // read on save — no badge yet.
      expect(container.querySelector('[data-kai-conversations-unread]')).toBeNull();
      onUnreadChange.mockClear();

      // Close the host, then simulate an assistant reply landing on the
      // still-active conversation (ChatThread stays mounted while a Dock
      // hides it — see `hostOpen`'s own doc).
      setHostOpen(false);
      await tick();
      setMessages([
        ...messages(),
        { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'a reply while closed' }] },
      ]);
      await tick();

      expect(onUnreadChange).toHaveBeenCalledWith(true);
      expect(container.querySelector('[data-kai-conversations-unread]')).toBeTruthy();

      // Reopen: `seenNow` flips true again, the "seen" effect re-runs on the
      // now-tracked `props.messages` and marks it read, clearing the badge.
      onUnreadChange.mockClear();
      setHostOpen(true);
      await tick();

      expect(onUnreadChange).toHaveBeenCalledWith(false);
      expect(container.querySelector('[data-kai-conversations-unread]')).toBeNull();
    });
  });
});
