import { test, expect, afterEach } from 'vitest';
import { render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { RatingWidget, SwitchWidget, type WidgetProps } from '../../src/components/form-widgets';
import { Switch } from '../../src/ui/switch';

afterEach(() => { document.body.innerHTML = ''; });

function widgetProps(over: Partial<WidgetProps> = {}): WidgetProps {
  return {
    id: 'f-x',
    value: undefined,
    field: { type: 'integer' },
    disabled: false,
    required: false,
    invalid: false,
    label: 'How was it?',
    onInput: () => {},
    onBlur: () => {},
    ...over,
  } as WidgetProps;
}

function key(el: Element, k: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

// ---------------------------------------------------------------- RatingWidget

test('RatingWidget: arrowing moves DOM FOCUS onto the star that is now checked', () => {
  // The bug: the group was the only tab stop (`tabindex={0}`, radios at `-1`), so
  // arrows changed the value while focus stayed on the group. A screen reader
  // announced the radiogroup, never "3 stars, selected", and the ring sat on the row.
  // This drives real keydowns and asserts where focus ACTUALLY is — not an attribute.
  // A real signal, so the widget re-renders: a plain `let` is not reactive and the
  // assertions below on `aria-checked` / `tabIndex` would read a stale first render.
  const [value, setValue] = createSignal(0);
  const { container } = render(() => (
    <RatingWidget {...widgetProps({ get value() { return value(); }, onInput: (v) => setValue(v as number) })} />
  ));
  const stars = () => [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  expect(stars().length).toBe(5);

  // The group is not a tab stop any more; exactly one radio is.
  const group = container.querySelector('[role="radiogroup"]')!;
  expect(group.hasAttribute('tabindex')).toBe(false);
  expect(stars().filter((s) => s.tabIndex === 0).length).toBe(1);

  const first = stars()[0];
  first.focus();
  expect(document.activeElement).toBe(first);

  key(first, 'ArrowRight');
  expect(value()).toBe(1);
  expect(document.activeElement).toBe(stars()[0]);
  expect(stars()[0].getAttribute('aria-checked')).toBe('true');

  key(document.activeElement!, 'ArrowRight');
  key(document.activeElement!, 'ArrowRight');
  expect(value()).toBe(3);
  // Focus followed the value to the third star, and that star is the checked one.
  expect(document.activeElement).toBe(stars()[2]);
  expect(stars()[2].getAttribute('aria-checked')).toBe('true');
  // ...and it is the sole tab stop, which is what roving tabindex means.
  expect(stars().filter((s) => s.tabIndex === 0)).toEqual([stars()[2]]);

  key(document.activeElement!, 'ArrowLeft');
  expect(value()).toBe(2);
  expect(document.activeElement).toBe(stars()[1]);

  key(document.activeElement!, 'End');
  expect(document.activeElement).toBe(stars()[4]);
  key(document.activeElement!, 'Home');
  expect(document.activeElement).toBe(stars()[0]);
});

test('RatingWidget: the focused star is the one that carries the focus ring class', () => {
  // jsdom does no layout, so this pins WHERE the ring class lives rather than that it
  // paints: on the radio (which is now focusable), not on the group (which is not).
  const { container } = render(() => <RatingWidget {...widgetProps({ value: 2 })} />);
  const group = container.querySelector('[role="radiogroup"]')!;
  expect(group.className).not.toMatch(/focus-visible:ring/);
  for (const s of container.querySelectorAll('[role="radio"]')) {
    expect(s.className).toMatch(/focus-visible:ring-2/);
  }
});

test('RatingWidget: form.focusField() still reaches a real radio', () => {
  // `form.tsx:744` focuses the single `[data-control]` inside the field. It used to be
  // the group; the group is no longer focusable, so it has to have moved to a radio.
  const { container } = render(() => <RatingWidget {...widgetProps({ value: 3 })} />);
  const controls = [...container.querySelectorAll('[data-control]')];
  expect(controls.length).toBe(1);
  expect(controls[0].getAttribute('role')).toBe('radio');
  (controls[0] as HTMLElement).focus();
  expect(document.activeElement).toBe(controls[0]);
  // It rides the roving tab stop — the same star Tab would reach.
  expect((controls[0] as HTMLElement).tabIndex).toBe(0);
});

// ---------------------------------------------------------------- SwitchWidget

/** Render `Switch` standalone and hand back its `role="switch"` button. */
function primitiveSwitch(checked: boolean): HTMLElement {
  const { container } = render(() => <Switch checked={checked} label="x" />);
  return container.querySelector('[role="switch"]')! as HTMLElement;
}

test('SwitchWidget IS the Switch primitive — same rendered control, both states', () => {
  // Two consequences of the old inline copy, both measured in the audit: the form's
  // switch was 44x24 (`h-6 w-11`) where `<kai-switch>` is 36x20 (`h-5 w-9`), and its
  // thumb used `bg-background` where `ui/switch.tsx:80` documents needing
  // `bg-primary-foreground` because a hard-coded light thumb vanishes in dark mode.
  // jsdom has no layout so it cannot measure 36x20; comparing the rendered class
  // strings against the primitive's own output pins both facts without a magic number.
  for (const on of [false, true]) {
    const { container } = render(() => <SwitchWidget {...widgetProps({ value: on })} />);
    const mine = container.querySelector('[role="switch"]')! as HTMLElement;
    const theirs = primitiveSwitch(on);
    expect(mine.className).toBe(theirs.className);
    expect(mine.firstElementChild!.className).toBe(theirs.firstElementChild!.className);
    // The dark-mode thumb bug, stated directly as well as by equality.
    expect(mine.firstElementChild!.className).not.toMatch(/\bbg-background\b/);
    document.body.innerHTML = '';
  }
});

test('SwitchWidget keeps the form-only hooks — now real Switch props (D-7)', () => {
  const { container } = render(() => (
    <SwitchWidget {...widgetProps({ value: true, required: true, invalid: true, describedBy: 'd1 d2' })} />
  ));
  const btn = container.querySelector('[role="switch"]')! as HTMLElement;
  expect(btn.id).toBe('f-x');
  expect(btn.hasAttribute('data-control')).toBe(true);
  expect(btn.getAttribute('aria-label')).toBe('How was it?');
  expect(btn.getAttribute('aria-checked')).toBe('true');
  expect(btn.getAttribute('aria-required')).toBe('true');
  expect(btn.getAttribute('aria-invalid')).toBe('true');
  expect(btn.getAttribute('aria-describedby')).toBe('d1 d2');
});

test('SwitchWidget REMOVES aria-required/invalid/describedby when they turn false', () => {
  // These used to be stamped imperatively through `buttonRef` + a createEffect; D-7
  // made them ordinary props that `Switch` forwards to its button. Either way the
  // removal path is the one that breaks silently — a binding that wrote `false`
  // instead of removing leaves `aria-invalid="false"`, which reads as invalid. Drive
  // real signals so the reactive path runs and the removal is exercised, not just the set.
  const [required, setRequired] = createSignal(true);
  const [invalid, setInvalid] = createSignal(true);
  const [describedBy, setDescribedBy] = createSignal<string | undefined>('d1');
  const { container } = render(() => (
    <SwitchWidget
      {...widgetProps({
        value: false,
        get required() { return required(); },
        get invalid() { return invalid(); },
        get describedBy() { return describedBy(); },
      })}
    />
  ));
  const btn = container.querySelector('[role="switch"]')!;
  expect(btn.getAttribute('aria-required')).toBe('true');
  expect(btn.getAttribute('aria-invalid')).toBe('true');
  expect(btn.getAttribute('aria-describedby')).toBe('d1');

  setRequired(false);
  setInvalid(false);
  setDescribedBy(undefined);
  expect(btn.hasAttribute('aria-required')).toBe(false);
  expect(btn.hasAttribute('aria-invalid')).toBe(false);
  expect(btn.hasAttribute('aria-describedby')).toBe(false);
});

test('SwitchWidget toggling reports the next value and blurs the field', () => {
  const seen: unknown[] = [];
  let blurs = 0;
  const { container } = render(() => (
    <SwitchWidget {...widgetProps({ value: false, onInput: (v) => seen.push(v), onBlur: () => { blurs += 1; } })} />
  ));
  const btn = container.querySelector('[role="switch"]')! as HTMLElement;
  btn.click();
  expect(seen).toEqual([true]);
  expect(blurs).toBe(1);
});

test('SwitchWidget respects disabled', () => {
  const seen: unknown[] = [];
  const { container } = render(() => (
    <SwitchWidget {...widgetProps({ value: false, disabled: true, onInput: (v) => seen.push(v) })} />
  ));
  const btn = container.querySelector('[role="switch"]')! as HTMLButtonElement;
  expect(btn.disabled).toBe(true);
  btn.click();
  expect(seen).toEqual([]);
});
