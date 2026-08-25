/**
 * `Input` × the form-field format work (spec §7.2) — the WIDGET half.
 *
 * The format engine (`field-mask.ts`), the DOM masker (`input-mask.ts`) and the
 * semantic table (`field-semantics.ts`) each have their own suites. What is
 * pinned here is only what this widget adds on top of them:
 *
 *   1. absent `format` AND absent `semantic` = today's behavior, byte for byte
 *      (owner decision 1 / spec §1.1) — asserted as "not one of these
 *      attributes appears, and typing is untouched";
 *   2. `semantic` ALONE applies tier-1 attributes and NO mask;
 *   3. the mask is opt-in — `format="default"` is what resolves a semantic
 *      type's default format;
 *   4. a reactive `format`/`semantic` change RE-CONFIGURES the masker
 *      (`update()`) instead of rebuilding it, and a `format-change-clipped`
 *      report is NOT a user-input error, so it must not flip invalid styling;
 *   5. the masker is detached when the widget unmounts;
 *   6. `onValueInput`/`onValueChange` carry the CANONICAL value once a mask is
 *      active.
 *
 * Node identity across all of this lives next door in
 * `input-node-identity.test.tsx`, which owns that guarantee (K-D12a).
 *
 * jsdom limits, stated so no green here is read as more than it is: there is no
 * `beforeinput` from a real editing host, so every keystroke below travels the
 * masker's diff-reconciliation path; caret RENDERING and composition are
 * browser facts (task 6), not these tests'.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { createSignal, flush } from 'solid-js';
import { render, cleanup } from '@solidjs/testing-library';
import { Input } from '../../src/ui/input';

afterEach(cleanup);

function press(el: HTMLInputElement, ch: string) {
  el.value = el.value + ch;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function type(el: HTMLInputElement, text: string) {
  for (const ch of text) press(el, ch);
}

const SEMANTIC_ATTRS = ['inputmode', 'autocomplete', 'spellcheck', 'autocorrect', 'autocapitalize'];

describe('Input — tier 1 semantics attributes', () => {
  it('sets NONE of them, and does not mask, when neither format nor semantic is given', () => {
    const onValueInput = vi.fn();
    const { container } = render(() => <Input onValueInput={onValueInput} />);
    const el = container.querySelector('input') as HTMLInputElement;

    for (const attr of SEMANTIC_ATTRS) expect(el.getAttribute(attr)).toBeNull();

    type(el, '5551234567');
    expect(el.value).toBe('5551234567'); // untouched
    expect(onValueInput).toHaveBeenLastCalledWith('5551234567');
  });

  it('applies the tier-1 bag for a semantic type — and applies NO mask on its own', () => {
    const { container } = render(() => <Input semantic="tel" />);
    const el = container.querySelector('input') as HTMLInputElement;

    expect(el.getAttribute('inputmode')).toBe('tel');
    expect(el.getAttribute('autocomplete')).toBe('tel');
    expect(el.getAttribute('spellcheck')).toBe('false');
    expect(el.getAttribute('autocorrect')).toBe('off');
    expect(el.getAttribute('autocapitalize')).toBe('off');

    // Decision 1: a bare semantic type never starts masking.
    type(el, '5551234567');
    expect(el.value).toBe('5551234567');
  });

  it('uses ssn / credit-card bags too, and lets an explicit prop win', () => {
    const { container } = render(() => (
      <>
        <Input semantic="ssn" />
        <Input semantic="credit-card" />
        <Input semantic="tel" inputmode="numeric" autocomplete="off" />
      </>
    ));
    const [ssn, cc, overridden] = Array.from(container.querySelectorAll('input'));

    expect(ssn!.getAttribute('inputmode')).toBe('numeric');
    expect(ssn!.getAttribute('autocomplete')).toBe('off');
    expect(cc!.getAttribute('inputmode')).toBe('numeric');
    expect(cc!.getAttribute('autocomplete')).toBe('cc-number');

    // The semantic type supplies a DEFAULT; it does not overrule the consumer.
    expect(overridden!.getAttribute('inputmode')).toBe('numeric');
    expect(overridden!.getAttribute('autocomplete')).toBe('off');
  });

  it('`custom` inherits: no inputmode, no autocomplete, but still no spellcheck', () => {
    const { container } = render(() => <Input semantic="custom" />);
    const el = container.querySelector('input') as HTMLInputElement;
    expect(el.getAttribute('inputmode')).toBeNull();
    expect(el.getAttribute('autocomplete')).toBeNull();
    expect(el.getAttribute('spellcheck')).toBe('false');
  });
});

describe('Input — opting into a mask', () => {
  it('masks on an explicit format', () => {
    const { container } = render(() => <Input format="###-##-####" semantic="ssn" />);
    const el = container.querySelector('input') as HTMLInputElement;
    type(el, '123456789');
    expect(el.value).toBe('123-45-6789');
  });

  it('format="default" resolves the semantic type\'s default format', () => {
    const { container } = render(() => <Input format="default" semantic="credit-card" />);
    const el = container.querySelector('input') as HTMLInputElement;
    type(el, '4242424242424242');
    expect(el.value).toBe('4242 4242 4242 4242');
  });

  it('format="default" without a default format warns and stays unmasked', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(() => <Input format="default" semantic="custom" />);
    const el = container.querySelector('input') as HTMLInputElement;
    type(el, 'abc');
    expect(el.value).toBe('abc');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a format that does not compile warns and leaves a plain text field', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(() => <Input format={'#'.repeat(200)} />);
    const el = container.querySelector('input') as HTMLInputElement;
    type(el, 'abc');
    expect(el.value).toBe('abc');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a REACTIVE format that does not compile leaves the mask untouched and usable', () => {
    // The other half of the compile-failure story. Attach-time failure is pinned above;
    // this is the `update()` path, where the atomicity of the masker is what keeps a
    // half-typed or model-supplied pattern from destroying a field the user is in.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const [format, setFormat] = createSignal('###-###-####');
    const onValueInput = vi.fn();
    const { container } = render(() => (
      <Input format={format()} semantic="tel" onValueInput={onValueInput} />
    ));
    const el = container.querySelector('input') as HTMLInputElement;
    type(el, '555123');
    expect(el.value).toBe('555-123');

    // V2-FLUSH: writes stage until the microtask; flush() commits the reconfigure
    // here so the warn/atomicity assertions below stay synchronous.
    expect(() => { setFormat('#'.repeat(500)); flush(); }).not.toThrow();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(container.querySelector('input')).toBe(el);
    expect(el.value).toBe('555-123'); // the value survived
    // Still masking, under the PREVIOUS format — not unmasked, not rebuilt.
    type(el, '4567');
    expect(el.value).toBe('555-123-4567');
    expect(onValueInput).toHaveBeenLastCalledWith('5551234567');
    warn.mockRestore();
  });

  it('reports one bad format once, clipped — not on every reconfigure', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const [caseMode, setCaseMode] = createSignal<'preserve' | 'upper'>('preserve');
    const huge = '#'.repeat(500);
    render(() => <Input format={huge} caseMode={caseMode()} />);

    // Reconfigure repeatedly with the same bad format still in place.
    setCaseMode('upper');
    flush(); // V2-FLUSH: commit each reconfigure separately, as v1 ran them
    setCaseMode('preserve');
    flush(); // V2-FLUSH

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0] ?? '');
    expect(message).not.toContain(huge); // the whole pattern is NOT interpolated
    expect(message).toContain('(500 chars)');
    expect(message.length).toBeLessThan(200);
    warn.mockRestore();
  });

  it('a guide renders the unfilled positions', () => {
    const { container } = render(() => <Input format="###-###-####" guide="   -   -    " />);
    const el = container.querySelector('input') as HTMLInputElement;
    type(el, '555');
    expect(el.value).toBe('555-   -    ');
  });
});

describe('Input — canonical value out', () => {
  it('onValueInput and onValueChange both carry the canonical value', () => {
    const onValueInput = vi.fn();
    const onValueChange = vi.fn();
    const { container } = render(() => (
      <Input format="default" semantic="tel" onValueInput={onValueInput} onValueChange={onValueChange} />
    ));
    const el = container.querySelector('input') as HTMLInputElement;

    type(el, '5551234567');
    expect(el.value).toBe('555-123-4567');
    expect(onValueInput).toHaveBeenLastCalledWith('5551234567');

    el.dispatchEvent(new Event('blur'));
    expect(onValueChange).toHaveBeenLastCalledWith('5551234567');
  });

  it('emits it ONCE per keystroke, not once per listener', () => {
    const onValueInput = vi.fn();
    const { container } = render(() => <Input format="@@@-####" onValueInput={onValueInput} />);
    const el = container.querySelector('input') as HTMLInputElement;
    press(el, 'c');
    expect(onValueInput).toHaveBeenCalledTimes(1);
    expect(onValueInput).toHaveBeenLastCalledWith('c');
  });
});

describe('Input — reactive re-configuration', () => {
  it('a format change re-fits the value on the SAME node and reports the clip', () => {
    const [format, setFormat] = createSignal('###-###-####');
    const onMaskReject = vi.fn();
    const { container } = render(() => (
      <Input format={format()} semantic="tel" onMaskReject={onMaskReject} />
    ));
    const el = container.querySelector('input') as HTMLInputElement;
    type(el, '5551234567');
    expect(el.value).toBe('555-123-4567');

    setFormat('###-####');
    flush(); // V2-FLUSH: commit the staged reconfigure before asserting

    expect(container.querySelector('input')).toBe(el); // re-configured, not rebuilt
    expect(el.value).toBe('555-1234');
    expect(onMaskReject).toHaveBeenCalledWith({ reason: 'format-change-clipped', data: '555-123-4567' });

    // A format change is NOT a user-input error: the widget must not dress it up
    // as one. `invalid` is the consumer's prop and nothing else may set it.
    expect(el.getAttribute('aria-invalid')).toBeNull();
    expect(el.className).not.toContain('border-destructive');
  });

  it('a semantic change re-configures the canonical form without rebuilding', () => {
    const [semantic, setSemantic] = createSignal<'tel' | 'custom'>('tel');
    const onValueInput = vi.fn();
    const { container } = render(() => (
      <Input format="###-###-####" semantic={semantic()} onValueInput={onValueInput} />
    ));
    const el = container.querySelector('input') as HTMLInputElement;
    type(el, '5551234567');
    expect(onValueInput).toHaveBeenLastCalledWith('5551234567');

    setSemantic('custom');
    flush(); // V2-FLUSH: commit the staged reconfigure before asserting
    expect(container.querySelector('input')).toBe(el);
    expect(el.value).toBe('555-123-4567');

    press(el, '9'); // full — refused, so drive a real edit instead
    el.value = '555-123-456';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onValueInput).toHaveBeenLastCalledWith('555-123-456');
  });

  it('dropping the format detaches the mask and leaves a plain field', () => {
    const [format, setFormat] = createSignal<string | undefined>('###-###-####');
    const { container } = render(() => <Input format={format()} semantic="tel" />);
    const el = container.querySelector('input') as HTMLInputElement;
    type(el, '555');
    expect(el.value).toBe('555');

    setFormat(undefined);
    flush(); // V2-FLUSH: commit the staged detach before asserting
    expect(container.querySelector('input')).toBe(el);

    // Unmasked from here: the literal goes in untouched.
    type(el, 'xx');
    expect(el.value).toBe('555xx');
    // …and the tier-1 attributes stay, because `semantic` is still set.
    expect(el.getAttribute('inputmode')).toBe('tel');
  });
});

describe('Input — teardown', () => {
  it('detaches the masker when the widget unmounts', () => {
    const onValueInput = vi.fn();
    const { container, unmount } = render(() => (
      <Input format="###-###-####" semantic="tel" onValueInput={onValueInput} />
    ));
    const el = container.querySelector('input') as HTMLInputElement;
    type(el, '555');
    expect(el.value).toBe('555');
    onValueInput.mockClear();

    unmount();

    // The node still exists in this test's hand. A masker that outlived its
    // widget would reformat this and call back into a disposed owner.
    press(el, '1');
    expect(el.value).toBe('5551');
    expect(onValueInput).not.toHaveBeenCalled();
  });
});
