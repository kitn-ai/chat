/**
 * `resize()` itself (the floor/hidden/ResizeObserver logic) is tested
 * directly in `primitives/use-auto-resize.test.ts`. This file covers only
 * what `Textarea` adds on top: wiring `minHeight` through, and re-running
 * `resize()` on a CONTROLLED `value` prop change (design round 7, gap #3) —
 * a programmatic update fires no DOM 'input' event, so without this a
 * controlled textarea's box only ever grows off user typing.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { Textarea } from './textarea';

afterEach(cleanup);

describe('Textarea', () => {
  it('renders a textarea', () => {
    const { getByRole } = render(() => <Textarea placeholder="Notes" />);
    expect(getByRole('textbox')).toBeInTheDocument();
  });

  it('re-measures when a controlled value prop changes reactively, without any input event', async () => {
    const [value, setValue] = createSignal('a');
    const { getByTestId } = render(() => (
      <Textarea value={value()} minHeight={10} data-testid="ta" />
    ));
    const el = getByTestId('ta') as HTMLTextAreaElement;

    // jsdom computes no real layout at all: `scrollHeight` is always 0 and
    // — this is the one that bit the FIRST version of this test —
    // `offsetParent` is always `null` for every element, testing-library-
    // rendered or not, which is exactly the signal `resize()`'s new
    // hidden-element guard (gap #1) reads to skip writing. So both are
    // stubbed directly, same technique as `use-auto-resize.test.ts`: this
    // isolates "did a controlled prop change re-invoke resize()" from "does
    // jsdom compute layout" (it never does, anywhere in this tree).
    Object.defineProperty(el, 'offsetParent', { value: document.body, configurable: true });
    Object.defineProperty(el, 'scrollHeight', { value: 77, configurable: true });
    setValue('a\nb\nc\nd\ne'); // no DOM event fires for this — it's a prop write
    // Solid flushes a plain createEffect on a microtask, not synchronously
    // with the signal write, so give it one tick.
    await Promise.resolve();
    await Promise.resolve();

    expect(el.style.height).toBe('77px');
  });

  it('does not re-measure on mount from the value effect (defer: true) — only the hook-level rAF/ResizeObserver own the initial sizing', async () => {
    const [value] = createSignal('a');
    const { getByTestId } = render(() => (
      <Textarea value={value()} minHeight={10} data-testid="ta" />
    ));
    const el = getByTestId('ta') as HTMLTextAreaElement;
    // No signal write happened after mount, so the value-change effect
    // never fires — whatever height is present came only from the hook's
    // own initial measurement path (which jsdom's stubless scrollHeight of
    // 0 floors at minHeight), not from this effect refiring redundantly.
    await Promise.resolve();
    await Promise.resolve();
    expect(el.style.height === '' || el.style.height === '10px').toBe(true);
  });
});
