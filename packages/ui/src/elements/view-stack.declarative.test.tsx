/**
 * Unit tests for the declarative `<kai-view>` reading half of
 * `<kai-view-stack>`.
 *
 * Strategy (the `conversation-list.declarative.test.tsx` pattern):
 * `defineWebComponent` registers a real Shadow-DOM custom element and is not
 * suitable for jsdom behavioral tests, so the element's pure helpers are
 * tested in isolation here; the navigation semantics themselves are pinned in
 * `src/components/view-stack.test.tsx` against the same `createViewStack`
 * core both the Solid component and the element facade run on.
 */
import { describe, it, expect } from 'vitest';
import { readViewEntry, isKaiViewElement } from './view-stack';

function makeView(attrs: Record<string, string>): Element {
  const el = document.createElement('kai-view');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

describe('readViewEntry', () => {
  it('reads the name attribute', () => {
    expect(readViewEntry(makeView({ name: 'home' })).name).toBe('home');
  });

  it('falls back to the host id when name is absent', () => {
    expect(readViewEntry(makeView({ id: 'messages' })).name).toBe('messages');
  });

  it('reads a bare tab-root attribute as a tab root', () => {
    expect(readViewEntry(makeView({ name: 'home', 'tab-root': '' })).tabRoot).toBe(true);
  });

  it('treats tab-root="false" as OFF (the flag() attribute policy)', () => {
    expect(readViewEntry(makeView({ name: 'home', 'tab-root': 'false' })).tabRoot).toBe(false);
  });

  it('defaults to a drill view when tab-root is absent', () => {
    expect(readViewEntry(makeView({ name: 'chat' })).tabRoot).toBe(false);
  });
});

// ─── F-5: the PROPERTY wins, because that is all a framework sets ────────────
// A component framework assigns a declared prop as a DOM property and never
// writes the attribute. Reading the attribute alone made every kai-view in the
// React form resolve to { name: '', tabRoot: false }, so nothing matched,
// nothing was hidden, and every view rendered stacked at once (blocks contract
// spike, F-5). kai-tab-bar already reads property-first; this is the same
// order, helper for helper.

function makeViewEl(): HTMLElement & { name?: string; tabRoot?: boolean } {
  return document.createElement('kai-view') as HTMLElement & { name?: string; tabRoot?: boolean };
}

describe('readViewEntry resolves the PROPERTY first', () => {
  it('prefers the name property over the attribute and the host id', () => {
    const el = makeViewEl();
    el.name = 'prop';
    el.setAttribute('name', 'attr');
    el.id = 'host';
    expect(readViewEntry(el).name).toBe('prop');
  });

  it('falls back to the name attribute, then the host id', () => {
    const el = makeViewEl();
    el.setAttribute('name', 'attr');
    el.id = 'host';
    expect(readViewEntry(el).name).toBe('attr');
    el.removeAttribute('name');
    expect(readViewEntry(el).name).toBe('host');
  });

  it('prefers the tabRoot property, which is all a JSX boolean sets', () => {
    const el = makeViewEl();
    el.tabRoot = true;
    expect(readViewEntry(el).tabRoot).toBe(true);

    // An explicit `false` property beats a bare attribute: the property is the
    // framework's answer and the attribute is the plain-HTML spelling, so a
    // host that says false means false.
    el.tabRoot = false;
    el.setAttribute('tab-root', '');
    expect(readViewEntry(el).tabRoot).toBe(false);
  });
});

describe('isKaiViewElement', () => {
  it('accepts kai-view and rejects other children', () => {
    expect(isKaiViewElement(makeView({ name: 'home' }))).toBe(true);
    expect(isKaiViewElement(document.createElement('div'))).toBe(false);
  });
});
