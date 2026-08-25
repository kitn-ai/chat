import { flush } from 'solid-js';
import '../../src/elements/nav';
import type { KaiNavItem } from '../../src/ui/nav';

// kai-nav per-item trailing action / close button.
//
// ★ The critical regression: SolidJS delegates `click` to `document`, so a naive
// `stopPropagation()` on a trailing button would NOT stop the row's select handler
// (a separate document-/row-level listener) — the row would still select. The nav
// must instead discriminate the trailing-button click INSIDE its single row
// handler (event.target.closest('[data-nav-action]')) and return before selecting.
// The headline assertion below is therefore "no kai-nav-select fired".

type NavEl = HTMLElement & { items: KaiNavItem[]; value?: string };

function mountNav(items: KaiNavItem[]): NavEl {
  const el = document.createElement('kai-nav') as NavEl;
  el.items = items;
  document.body.appendChild(el);
  return el;
}

test('closable item: the trailing close button fires kai-nav-item-close and NOT kai-nav-select', async () => {
  const el = mountNav([{ id: 'a', label: 'Alpha', closable: true }]);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  let closed: string | undefined;
  let selectFired = false;
  el.addEventListener('kai-nav-item-close', (e) => (closed = (e as CustomEvent).detail.value));
  el.addEventListener('kai-nav-select', () => (selectFired = true));

  const closeBtn = el.shadowRoot!.querySelector<HTMLButtonElement>('[data-nav-action="close"]');
  expect(closeBtn).not.toBeNull();
  closeBtn!.click();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  expect(closed).toBe('a');
  // ★ Headline assertion: clicking the trailing button must NOT select the row.
  expect(selectFired).toBe(false);

  el.remove();
});

test('action item: the trailing action button fires kai-nav-item-action with {value, action} and NOT kai-nav-select', async () => {
  const action = { icon: 'pencil', label: 'Rename' };
  const el = mountNav([{ id: 'b', label: 'Beta', action }]);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  let detail: { value: string; action?: typeof action } | undefined;
  let selectFired = false;
  el.addEventListener('kai-nav-item-action', (e) => (detail = (e as CustomEvent).detail));
  el.addEventListener('kai-nav-select', () => (selectFired = true));

  const actionBtn = el.shadowRoot!.querySelector<HTMLButtonElement>('[data-nav-action="action"]');
  expect(actionBtn).not.toBeNull();
  actionBtn!.click();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  expect(detail).toEqual({ value: 'b', action });
  expect(selectFired).toBe(false);

  el.remove();
});

test('clicking the item body still fires kai-nav-select (unchanged) and not a trailing event', async () => {
  // Item carries BOTH trailing buttons, to prove a body click discriminates even
  // when trailing buttons are present.
  const el = mountNav([
    { id: 'c', label: 'Gamma', closable: true, action: { icon: 'pencil', label: 'Rename' } },
  ]);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  let selected: string | undefined;
  let trailingFired = false;
  el.addEventListener('kai-nav-select', (e) => (selected = (e as CustomEvent).detail.id));
  el.addEventListener('kai-nav-item-close', () => (trailingFired = true));
  el.addEventListener('kai-nav-item-action', () => (trailingFired = true));

  // Click the row button itself (the body), not a trailing action button.
  const row = el.shadowRoot!.querySelector<HTMLButtonElement>('[part="item"]');
  expect(row).not.toBeNull();
  row!.click();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting

  expect(selected).toBe('c');
  expect(trailingFired).toBe(false);

  el.remove();
});

test('the trailing button is exposed as ::part(item-action)', async () => {
  const el = mountNav([{ id: 'd', label: 'Delta', closable: true }]);
  await Promise.resolve();
  flush(); // V2-FLUSH: v2 stages writes; commit before asserting
  expect(el.shadowRoot!.querySelector('[part="item-action"]')).not.toBeNull();
  el.remove();
});
