import '../../src/elements/chat';
import type { ChatMessage } from '../../src/elements/chat-types';

// jsdom does not implement Element.prototype.scrollTo. ChatContainer's
// stick-to-bottom primitive calls it via requestAnimationFrame when message
// content mounts; without this polyfill that async call throws an uncaught
// TypeError. Real browsers implement scrollTo, so this is a jsdom-only shim.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

const messages: ChatMessage[] = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
  { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'Hello! How can I help?' }], actions: ['copy'] },
];

test('renders messages and emits submit', async () => {
  const el = document.createElement('kai-chat') as HTMLElement & { messages: ChatMessage[] };
  el.messages = messages;
  document.body.appendChild(el);
  await Promise.resolve();

  expect(el.shadowRoot!.textContent).toContain('Hi there');
  expect(el.shadowRoot!.textContent).toContain('Hello! How can I help?');

  let submitted: string | null = null;
  el.addEventListener('kai-submit', (e) => (submitted = (e as CustomEvent).detail.value));
  const editable = el.shadowRoot!.querySelector('[data-kai-composer-editable]') as HTMLElement;
  editable.textContent = 'next question';
  editable.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
  expect(submitted).toBe('next question');

  el.remove();
});

test('emits messageaction when an action button is clicked', async () => {
  const el = document.createElement('kai-chat') as HTMLElement & { messages: ChatMessage[] };
  el.messages = messages;
  document.body.appendChild(el);
  await Promise.resolve();

  let action: { messageId: string; action: string } | null = null;
  el.addEventListener('kai-message-action', (e) => (action = (e as CustomEvent).detail));
  const btn = el.shadowRoot!.querySelector('[data-action="copy"]') as HTMLElement;
  btn.click();
  expect(action).toEqual({ messageId: 'm2', action: 'copy' });

  el.remove();
});

test('codeHighlight={false} renders fenced code as plain text (no Shiki)', async () => {
  const el = document.createElement('kai-chat') as HTMLElement & {
    messages: ChatMessage[]; codeHighlight: boolean;
  };
  el.codeHighlight = false;
  el.messages = [{ id: 'm1', role: 'assistant', parts: [{ type: 'text', text: '```tsx\nconst answer = 42\n```' }] }];
  document.body.appendChild(el);
  await Promise.resolve();

  const pre = el.shadowRoot!.querySelector('pre');
  expect(pre).toBeTruthy();
  expect(el.shadowRoot!.textContent).toContain('const answer = 42');
  // Shiki adds inline token color styles; the disabled path must not. Scope the
  // check to the code block — the element wrapper carries its own
  // `style="…color:var(--color-foreground)"` (theme inheritance) that is
  // unrelated to syntax highlighting.
  expect(pre!.innerHTML).not.toMatch(/style="[^"]*color/);

  el.remove();
});
