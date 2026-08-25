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
import { createSignal, flush } from 'solid-js';
import { render, cleanup } from '@solidjs/testing-library';
import { Input } from '../../src/ui/input';

afterEach(cleanup);

/** Type one character the way a browser does: mutate `.value`, then fire the
 *  `input` event the element's own handler listens for. */
function press(el: HTMLInputElement, ch: string) {
  el.value = el.value + ch;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  // V2-FLUSH: v2 stages ordinary writes and commits on the next microtask, so the
  // signal/DOM state a keystroke produced is committed here to keep the per-key
  // assertions (and the invalid-accessor re-run they guard) synchronous. This is
  // what makes the identity assertions non-vacuous under v2 — same recipe as the
  // spike's flushed copy of this file (Q-A).
  flush();
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
    flush(); // V2-FLUSH: commit the mount-time effects before reading the DOM

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
    flush(); // V2-FLUSH: the class/attribute writes are staged until the microtask

    // Same node, new attributes — the whole point of the fix.
    expect(container.querySelector('input')).toBe(el);
    expect(el.className).toContain('border-destructive');
    expect(el.getAttribute('aria-invalid')).toBe('true');
  });

  /**
   * TIER 2 (masked) — the same guarantee, now with a masker attached.
   *
   * This is the case the mask integration actually depends on: `createInputMask`
   * holds listeners, a formatted string, a raw string and an undo stack against
   * ONE `HTMLInputElement`. A re-render that builds a new node carries all of it
   * into the void, and the field would appear to "randomly stop masking" after a
   * state change — silently, because a fresh unmasked `<input>` still accepts
   * text.
   *
   * Same anti-vacuity discipline as above: every identity assertion is paired
   * with a proof the harness sees the re-render — here the formatted text
   * reaching the DOM per keystroke, and the invalid class flipping when the
   * value finally matches.
   */
  it('keeps the SAME node — and the mask — for every key of a masked edit', () => {
    const [value, setValue] = createSignal('');
    const { container } = render(() => (
      <Input
        label="Change ticket"
        format="@@@-####"
        caseMode="upper"
        // Reads the value on every render, exactly like `kai-form`'s `common()`.
        invalid={!/^CHG-[0-9]{4}$/.test(value())}
        onValueInput={setValue}
      />
    ));
    flush(); // V2-FLUSH: commit the mount-time mask attach before typing

    const first = container.querySelector('input') as HTMLInputElement;
    first.focus();
    expect(first.className).toContain('border-destructive');

    // The formatted text after each successive keystroke. The `-` appears when
    // the fourth character arrives, not before: with no guide the field shows
    // only up to the last typed character.
    const progression = ['C', 'CH', 'CHG', 'CHG-4', 'CHG-48', 'CHG-482', 'CHG-4821'];
    'CHG4821'.split('').forEach((ch, i) => {
      press(first, ch);
      const now = container.querySelector('input') as HTMLInputElement;
      expect(now).toBe(first); // identity
      expect(document.activeElement).toBe(first);
      expect(first.value).toBe(progression[i]); // observable: the MASK ran, on this node
    });

    // The mask's own state survived every re-render: the canonical value it
    // emitted is the formatted one (semantic `custom`, spec §4).
    expect(value()).toBe('CHG-4821');
    expect(first.value).toBe('CHG-4821');
    // …and the class really does flip, so the identity half above is evidence.
    expect(first.className).not.toContain('border-destructive');

    // One more key proves the listeners are still bound after the flip.
    press(first, '9');
    expect(container.querySelector('input')).toBe(first);
    expect(first.value).toBe('CHG-4821'); // full: the mask refused it
  });

  /**
   * The ONE legitimate node change in this widget: toggling a leading/trailing
   * affix swaps the cached `plainNode` for the cached `rowNode`. The mask must
   * be RE-ATTACHED there, explicitly — the new node's `ref` fires only the first
   * time it is built, so nothing else would notice the swap.
   */
  it('re-attaches the mask when an affix toggle swaps the node', () => {
    const [affix, setAffix] = createSignal(false);
    const [value, setValue] = createSignal('');
    const { container } = render(() => (
      <Input
        format="###-###-####"
        semantic="tel"
        leading={affix() ? <span>@</span> : undefined}
        onValueInput={setValue}
      />
    ));
    flush(); // V2-FLUSH: commit the mount-time mask attach before typing

    const plain = container.querySelector('input') as HTMLInputElement;
    expect(plain.getAttribute('part')).toBe('field input');
    for (const ch of '555') press(plain, ch);
    expect(plain.value).toBe('555');

    setAffix(true);
    flush(); // V2-FLUSH: the Show swap and the mask re-attach commit together (Q-C)

    const row = container.querySelector('input') as HTMLInputElement;
    expect(row).not.toBe(plain); // the sanctioned identity change
    expect(row.getAttribute('part')).toBe('input');
    // The value came with it…
    expect(row.value).toBe('555');
    // …and so did the mask: these keys are FORMATTED on the new node.
    for (const ch of '1234567') press(row, ch);
    expect(row.value).toBe('555-123-4567');
    expect(value()).toBe('5551234567'); // canonical: digits, per the semantic type
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
    flush(); // V2-FLUSH: commit the mount-time effects before reading the DOM

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
