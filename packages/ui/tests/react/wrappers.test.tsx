/**
 * Proves the generated `@kitn.ai/ui/react` wrappers behave like native React
 * components: array/object props reach the element as LIVE DOM properties (not
 * stringified attributes), `on<Event>` handlers fire on the element's
 * CustomEvents, boolean props toggle features, and prop updates re-assign.
 *
 * Run with `npm run test:react` (uses vitest.react.config.ts → @vitejs/plugin-
 * react, NOT the global Solid transform). Elements are registered once in
 * tests/react/setup.ts via the prebuilt bundle.
 */
import { render, cleanup } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Conversations, PromptInput, Chat, Panel, Row, Suggestions } from '@kitn.ai/ui/react';

afterEach(cleanup);

// Lets SolidJS flush its microtask-based renders into the shadow root.
const flush = () => new Promise((r) => setTimeout(r, 0));

type AnyEl = HTMLElement & Record<string, unknown>;

test('array/object prop reaches the element as a live property (not a string)', async () => {
  const conversations = [
    {
      id: 'c1',
      title: 'Hello world',
      groupId: 'g1',
      scope: { type: 'collection' as const },
      messageCount: 2,
      lastMessageAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
    },
  ];
  const groups = [{ id: 'g1', name: 'Today', sortOrder: 0, createdAt: '2026-06-01' }];

  const { container } = render(
    <Conversations conversations={conversations} groups={groups} />,
  );
  const el = container.querySelector('kai-conversations') as unknown as AnyEl;
  expect(el).toBeTruthy();

  // The SAME array instance is on the element — not stringified to an attribute.
  expect(el.conversations).toBe(conversations);
  expect(Array.isArray(el.conversations)).toBe(true);
  expect(typeof el.conversations).not.toBe('string');
  // And it is NOT reflected as an attribute (would be "[object Object]").
  expect(el.getAttribute('conversations')).toBeNull();

  await flush();
  // The data actually rendered into the shadow DOM.
  expect(el.shadowRoot?.textContent).toContain('Hello world');
});

test('on<Event> handler fires with the CustomEvent detail', async () => {
  const onSubmit = vi.fn();
  const { container } = render(<PromptInput onSubmit={onSubmit} placeholder="Ask..." />);
  const el = container.querySelector('kai-prompt-input') as unknown as AnyEl;
  await flush();

  // The composer is a contenteditable surface (not a <textarea>).
  const editable = el.shadowRoot!.querySelector('[data-kai-composer-editable]') as HTMLElement;
  editable.textContent = 'hello';
  editable.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  const ev = onSubmit.mock.calls[0][0] as CustomEvent<{ value: string }>;
  expect(ev.detail.value).toBe('hello');
});

test('boolean prop toggles a feature (loading disables send)', async () => {
  const { container } = render(<PromptInput loading />);
  const el = container.querySelector('kai-prompt-input') as unknown as AnyEl;
  await flush();

  // Boolean reached the element as a real boolean property.
  expect(el.loading).toBe(true);

  const send = el.shadowRoot!.querySelector<HTMLButtonElement>('[data-testid="send"]')!;
  expect(send.disabled).toBe(true);
});

test('updating a prop re-assigns the element property and re-renders', async () => {
  const first = [
    {
      id: 'c1', title: 'First chat', groupId: 'g1', scope: { type: 'collection' as const },
      messageCount: 1, lastMessageAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
    },
  ];
  const second = [
    {
      id: 'c2', title: 'Second chat', groupId: 'g1', scope: { type: 'collection' as const },
      messageCount: 1, lastMessageAt: '2026-06-02T00:00:00Z', updatedAt: '2026-06-02T00:00:00Z',
    },
  ];
  const groups = [{ id: 'g1', name: 'Today', sortOrder: 0, createdAt: '2026-06-01' }];

  const { container, rerender } = render(
    <Conversations conversations={first} groups={groups} />,
  );
  const el = container.querySelector('kai-conversations') as unknown as AnyEl;
  await flush();
  expect(el.conversations).toBe(first);
  expect(el.shadowRoot?.textContent).toContain('First chat');

  rerender(<Conversations conversations={second} groups={groups} />);
  await flush();
  expect(el.conversations).toBe(second);
  expect(el.shadowRoot?.textContent).toContain('Second chat');
  expect(el.shadowRoot?.textContent).not.toContain('First chat');
});

test('object prop (messages) on Chat reaches the element unstringified', async () => {
  const messages = [
    { id: 'm1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Hi there' }] },
    { id: 'm2', role: 'assistant' as const, parts: [{ type: 'text' as const, text: 'Hello!' }] },
  ];
  const { container } = render(<Chat messages={messages} theme="light" />);
  const el = container.querySelector('kai-chat') as unknown as AnyEl;
  await flush();

  expect(el.messages).toBe(messages);
  expect(el.getAttribute('messages')).toBeNull();
  expect(el.shadowRoot?.textContent).toContain('Hi there');
});

// ─── F-8: slot, hidden, and clearing a prop ──────────────────────────────────
// The blocks contract spike (docs/superpowers/research/2026-09-02-blocks-contract-spike.md,
// F-8) found three holes in one block. `slot` and `hidden` were not declared on
// WebComponentProps and not forwarded, so composing kai elements into kai SLOTS --
// which most blocks do -- did not type-check and did not work; and a prop set back
// to `undefined` was skipped rather than cleared, so a widget that drops its
// conversation starters after the first turn showed them forever.

test('slot is forwarded to the element (composing into a kai slot)', async () => {
  const { container } = render(<Panel slot="panel" />);
  const el = container.querySelector('kai-panel') as unknown as AnyEl;
  await flush();
  // The ATTRIBUTE is the one that matters: slot assignment is an attribute
  // contract, and a parent's <slot name="panel"> matches on it.
  expect(el.getAttribute('slot')).toBe('panel');
});

test('hidden is forwarded, and toggles back off', async () => {
  const { container, rerender } = render(<Row hidden />);
  const el = container.querySelector('kai-row') as unknown as AnyEl;
  await flush();
  expect(el.hidden).toBe(true);
  expect(el.hasAttribute('hidden')).toBe(true);

  rerender(<Row />);
  await flush();
  expect(el.hidden).toBe(false);
  expect(el.hasAttribute('hidden')).toBe(false);
});

test('a prop re-rendered as undefined CLEARS it on the element', async () => {
  const { container, rerender } = render(<Suggestions suggestions={['a', 'b']} />);
  const el = container.querySelector('kai-suggestions') as unknown as AnyEl;
  await flush();
  expect(el.suggestions).toEqual(['a', 'b']);

  rerender(<Suggestions suggestions={undefined} />);
  await flush();
  expect(el.suggestions).toBeUndefined();
});

test('a prop ABSENT from props is left alone (not cleared)', async () => {
  // The other half of the rule, and the reason the guard is `name in p` rather
  // than a plain assignment: React callers who mean "leave whatever is on the
  // element alone" omit the key. `undefined` is a value; an absent key is not.
  const { container, rerender } = render(<PromptInput placeholder="Ask" />);
  const el = container.querySelector('kai-prompt-input') as unknown as AnyEl;
  await flush();

  el.loading = true; // set imperatively, never passed through React
  rerender(<PromptInput placeholder="Ask again" />);
  await flush();
  expect(el.loading).toBe(true);
});
