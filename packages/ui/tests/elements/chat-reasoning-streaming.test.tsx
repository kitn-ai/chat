/**
 * F-21 end to end, at the element level: while `<kai-chat loading>` streams a
 * reasoning part into the LAST assistant message, the Reasoning disclosure is
 * OPEN (the user watches the thinking arrive), and once loading clears it
 * settles closed. This is the exact path that regressed in the field
 * (.superpowers/sdd/2026-08-20-rung-3/latency-debug/report.md): reasoning.tsx
 * always gated auto-open on `isStreaming`, and nothing on the kai-chat path
 * ever passed it.
 */
import '../../src/elements/chat';
import type { ChatMessage } from '../../src/elements/chat-types';

// jsdom does not implement Element.prototype.scrollTo (same shim as
// chat-element.test.tsx): ChatContainer's stick-to-bottom primitive calls it
// via requestAnimationFrame when message content mounts.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

// jsdom has no ResizeObserver; the reasoning disclosure observes its content
// height on mount (same stub as message.test.tsx / response-compare.test.tsx).
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const reasoningTrigger = (el: HTMLElement) =>
  Array.from(el.shadowRoot!.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes('Reasoning'),
  ) as HTMLButtonElement | undefined;

const reasoningOpen = (el: HTMLElement) =>
  reasoningTrigger(el)?.getAttribute('aria-expanded') === 'true';

const streamingThread = (reasoningText: string): ChatMessage[] => [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Why is the sky blue?' }] },
  { id: 'a1', role: 'assistant', parts: [{ type: 'reasoning', text: reasoningText }] },
];

function mountChat(messages: ChatMessage[], loading: boolean) {
  const el = document.createElement('kai-chat') as HTMLElement & { messages: ChatMessage[] };
  el.messages = messages;
  if (loading) el.setAttribute('loading', '');
  document.body.appendChild(el);
  return el;
}

test('the reasoning panel is OPEN while the last assistant message streams', async () => {
  const el = mountChat(streamingThread('Considering'), true);
  await flush();

  expect(reasoningTrigger(el)).toBeTruthy();
  expect(reasoningOpen(el)).toBe(true);

  // The next delta (new array + new part object, per the reactivity contract)
  // keeps it open and keeps the text flowing.
  const next = streamingThread('Considering Rayleigh scattering');
  el.messages = next;
  await flush();
  expect(reasoningOpen(el)).toBe(true);
  expect(el.shadowRoot!.textContent).toContain('Rayleigh scattering');

  el.remove();
});

test('the panel settles closed once loading clears', async () => {
  const el = mountChat(streamingThread('Considering the question.'), true);
  await flush();
  expect(reasoningOpen(el)).toBe(true);

  el.removeAttribute('loading');
  await flush();
  expect(reasoningOpen(el)).toBe(false);

  el.remove();
});

test('a settled thread (no loading) renders the panel collapsed', async () => {
  const el = mountChat(streamingThread('All done thinking.'), false);
  await flush();

  expect(reasoningTrigger(el)).toBeTruthy();
  expect(reasoningOpen(el)).toBe(false);

  el.remove();
});

test('loading with the reasoning NOT on the last message leaves that panel closed', async () => {
  // The streaming-ness belongs to the LAST assistant message only: an earlier
  // turn's reasoning must not pop open because a new request is in flight.
  const messages: ChatMessage[] = [
    { id: 'a0', role: 'assistant', parts: [{ type: 'reasoning', text: 'Old thinking.' }] },
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Next question' }] },
    { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Working on it' }] },
  ];
  const el = mountChat(messages, true);
  await flush();

  expect(reasoningTrigger(el)).toBeTruthy();
  expect(reasoningOpen(el)).toBe(false);

  el.remove();
});
