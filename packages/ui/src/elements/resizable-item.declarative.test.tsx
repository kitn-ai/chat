/**
 * Unit tests for `reflectItemConfig` — the `<kai-resizable-item>` facade helper
 * that mirrors config props to the ATTRIBUTES the parent `<kai-resizable>` reads.
 *
 * Strategy (mirrors the other `*.declarative.test.tsx` files): the live Shadow-DOM
 * custom element isn't jsdom-friendly, so we drive the exported helper directly with
 * our own reactive props + a controllable `flag`, against a bare (unconnected)
 * element whose attributes we assert. An unconnected `kai-resizable-item` behaves
 * like a plain element — component-register's `attributeChangedCallback` no-ops
 * until `connectedCallback` runs — so `setAttribute` here has no hidden side effects.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, cleanup } from '@solidjs/testing-library';
import { createSignal, flush } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { reflectItemConfig } from './resizable';

afterEach(cleanup);

const tick = () => Promise.resolve();

function setup() {
  const el = document.createElement('kai-resizable-item') as HTMLElement;
  const [size, setSize] = createSignal<string | undefined>(undefined);
  const [min, setMin] = createSignal<string | undefined>(undefined);
  const [max, setMax] = createSignal<string | undefined>(undefined);
  const props = {
    get size() { return size(); },
    get min() { return min(); },
    get max() { return max(); },
  };
  function Harness(): JSX.Element {
    reflectItemConfig(el, props);
    return null as unknown as JSX.Element;
  }
  render(() => <Harness />);
  return { el, setSize, setMin, setMax };
}

describe('reflectItemConfig (property → attribute reflection)', () => {
  it('reflects size/min/max SET AS PROPERTIES to the matching attributes', async () => {
    const { el, setSize, setMin, setMax } = setup();
    expect(el.getAttribute('size')).toBeNull();

    setSize('280px');
    flush(); // V2-FLUSH: commit the staged write
    setMin('220px');
    flush(); // V2-FLUSH: commit the staged write
    setMax('420px');
    flush(); // V2-FLUSH: commit the staged write
    await tick();

    expect(el.getAttribute('size')).toBe('280px');
    expect(el.getAttribute('min')).toBe('220px');
    expect(el.getAttribute('max')).toBe('420px');
  });

  it('clears the attribute when the string prop goes back to undefined', async () => {
    const { el, setSize } = setup();
    setSize('280px');
    flush(); // V2-FLUSH: commit the staged write
    await tick();
    expect(el.getAttribute('size')).toBe('280px');

    setSize(undefined);
    flush(); // V2-FLUSH: commit the staged write
    await tick();
    expect(el.getAttribute('size')).toBeNull();
  });

  // `locked` USED to be reflected by this helper and was covered here. It moved to
  // `reflectFlag('locked')` in the facade body, because a boolean reflected with a
  // bare `toggleAttribute` reads back `undefined` and `reflectFlag` is the one place
  // that fixes both halves at once. Its coverage moved UP, not away, and got stronger:
  // `tests/elements/reflected-boolean-readback.test.tsx` drives `locked` on a real
  // mounted `<kai-resizable-item>` and asserts the attribute AND the property, which
  // this helper-level harness (an unconnected element, a stubbed `flag`) could not.

  it('does not stomp a dragged size when a re-render re-asserts the declared size', async () => {
    const { el, setSize } = setup();
    setSize('280px');
    flush(); // V2-FLUSH: commit the staged write
    await tick();
    expect(el.getAttribute('size')).toBe('280px');

    // Simulate the parent's persistSizes writing the live drag percent to the
    // attribute, and component-register back-propagating that into the prop signal.
    el.setAttribute('size', '35%');
    setSize('35%');
    flush(); // V2-FLUSH: commit the staged write
    await tick();
    expect(el.getAttribute('size')).toBe('35%');

    // A framework re-render re-asserts the ORIGINAL declared size prop every render.
    setSize('280px');
    flush(); // V2-FLUSH: commit the staged write
    await tick();
    // Durable: the dragged size is preserved, not reset to 280px.
    expect(el.getAttribute('size')).toBe('35%');
  });

  it('still applies an EXPLICIT consumer size change made after a drag', async () => {
    const { el, setSize } = setup();
    setSize('280px');
    flush(); // V2-FLUSH: commit the staged write
    await tick();

    // Drag → attribute + signal diverge to a live percent.
    el.setAttribute('size', '35%');
    setSize('35%');
    flush(); // V2-FLUSH: commit the staged write
    await tick();

    // Consumer genuinely changes the declared size.
    setSize('320px');
    flush(); // V2-FLUSH: commit the staged write
    await tick();
    expect(el.getAttribute('size')).toBe('320px');
  });
});
