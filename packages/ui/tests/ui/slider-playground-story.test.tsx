/**
 * GUARD — the Storybook Slider Playground is genuinely INTERACTIVE.
 *
 * WHAT WENT WRONG, AND WHY A NORMAL TEST WOULD NOT HAVE SEEN IT. The Playground
 * rendered `<Slider {...args} />`. `args` carries a `value`, which makes the component
 * CONTROLLED, and a spread alone gives it no writer — so dragging could never move the
 * controlled value. The native thumb still slid (the browser moves it) while the fill,
 * derived from `value`, stayed put. The owner reported it as "the track thumb does not
 * move with the circle".
 *
 * IT WAS NOT AN ARGS-REACTIVITY BUG, which is the tempting diagnosis. `storybook-
 * solidjs-vite`'s v1 entry replaces `context.args` with a `createStore` proxy
 * (`makeContextReactive`), and a spread carries that proxy through `mergeProps`
 * untouched. Verified live in Chromium: emitting `updateStoryArgs` moved BOTH the DOM
 * value and the fill, on the same DOM node, with no remount. The component re-derives a
 * controlled `value` correctly. The story simply never wrote one back.
 *
 * HARNESS, STATED BECAUSE IT MATTERS. This drives the REAL exported story `render`
 * through `createComponent` with a real Solid STORE for args — the shape the Storybook
 * renderer uses — rather than through `@solidjs/testing-library`'s `render`. A prior
 * agent found that `render` can track where the Storybook renderer does not, which
 * would mask exactly this class of bug. `createStore` here is not decoration: it is
 * what makes the "Controls panel still drives it" assertion mean anything.
 *
 * jsdom does no layout, so this asserts the fill CUSTOM PROPERTY and the DOM value, not
 * pixels. The pixel version was confirmed by hand in Chromium.
 */
import { test, expect, afterEach } from 'vitest';
import { type Component, type JSX, createComponent, createRoot } from 'solid-js';
import { createStore } from 'solid-js/store';
import sliderMeta from '../../src/ui/slider.stories';
import selectMeta from '../../src/ui/select.stories';

afterEach(() => { document.body.innerHTML = ''; });

const fillOf = (el: Element): string | null =>
  (el as HTMLElement).style.getPropertyValue('--kai-range-fill') || null;

/** Mount a story's `render` the way the Solid Storybook renderer does. */
function mountStory<T extends object>(meta: { args?: T; render?: (args: T, ctx?: unknown) => JSX.Element }) {
  const [args, setArgs] = createStore({ ...(meta.args as T) });
  let dispose!: () => void;
  const node = createRoot((d) => {
    dispose = d;
    // `createComponent(fn, props)` calls `fn(props)`, which is exactly the shape
    // Storybook uses to invoke a story's `render(args)`.
    return createComponent(meta.render as Component<T>, args) as unknown as HTMLElement;
  });
  document.body.appendChild(node);
  return { args, setArgs, dispose };
}

test('Slider Playground: dragging moves the value AND the fill', async () => {
  mountStory(sliderMeta as never);
  const el = document.body.querySelector('input[type=range]') as HTMLInputElement;
  const before = fillOf(el);
  expect(before).toBe('40%');

  el.value = '85';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await Promise.resolve();

  // The entire defect is this second line. `expect(fillOf(el)).toBe('40%')` on a fresh
  // render passed the whole time the story was broken.
  expect(el.value).toBe('85');
  expect(fillOf(el)).toBe('85%');
  expect(fillOf(el)).not.toBe(before);
});

test('Slider Playground: the Controls panel still drives it', async () => {
  // The fix must not win interactivity by cutting the args off. Changing `value` the
  // way the Controls panel does has to move the slider too.
  const { setArgs } = mountStory(sliderMeta as never);
  const el = document.body.querySelector('input[type=range]') as HTMLInputElement;

  setArgs('value' as never, 12 as never);
  await Promise.resolve();
  expect(el.value).toBe('12');
  expect(fillOf(el)).toBe('12%');

  // And a drag after an args change still works, i.e. the two writers coexist.
  el.value = '90';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await Promise.resolve();
  expect(fillOf(el)).toBe('90%');
});

// NO BEHAVIOURAL GUARD FOR "the Select Playground writes its choice back", and that is
// a deliberate, reported gap rather than an oversight.
//
// Two attempts at one were mutation-tested and BOTH stayed green against the broken
// `<Select {...args} />`. The reason is not a weak assertion, it is that there is
// nothing to observe. A slider has a second, derived view of its value -- the fill --
// so a stale state shows up as a visible disagreement. A `<select>` has none: after
// `el.value = 'haiku'` the DOM reads 'haiku' whether or not the story wrote it back,
// and the next render does not re-apply `selected` (that binding only re-runs when the
// value it reads changes), so nothing ever snaps back.
//
// Which also means the Select Playground was never VISIBLY broken the way the Slider
// one was. Its writer was added for consistency with the slider, whose identical shape
// IS guarded above. Do not add a test here that asserts `el.value` right after a change
// event: it passes on the broken story and is worse than no test at all.

test('Select Playground: the Controls panel still drives it', async () => {
  const { setArgs } = mountStory(selectMeta as never);
  const el = document.body.querySelector('select') as HTMLSelectElement;
  setArgs('value' as never, 'opus' as never);
  await Promise.resolve();
  expect(el.value).toBe('opus');
});
