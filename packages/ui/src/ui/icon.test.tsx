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
import { describe, it, expect, afterEach, vi } from 'vitest';
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

  it('the docs generator extracts the IDENTICAL roster (P-8: derived, never a copy)', async () => {
    // gen-web-components-md.mjs cannot import this Solid module, so it derives
    // the roster TEXTUALLY from the same NAMED_ICONS map. This parity pin is
    // what keeps that extraction honest: a map refactor that the regex stops
    // matching (or half-matches) fails here by name, not as a silently thinner
    // docs section.
    // Imported by runtime file URL (not a literal specifier): the src tsconfig
    // has no allowJs, so a literal import of the .mjs is a TS7016 — and in the
    // jsdom project import.meta.url is Vite's http URL, which Node's loader
    // refuses, so the path anchors on the vitest cwd (packages/ui) instead.
    const { pathToFileURL } = await import('node:url');
    const { resolve: resolvePath } = await import('node:path');
    const pkgRoot = process.cwd();
    const genUrl = pathToFileURL(resolvePath(pkgRoot, 'scripts/gen-web-components-md.mjs')).href;
    const { iconNames } = (await import(/* @vite-ignore */ genUrl)) as {
      iconNames: (root: string) => string[];
    };
    expect(iconNames(pkgRoot)).toEqual([...ICON_NAMES]);
  });
});

describe('unknown icon names fail loud in PROD (P-8, spike F-7)', () => {
  // The defect this pins: `icon="send"` (before `send` existed) painted the
  // literal word "send" in production, silently, because the unknown-name
  // guard was `import.meta.env.DEV`-only. The blocks-and-parts ruling (P-8,
  // 2026-08-31 spec): prod renders a visible fallback glyph AND says so on
  // the console. This test runs the PROD path by flipping the env flag, so
  // it was observed FAILING against the old DEV-only console.warn guard
  // before the fix landed (acceptance gate: watch it fail first).
  it('an icon-shaped unknown name paints a fallback glyph and console.errors, with DEV off', () => {
    const env = import.meta.env as { DEV: boolean };
    const wasDev = env.DEV;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      env.DEV = false;
      const { container } = render(() => <span>{renderIcon('definitely-not-a-registered-icon')}</span>);
      // Loud on the console, in prod.
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('definitely-not-a-registered-icon'));
      // Visible fallback glyph, never the raw text painted as if it were a label.
      expect(svgOf(container)).not.toBeNull();
      expect(container.textContent).not.toContain('definitely-not-a-registered-icon');
    } finally {
      env.DEV = wasDev;
      errorSpy.mockRestore();
    }
  });

  it('emoji and arbitrary text still pass through untouched (only icon-shaped names are guarded)', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { container } = render(() => <span>{renderIcon('🙂')}</span>);
      expect(container.textContent).toContain('🙂');
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
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
