import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal } from 'solid-js';
import { render, cleanup, fireEvent } from '@solidjs/testing-library';
import { Thread, type ThreadController } from './thread';
import type { ChatMessage } from '../elements/chat-types';

// Spy on the imperative toast() the feedback controller raises.
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

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Thread message rendering', () => {
  const convo: ChatMessage[] = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hello there' }] },
    { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'General Kenobi' }] },
  ];

  it('renders one row per message with its content', () => {
    const { getByText } = render(() => <Thread messages={convo} />);
    expect(getByText('Hello there')).toBeInTheDocument();
    expect(getByText('General Kenobi')).toBeInTheDocument();
  });

  it('renders an avatar rail for messages that carry an avatar', () => {
    const withAvatar: ChatMessage[] = [
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'hi' }], avatar: { fallback: 'AI' } },
    ];
    const { getByText } = render(() => <Thread messages={withAvatar} />);
    expect(getByText('AI')).toBeInTheDocument();
  });

  it('renders parts in order, not grouped by type', () => {
    const message: ChatMessage = {
      id: 'm1', role: 'assistant',
      parts: [
        { type: 'text', text: 'Checking.' },
        { type: 'tool', tool: { type: 'get_weather', kind: 'generic', state: 'output-available' } },
        { type: 'text', text: 'Done.' },
      ],
    };
    const { container } = render(() => <Thread messages={[message]} />);
    const text = container.textContent ?? '';
    // A grouped render (all tools, then all text concatenated) would still put
    // "Checking." before "Done." and would still contain "get_weather", so a
    // real three-way check is required to prove genuine interleaving, not just
    // grouping-by-luck.
    const iChecking = text.indexOf('Checking.');
    const iTool = text.indexOf('get_weather');
    const iDone = text.indexOf('Done.');
    expect(iChecking).toBeGreaterThanOrEqual(0);
    expect(iTool).toBeGreaterThan(iChecking);
    expect(iDone).toBeGreaterThan(iTool);
  });
});

describe('Thread empty state', () => {
  it('renders the built-in zero-state when empty and no `empty` is provided', () => {
    const { getByText } = render(() => <Thread messages={[]} />);
    expect(getByText('No messages yet')).toBeInTheDocument();
  });

  it('renders a custom `empty` node when provided and the thread is empty', () => {
    const { getByText, queryByText } = render(() => (
      <Thread messages={[]} empty={<div>Ask me anything</div>} />
    ));
    expect(getByText('Ask me anything')).toBeInTheDocument();
    expect(queryByText('No messages yet')).toBeNull();
  });

  it('hides the empty state once the thread has messages', () => {
    const { queryByText } = render(() => (
      <Thread messages={[{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]} />
    ));
    expect(queryByText('No messages yet')).toBeNull();
  });

  it('suppresses the empty state while loading (shows a typing indicator instead)', () => {
    const { queryByText } = render(() => <Thread messages={[]} loading />);
    expect(queryByText('No messages yet')).toBeNull();
  });
});

describe('Thread message actions', () => {
  beforeEach(() => {
    toastSpy.mockClear();
    writeText.mockClear();
  });

  const assistant = (text: string): ChatMessage => ({
    id: 'a1', role: 'assistant', parts: [{ type: 'text', text }], actions: ['copy', 'like', 'dislike'],
  });

  it('fires onMessageAction with { messageId, action:"copy" } and copies content', () => {
    const onMessageAction = vi.fn();
    const { getByLabelText } = render(() => (
      <Thread messages={[assistant('Copy me')]} onMessageAction={onMessageAction} />
    ));
    fireEvent.click(getByLabelText('Copy'));
    expect(writeText).toHaveBeenCalledWith('Copy me');
    expect(onMessageAction).toHaveBeenLastCalledWith({ messageId: 'a1', action: 'copy' });
  });

  it('emits state:"on" on a set vote and state:"off" on the un-vote re-tap', async () => {
    const onMessageAction = vi.fn();
    const { getByLabelText } = render(() => (
      <Thread messages={[assistant('Hi')]} onMessageAction={onMessageAction} />
    ));
    fireEvent.click(getByLabelText('Like'));
    expect(onMessageAction).toHaveBeenLastCalledWith({ messageId: 'a1', action: 'like', state: 'on' });
    await tick();
    fireEvent.click(getByLabelText('Like'));
    expect(onMessageAction).toHaveBeenLastCalledWith({ messageId: 'a1', action: 'like', state: 'off' });
  });
});

describe('Thread stick-to-bottom', () => {
  it('exposes scrollToBottom via controllerRef and scrolls the viewport', () => {
    const scrollTo = vi.fn();
    (Element.prototype as unknown as { scrollTo: typeof scrollTo }).scrollTo = scrollTo;
    let controller: ThreadController | undefined;
    const { container } = render(() => (
      <Thread messages={[{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }]} controllerRef={(c) => (controller = c)} />
    ));
    const viewport = container.querySelector('.overflow-y-auto') as HTMLElement;
    // Give the viewport a scrollHeight the jsdom layout won't.
    Object.defineProperty(viewport, 'scrollHeight', { value: 999, configurable: true });
    scrollTo.mockClear();

    controller?.scrollToBottom('auto');
    expect(scrollTo).toHaveBeenCalledWith({ top: 999, behavior: 'auto' });
  });

  it('auto-scrolls to the bottom when handed a new messages array (a stream chunk)', async () => {
    // Run the useStickToBottom rAF synchronously so onNewContent scrolls now.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
    const scrollTo = vi.fn();
    (Element.prototype as unknown as { scrollTo: typeof scrollTo }).scrollTo = scrollTo;

    const base: ChatMessage[] = [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Stream please' }] }];
    const [messages, setMessages] = createSignal<ChatMessage[]>(base);
    render(() => <Thread messages={messages()} />);

    scrollTo.mockClear();
    // A NEW array reference with an appended assistant turn — as a stream chunk.
    setMessages([...base, { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'streaming...' }] }]);
    await tick();

    expect(scrollTo).toHaveBeenCalled();
    // Sticks to the bottom instantly (not the smooth user-initiated scroll).
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'instant' }));
    vi.unstubAllGlobals();
  });
});
