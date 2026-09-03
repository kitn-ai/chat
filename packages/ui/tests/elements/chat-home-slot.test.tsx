/**
 * P-6 region slots on `<kai-chat>` (blocks-and-parts, 2026-08-31): the
 * home-tab content is a replaceable region. Projecting light-DOM
 * `slot="home"` content stands it in for the built-in home screen; removing
 * it restores the default, so an absent slot changes nothing.
 */
import '../../src/elements/chat';
import { CHAT_SLOTS } from '../../src/elements/slots';

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

test('the home slot is registered in CHAT_SLOTS as a replace region', () => {
  const def = CHAT_SLOTS.find((s) => s.name === 'home');
  expect(def).toBeTruthy();
  expect(def!.mode).toBe('replace');
});

test('slot="home" content replaces the built-in home screen; removing it restores the default', async () => {
  const el = document.createElement('kai-chat') as HTMLElement & { home?: unknown; messages?: unknown[] };
  el.home = { greeting: { title: 'Hey' } };
  el.messages = [];
  const custom = document.createElement('div');
  custom.setAttribute('slot', 'home');
  custom.textContent = 'My own home';
  el.appendChild(custom);
  document.body.appendChild(el);
  await flush();

  // Replaced: the slot renders, the built-in HomePanel does not; the tab bar
  // (navigation chrome) stays.
  expect(el.shadowRoot!.querySelector('slot[name="home"]')).toBeTruthy();
  expect(el.shadowRoot!.querySelector('[data-kai-home-panel]')).toBeNull();
  expect(el.shadowRoot!.querySelector('[role="tablist"]')).toBeTruthy();

  // Absent slot changes nothing: removing the projected node brings the
  // built-in home screen back (slot detection observes child mutations).
  custom.remove();
  await flush();
  expect(el.shadowRoot!.querySelector('slot[name="home"]')).toBeNull();
  expect(el.shadowRoot!.querySelector('[data-kai-home-panel]')).toBeTruthy();

  el.remove();
});

/**
 * A slotted child authored `hidden` and later un-hidden.
 *
 * `readSlots` reports a hidden assigned node as NOT filling its slot (an
 * invisible node fills no region), so the region it feeds is now a function of
 * an ATTRIBUTE as well as of the child list. An observer watching childList
 * alone never re-reads, and the region stays collapsed for good. This is the
 * shape the authored block contract produces every time: declarative markup
 * toggles visibility, where imperative markup added and removed the node.
 */
test('a slotted child that starts hidden brings its region back when un-hidden', async () => {
  const el = document.createElement('kai-chat') as HTMLElement & { messages?: unknown[] };
  el.messages = [];
  const nav = document.createElement('nav');
  nav.setAttribute('slot', 'sidebar');
  nav.hidden = true;
  nav.textContent = 'My conversations';
  el.appendChild(nav);
  document.body.appendChild(el);
  await flush();

  // Hidden on arrival: the region is not rendered, so nothing reserves space.
  expect(el.shadowRoot!.querySelector('slot[name="sidebar"]')).toBeNull();

  nav.hidden = false;
  await flush();
  expect(el.shadowRoot!.querySelector('slot[name="sidebar"]')).toBeTruthy();

  // And back again, so the read is live in both directions rather than a
  // one-way latch that happens to end up right.
  nav.hidden = true;
  await flush();
  expect(el.shadowRoot!.querySelector('slot[name="sidebar"]')).toBeNull();

  el.remove();
});
