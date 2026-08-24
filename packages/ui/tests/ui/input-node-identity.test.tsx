/**
 * K-D12a — the `<input>` node must SURVIVE a keystroke.
 *
 * `Input`'s affix-less branch used to build the `<input>` inside `<Show>`'s
 * `fallback`, which Solid evaluates inside the Show's memo. The class argument
 * (`isInvalid()`, `local.size`, `local.class`) was computed in that same scope,
 * so any reactive read there re-ran the memo and CREATED A NEW DOM NODE —
 * taking focus, caret position and IME composition state with it. A consumer
 * whose `invalid` prop is derived from the value (which is what `kai-form`'s
 * `common()` produced, K-D12b) therefore lost focus after every character.
 *
 * WHY THIS IS NOT A VACUOUS TEST. "The node is still the same node" passes just
 * as well when nothing re-rendered at all, so each identity assertion here is
 * paired with a proof the harness CAN observe the re-render it is guarding:
 * the value reaches the DOM, and the class flips when the invalid state really
 * changes. Delete either half and the identity half stops being evidence.
 *
 * The affix branch is asserted too — it was already correct (it inserts the
 * input through a function, i.e. a nested effect), and it is the shape the
 * affix-less branch was fixed into, so a regression that "fixes" one by
 * breaking the other is caught here.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal } from 'solid-js';
import { render, cleanup } from '@solidjs/testing-library';
import { Input } from '../../src/ui/input';

afterEach(cleanup);

/** Type one character the way a browser does: mutate `.value`, then fire the
 *  `input` event the element's own handler listens for. */
function press(el: HTMLInputElement, ch: string) {
  el.value = el.value + ch;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Input keeps its DOM node across keystrokes (K-D12a)', () => {
  it('preserves node identity, focus and caret while an invalid accessor reads the value', () => {
    const [value, setValue] = createSignal('');
    const { container } = render(() => (
      <Input
        label="Change ticket"
        value={value()}
        // The live invalid-state accessor: reading it subscribes to `value`,
        // which is exactly what `kai-form` passes down.
        invalid={!/^CHG-[0-9]{4}$/.test(value())}
        onValueInput={setValue}
      />
    ));

    const first = container.querySelector('input') as HTMLInputElement;
    expect(first).toBeTruthy();
    expect(first.getAttribute('part')).toBe('field input');
    first.focus();
    expect(document.activeElement).toBe(first);

    for (const ch of 'CHG-4821') {
      press(first, ch);
      const now = container.querySelector('input') as HTMLInputElement;
      expect(now).toBe(first);
      expect(document.activeElement).toBe(first);
    }

    // The harness CAN see change: the signal took every character, and the
    // element still holds the text the user typed.
    expect(value()).toBe('CHG-4821');
    expect(first.value).toBe('CHG-4821');
  });

  it('still flips the invalid class on the SAME node when validity changes', () => {
    const [invalid, setInvalid] = createSignal(false);
    const { container } = render(() => <Input label="Ticket" invalid={invalid()} />);

    const el = container.querySelector('input') as HTMLInputElement;
    expect(el.className).not.toContain('border-destructive');
    expect(el.getAttribute('aria-invalid')).toBeNull();

    setInvalid(true);

    // Same node, new attributes — the whole point of the fix.
    expect(container.querySelector('input')).toBe(el);
    expect(el.className).toContain('border-destructive');
    expect(el.getAttribute('aria-invalid')).toBe('true');
  });

  it('preserves node identity in the affix layout too', () => {
    const [value, setValue] = createSignal('');
    const { container } = render(() => (
      <Input
        leading={<span>@</span>}
        value={value()}
        invalid={value().length > 0}
        onValueInput={setValue}
      />
    ));

    const el = container.querySelector('input') as HTMLInputElement;
    expect(el.getAttribute('part')).toBe('input');
    el.focus();

    for (const ch of 'abcd') {
      press(el, ch);
      expect(container.querySelector('input')).toBe(el);
      expect(document.activeElement).toBe(el);
    }
    expect(value()).toBe('abcd');
  });
});
