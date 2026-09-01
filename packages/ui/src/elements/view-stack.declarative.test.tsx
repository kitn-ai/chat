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

describe('isKaiViewElement', () => {
  it('accepts kai-view and rejects other children', () => {
    expect(isKaiViewElement(makeView({ name: 'home' }))).toBe(true);
    expect(isKaiViewElement(document.createElement('div'))).toBe(false);
  });
});
