/**
 * THE ICON CONTRACT — the curated set resolves, and a name CHANGE re-renders.
 *
 * Two distinct defects live here, and only the second one is subtle:
 *
 * 1. A name in the curated list that does not resolve paints nothing. The
 *    fallback in `renderIcon` is deliberately silent for non-identifier strings
 *    (emoji, text), so an unregistered name is an EMPTY BOX, not an error. The
 *    sweep below walks `ICON_NAMES` — derived from `NAMED_ICONS`, never a copy —
 *    so a name can never be listed without a glyph behind it.
 *
 * 2. `renderIcon` is a plain function, not a component: it reads `icon` once,
 *    eagerly. That is fine, because every correct call site puts the call inside
 *    JSX, where dom-expressions wraps it in a tracked `insert`. A call site that
 *    returns the result DIRECTLY — as the Icon Playground story did — snapshots
 *    the name and never updates. In Storybook that reads as "the control does
 *    nothing until you reload the story"; in a consumer app it is a device
 *    switcher or a theme toggle whose icon never changes.
 *
 * WHY THESE ARE NOT VACUOUS. The story assertion below is paired with a direct
 * `renderIcon`-in-JSX assertion over the same query and the same two names, so
 * the "it updated" claim is only meaningful because the harness demonstrably
 * observes an update at all. The story is driven through `createComponent`, not
 * a bare `render(() => …)`, because that is what the Solid Storybook renderer
 * does (`chunk-P43SJLUM.js`: `createComponent(Story, {})`) — and `createComponent`
 * runs the story body UNTRACKED. Drive it with `render(() => meta.render(args))`
 * instead and the broken story passes, because Solid's own `render` tracks.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { JSX } from 'solid-js';
import { createSignal, createComponent } from 'solid-js';
import { createStore } from 'solid-js/store';
import { render, cleanup } from '@solidjs/testing-library';
import { renderIcon, ICON_NAMES } from './icon';
import iconMeta from './icon.stories';

afterEach(cleanup);

const svgOf = (c: HTMLElement) => c.querySelector('svg');
/** Identity of the painted glyph: lucide's geometry, not its wrapper attrs. */
const glyph = (c: HTMLElement) => svgOf(c)?.innerHTML ?? '';

describe('curated icon set', () => {
  it('every name in ICON_NAMES paints a real SVG (no empty boxes)', () => {
    expect(ICON_NAMES.length).toBeGreaterThan(0);
    const empty: string[] = [];
    for (const name of ICON_NAMES) {
      const { container } = render(() => <span>{renderIcon(name, { class: 'size-4' })}</span>);
      if (!svgOf(container) || !glyph(container).trim()) empty.push(name);
      cleanup();
    }
    expect(empty).toEqual([]);
  });

  it('exposes the device cluster the docs and app shells need', () => {
    // Reported gap: a host building a viewport switcher found no tablet/phone
    // glyph, and did not find the desktop one because lucide calls it `monitor`.
    for (const name of ['desktop', 'monitor', 'laptop', 'tablet', 'smartphone', 'mobile']) {
      expect(ICON_NAMES).toContain(name);
    }
  });

  it('is the SAME list the map holds — ICON_NAMES is derived, not restated', () => {
    // A duplicate hand-written list is how the Playground control went stale.
    expect([...ICON_NAMES]).toEqual([...ICON_NAMES].sort());
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });
});

describe('icon reactivity', () => {
  it('renderIcon inside JSX repaints when the name changes', () => {
    const [name, setName] = createSignal('sun');
    const { container } = render(() => <span>{renderIcon(name(), { class: 'size-4' })}</span>);
    const before = glyph(container);
    expect(before).not.toBe('');
    setName('moon');
    expect(glyph(container)).not.toBe(before);
  });

  it('the Icon Playground story tracks its args (no story reload needed)', () => {
    // Mirrors the Solid Storybook renderer: args is a store, the story body runs
    // once inside createComponent (untracked), and only tracked inserts update.
    const [args, setArgs] = createStore({ name: 'sun', size: 'md' as const });
    const Story = () => (iconMeta.render as (a: typeof args) => JSX.Element)(args);
    const { container } = render(() => createComponent(Story, {}));
    const before = glyph(container);
    expect(before).not.toBe('');
    setArgs('name', 'moon');
    expect(glyph(container)).not.toBe(before);
  });
});
