/**
 * `<kai-thinking-bar>` — the animated "thinking" indicator with an optional
 * "answer now" stop affordance.
 *
 * WHY THIS FILE EXISTS. Until it, kai-thinking-bar was on the coverage guard's
 * punch list as `kind: 'nothing'` — no test, no element story, no mention in any
 * test file. It is a reasoning-surface element: the thing a consumer shows while
 * the model thinks, and the `kai-stop` event is the consumer's ONE hook for
 * letting a user cut a long reasoning phase short. Nothing had ever asserted the
 * label renders, the affordance appears, or the event fires.
 *
 * CONVENTIONS FOLLOWED (tool.test.tsx, #296's backfill): assertions run against
 * the real registered element; every negative assertion is paired with a positive
 * over the SAME harness; both consumer spellings are driven — markup attributes
 * AND JS properties, in both orders where the ordering has ever mattered.
 */
import { afterEach, describe, expect, test } from 'vitest';
import '../../src/elements/thinking-bar';

/** Past a macrotask — attribute reflection lands a task after the Solid effect. */
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.replaceChildren();
});

type Bar = HTMLElement & {
  text?: string;
  stoppable?: boolean;
  stopLabel?: string;
};

async function mount(setup?: (el: Bar) => void): Promise<Bar> {
  const el = document.createElement('kai-thinking-bar') as Bar;
  setup?.(el);
  document.body.appendChild(el);
  await flush();
  return el;
}

const shadow = (el: Bar) => el.shadowRoot!;
/** The stop affordance — the only <button> the element ever renders when not clickable. */
const stopButton = (el: Bar) =>
  [...shadow(el).querySelectorAll('button')].find((b) => !b.querySelector('svg')) ?? null;

describe('the label', () => {
  test('renders the default "Thinking" label', async () => {
    const el = await mount();
    expect(shadow(el).textContent).toContain('Thinking');
  });

  test('the `text` ATTRIBUTE drives the label', async () => {
    document.body.innerHTML = '<kai-thinking-bar text="Reasoning about your request"></kai-thinking-bar>';
    const el = document.querySelector('kai-thinking-bar') as Bar;
    await flush();
    expect(shadow(el).textContent).toContain('Reasoning about your request');
    expect(shadow(el).textContent).not.toContain('Thinking');
  });

  test('the `text` PROPERTY drives the label, and updates re-render the SAME element', async () => {
    const el = await mount((e) => { e.text = 'Planning'; });
    expect(shadow(el).textContent).toContain('Planning');

    el.text = 'Searching the docs';
    await flush();
    expect(shadow(el).textContent).toContain('Searching the docs');
    expect(shadow(el).textContent, 'the old label must be gone, not merely joined').not.toContain('Planning');
  });
});

describe('the stop affordance', () => {
  test('absent by default; the SAME element grows one when `stoppable` is set', async () => {
    // Paired over one harness so "no button" cannot pass against an element that
    // never renders anything.
    const el = await mount();
    expect(stopButton(el)).toBeNull();

    el.stoppable = true;
    await flush();
    expect(stopButton(el)).not.toBeNull();
    expect(stopButton(el)!.textContent).toContain('Answer now');
  });

  test('<kai-thinking-bar stoppable> in markup renders the affordance', async () => {
    document.body.innerHTML = '<kai-thinking-bar stoppable></kai-thinking-bar>';
    const el = document.querySelector('kai-thinking-bar') as Bar;
    await flush();
    const btn = stopButton(el);
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('type')).toBe('button');
  });

  test('`stop-label` (attribute) and `stopLabel` (property) both relabel it', async () => {
    document.body.innerHTML = '<kai-thinking-bar stoppable stop-label="Skip ahead"></kai-thinking-bar>';
    const el = document.querySelector('kai-thinking-bar') as Bar;
    await flush();
    expect(stopButton(el)!.textContent).toContain('Skip ahead');

    el.stopLabel = 'Stop thinking';
    await flush();
    expect(stopButton(el)!.textContent).toContain('Stop thinking');
    expect(stopButton(el)!.textContent).not.toContain('Skip ahead');
  });

  test('setAttribute("stoppable", "") at RUNTIME grows the affordance too', async () => {
    // The kai-tool `disabled` class (its FIX1): flag() reads the reactive prop and
    // falls back to a NON-reactive hasAttribute. The ADD direction works here only
    // by luck of the parse: '' parses to `undefined`, which differs from the default
    // `false`, so the prop change re-renders and the hasAttribute fallback is
    // consulted while the attribute happens to be present.
    const el = await mount();
    expect(stopButton(el)).toBeNull();

    el.setAttribute('stoppable', '');
    await flush();
    expect(stopButton(el), 'a bare attribute added after mount must take effect').not.toBeNull();
  });

  test('removeAttribute("stoppable") removes the affordance', async () => {
    // The other direction of the row above. This was a shipped defect — the exact
    // class kai-tool's `disabled` had before its fix: removeAttribute parses to
    // `undefined`, the prop was ALREADY `undefined` after the bare-attribute add,
    // so no prop change fired, nothing re-ran, and `flag()`'s non-reactive
    // hasAttribute fallback was never re-read — the stop affordance stayed
    // rendered forever. Fixed by `reflectFlag('stoppable')` in thinking-bar.tsx
    // (the tool.tsx pattern); this test began life as a `test.fails` probe and is
    // now the guard.
    const el = await mount();
    el.setAttribute('stoppable', '');
    await flush();
    expect(stopButton(el)).not.toBeNull();

    el.removeAttribute('stoppable');
    await flush();
    expect(stopButton(el), 'a removed attribute must take effect like a removed prop').toBeNull();
  });
});

describe('kai-stop', () => {
  test('clicking the affordance fires it', async () => {
    const el = await mount((e) => { e.stoppable = true; });
    let count = 0;
    el.addEventListener('kai-stop', () => { count += 1; });

    stopButton(el)!.click();
    await flush();
    expect(count).toBe(1);

    stopButton(el)!.click();
    await flush();
    expect(count, 'one event per click, not a latched state').toBe(2);
  });

  test('is a non-bubbling, non-composed CustomEvent, like every other kai-* event', async () => {
    const el = await mount((e) => { e.stoppable = true; });
    let event: Event | undefined;
    el.addEventListener('kai-stop', (e) => { event = e; });
    stopButton(el)!.click();
    await flush();

    expect(event).toBeInstanceOf(CustomEvent);
    expect(event!.bubbles).toBe(false);
    expect(event!.composed).toBe(false);
  });

  test('never fires on mount or from label churn — only the click path', async () => {
    const el = await mount((e) => { e.stoppable = true; });
    const seen: Event[] = [];
    el.addEventListener('kai-stop', (e) => seen.push(e));

    el.text = 'Still thinking';
    await flush();
    expect(seen).toEqual([]);

    // Paired: the same listener still hears a real click.
    stopButton(el)!.click();
    await flush();
    expect(seen.length).toBe(1);
  });
});
