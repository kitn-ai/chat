import { test, expect, afterEach } from 'vitest';
import { render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { Switch } from '../../src/ui/switch';

afterEach(() => { document.body.innerHTML = ''; });

// Decision D-7: `Switch` grew pass-through props instead of every form widget stamping
// `id` / `data-control` / the aria trio onto its button through a ref. The shape chosen
// is a rest-props spread — the same shape `Input`, `Textarea` and `Button` already use,
// and the same shape `Checkbox` and `Radio` now use. These pin the two halves of that
// decision: everything unowned is forwarded, and nothing owned can be overwritten.

test('Switch forwards id, data-* and the aria trio to the focusable button', () => {
  const { container } = render(() => (
    <Switch label="Notify" id="f-notify" data-control="" aria-required="true" aria-invalid="true" aria-describedby="d1 d2" />
  ));
  const btn = container.querySelector('[role="switch"]')!;
  expect(btn.id).toBe('f-notify');
  // `data-control` on the BUTTON is what makes `form.focusField()` land on something
  // focusable — the form focuses the single `[data-control]` inside a field.
  expect(btn.hasAttribute('data-control')).toBe(true);
  expect(btn.getAttribute('aria-required')).toBe('true');
  expect(btn.getAttribute('aria-invalid')).toBe('true');
  expect(btn.getAttribute('aria-describedby')).toBe('d1 d2');
});

test('Switch REMOVES a forwarded aria attribute when it goes undefined', () => {
  const [invalid, setInvalid] = createSignal<'true' | undefined>('true');
  const { container } = render(() => <Switch label="Notify" aria-invalid={invalid()} />);
  const btn = container.querySelector('[role="switch"]')!;
  expect(btn.getAttribute('aria-invalid')).toBe('true');
  setInvalid(undefined);
  expect(btn.hasAttribute('aria-invalid')).toBe(false);
});

test('Switch keeps ownership of what makes it a switch', () => {
  // A spread placed after the control's own attributes would let a caller turn the
  // switch into something that is no longer one. `{...rest}` goes first for exactly
  // this reason, so these five stay ours.
  const { container } = render(() => (
    <Switch label="Notify" checked {...({ role: 'button', type: 'submit', 'aria-checked': 'false' } as Record<string, string>)} />
  ));
  const btn = container.querySelector('button')!;
  expect(btn.getAttribute('role')).toBe('switch');
  expect(btn.getAttribute('type')).toBe('button');
  expect(btn.getAttribute('aria-checked')).toBe('true');
});

test('Switch still hands the button back through buttonRef', () => {
  let seen: HTMLElement | undefined;
  const { container } = render(() => <Switch label="Notify" buttonRef={(el) => { seen = el; }} />);
  expect(seen).toBe(container.querySelector('[role="switch"]'));
});
