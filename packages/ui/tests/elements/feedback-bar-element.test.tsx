import { flush as flushSync } from 'solid-js';
import '../../src/elements/feedback-bar';

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.querySelectorAll('kai-feedback-bar').forEach((e) => e.remove());
});

test('kai-feedback-bar registers', () => {
  expect(customElements.get('kai-feedback-bar')).toBeTruthy();
});

test('clicking thumbs-up emits feedback event with value "helpful"', async () => {
  const el = document.createElement('kai-feedback-bar') as HTMLElement;
  el.setAttribute('bar-title', 'Was this helpful?');
  document.body.appendChild(el);
  await flush();

  let detail: { value: string } | null = null;
  el.addEventListener('kai-feedback', (e) => (detail = (e as CustomEvent).detail));

  const thumbsUp = el.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Helpful"]');
  expect(thumbsUp).not.toBeNull();
  thumbsUp!.click();
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting

  expect(detail).not.toBeNull();
  expect(detail!.value).toBe('helpful');
});

test('clicking thumbs-down emits feedback event with value "not-helpful"', async () => {
  const el = document.createElement('kai-feedback-bar') as HTMLElement;
  el.setAttribute('bar-title', 'Was this helpful?');
  document.body.appendChild(el);
  await flush();

  let detail: { value: string } | null = null;
  el.addEventListener('kai-feedback', (e) => (detail = (e as CustomEvent).detail));

  const thumbsDown = el.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Not helpful"]');
  expect(thumbsDown).not.toBeNull();
  thumbsDown!.click();
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting

  expect(detail).not.toBeNull();
  expect(detail!.value).toBe('not-helpful');
});

test('clicking close emits close event (unchanged)', async () => {
  const el = document.createElement('kai-feedback-bar') as HTMLElement;
  document.body.appendChild(el);
  await flush();

  let closed = false;
  el.addEventListener('kai-close', () => (closed = true));

  const closeBtn = el.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
  expect(closeBtn).not.toBeNull();
  closeBtn!.click();
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting

  expect(closed).toBe(true);
});

test('old helpful event is no longer emitted (breaking change)', async () => {
  const el = document.createElement('kai-feedback-bar') as HTMLElement;
  document.body.appendChild(el);
  await flush();

  let helpfulFired = false;
  el.addEventListener('helpful', () => (helpfulFired = true));

  const thumbsUp = el.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Helpful"]');
  thumbsUp!.click();
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting

  expect(helpfulFired).toBe(false);
});

test('old nothelpful event is no longer emitted (breaking change)', async () => {
  const el = document.createElement('kai-feedback-bar') as HTMLElement;
  document.body.appendChild(el);
  await flush();

  let nothelpfulFired = false;
  el.addEventListener('nothelpful', () => (nothelpfulFired = true));

  const thumbsDown = el.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Not helpful"]');
  thumbsDown!.click();
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting

  expect(nothelpfulFired).toBe(false);
});
