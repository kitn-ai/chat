import '../../src/elements/chat';

if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

test('home is a property-only prop; setting it renders the home view + tab bar in the shadow root', async () => {
  const el = document.createElement('kai-chat') as HTMLElement & { home?: unknown; messages?: unknown[] };
  el.home = { greeting: { title: 'Hey' } };
  el.messages = [];
  document.body.appendChild(el);
  await flush();
  expect(el.shadowRoot!.querySelector('[data-kai-home-panel]')).toBeTruthy();
  expect(el.shadowRoot!.querySelector('[role="tablist"]')).toBeTruthy();
  expect(el.getAttribute('home')).toBeNull();

  el.remove();
});

test('an href-less home link tap dispatches kai-home-link with the entry, non-bubbling', async () => {
  const el = document.createElement('kai-chat') as HTMLElement & { home?: unknown; messages?: unknown[] };
  el.home = { links: [{ label: 'Talk to sales' }] };
  el.messages = [];
  document.body.appendChild(el);
  await flush();
  const seen: unknown[] = [];
  el.addEventListener('kai-home-link', (e) => seen.push((e as CustomEvent).detail));

  let bubbledToDocument = false;
  document.addEventListener('kai-home-link', () => { bubbledToDocument = true; }, { once: true });

  (el.shadowRoot!.querySelector('button[data-kai-home-link]') as HTMLElement).click();
  await flush();
  expect(seen).toEqual([{ entry: expect.objectContaining({ label: 'Talk to sales' }) }]);
  expect(bubbledToDocument).toBe(false);

  el.remove();
});

test('no home property → no tab bar (the no-home widget is unchanged)', async () => {
  const el = document.createElement('kai-chat') as HTMLElement & { messages?: unknown[] };
  el.messages = [];
  document.body.appendChild(el);
  await flush();
  expect(el.shadowRoot!.querySelector('[role="tablist"]')).toBeNull();

  el.remove();
});

// The `kai-` contract's own rule — object props are set as JS properties
// AFTER the element is appended/upgraded (the React wrapper assigns them in
// a post-mount `useLayoutEffect`) — so `props.home` is routinely still
// unset on this component's FIRST render. The view signal's initial value
// alone can't decide the home-landing view; ChatThread has to react to
// `home` turning on. This is the append-THEN-set ordering that catches the
// whole mount-frozen-prop class.
test('append THEN set home (React-wrapper ordering): the view still lands on home', async () => {
  const el = document.createElement('kai-chat') as HTMLElement & { home?: unknown; messages?: unknown[] };
  el.messages = [];
  document.body.appendChild(el);
  await flush();
  // Before `home` is set: today's chat-only widget, no tab bar.
  expect(el.shadowRoot!.querySelector('[role="tablist"]')).toBeNull();

  el.home = { greeting: { title: 'Hey' } };
  await flush();
  expect(el.shadowRoot!.querySelector('[data-kai-home-panel]')).toBeTruthy();
  expect(el.shadowRoot!.querySelector('[role="tablist"]')).toBeTruthy();

  el.remove();
});

test('clearing home while on the home view resets to chat (falling edge)', async () => {
  const el = document.createElement('kai-chat') as HTMLElement & { home?: unknown; messages?: unknown[] };
  el.home = { greeting: { title: 'Hey' } };
  el.messages = [];
  document.body.appendChild(el);
  await flush();
  expect(el.shadowRoot!.querySelector('[data-kai-home-panel]')).toBeTruthy();

  el.home = undefined;
  await flush();
  expect(el.shadowRoot!.querySelector('[data-kai-home-panel]')).toBeNull();
  expect(el.shadowRoot!.querySelector('[role="tablist"]')).toBeNull();
  expect(el.shadowRoot!.querySelector('textarea, [contenteditable]')).toBeTruthy();

  el.remove();
});
