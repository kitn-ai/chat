// tests/primitives/input-mask.test.ts
// The stateful DOM masker (spec 2026-08-24-form-field-formats-design.md, tier 2 / §5).
//
// WHAT THIS FILE CANNOT PROVE. jsdom has no layout, no caret, no compositor and no real
// input pipeline, so three things are synthesized here and are only *really* verified by
// the task-6 browser probes:
//   - `beforeinput` CANCELATION SEMANTICS. jsdom will happily construct a cancelable
//     `beforeinput`, but nothing in jsdom writes to `.value` as a consequence of one, so
//     "we called preventDefault and therefore the browser did not mutate the field" is
//     asserted here only as "preventDefault was called". Whether a given `inputType` is
//     cancelable in a real engine (it is not, for composition and several Android IMEs) is
//     exactly the fact §5.1's fallback exists for, and it is a browser fact.
//   - CARET RENDERING. `setSelectionRange` in jsdom is bookkeeping. That the caret is
//     *visibly* outside a literal run, that a pointer click lands where the user aimed, and
//     that `selectionchange` fires at all on an `<input>` are browser facts. Every
//     `selectionchange` in this file is dispatched by hand.
//   - COMPOSITION / IME. jsdom never composes. The composition tests here drive the state
//     machine through hand-built `compositionstart`/`compositionend` events and assert the
//     masker's *own* discipline (no cancel, no value write, no caret move in between). That
//     a real IME produces that sequence, and that not interfering keeps the composition
//     intact, is a browser fact.
//   - THE CLIPBOARD. jsdom implements neither `ClipboardEvent` nor `DataTransfer`, so every
//     copy/cut test runs against the smallest stand-in the handler touches (see
//     `clipboardEvent` below). That `preventDefault` + `setData` actually replaces the
//     system clipboard payload is a browser fact, and `copyPolicy: 'blocked'` in particular
//     deserves a real-browser check.
// Nothing below pretends otherwise: where a browser would supply the mutation, the test
// supplies it explicitly and says so.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MaskError } from '../../src/primitives/field-mask';
import { createInputMask, type InputMask, type InputMaskOptions } from '../../src/primitives/input-mask';

const BULLET = '•';

let attached: InputMask[] = [];

function mount(options: InputMaskOptions): { el: HTMLInputElement; mask: InputMask } {
  const el = document.createElement('input');
  document.body.append(el);
  const mask = createInputMask(el, options);
  attached.push(mask);
  return { el, mask };
}

/** Dispatch a `beforeinput`. Returns whether the masker canceled it. */
function beforeinput(
  el: HTMLInputElement,
  inputType: string,
  data: string | null = null,
  cancelable = true,
): boolean {
  const ev = new InputEvent('beforeinput', { inputType, data, cancelable, bubbles: true });
  return !el.dispatchEvent(ev);
}

/** The browser half of the diff-reconcile fallback: mutate the field, then say `input`. */
function browserWrote(el: HTMLInputElement, value: string, caret = value.length): void {
  el.value = value;
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function type(el: HTMLInputElement, text: string): void {
  for (const ch of text) beforeinput(el, 'insertText', ch);
}

function caret(el: HTMLInputElement, start: number, end = start): void {
  el.setSelectionRange(start, end);
}

function keydown(el: HTMLInputElement, init: KeyboardEventInit): boolean {
  return !el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}

/** jsdom implements neither `ClipboardEvent` nor `DataTransfer`; this is the smallest
 *  stand-in the handler actually touches. */
function clipboardEvent(kind: 'copy' | 'cut'): { ev: Event; read: () => string } {
  const store = new Map<string, string>();
  const ev = new Event(kind, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', {
    value: {
      setData: (format: string, value: string) => void store.set(format, value),
      getData: (format: string) => store.get(format) ?? '',
    },
  });
  return { ev, read: () => store.get('text/plain') ?? '' };
}

function selectionChange(el: HTMLInputElement): void {
  el.ownerDocument.dispatchEvent(new Event('selectionchange'));
}

beforeEach(() => {
  attached = [];
});

afterEach(() => {
  for (const mask of attached) mask.detach();
  document.body.innerHTML = '';
});

describe('attach and detach', () => {
  test('every listener added is removed again, and detach twice is a no-op', () => {
    const el = document.createElement('input');
    document.body.append(el);
    const elAdd = vi.spyOn(el, 'addEventListener');
    const elRemove = vi.spyOn(el, 'removeEventListener');
    const docAdd = vi.spyOn(document, 'addEventListener');
    const docRemove = vi.spyOn(document, 'removeEventListener');

    const mask = createInputMask(el, { format: '###-###-####' });
    expect(elAdd.mock.calls.length).toBeGreaterThan(0);
    expect(elRemove).not.toHaveBeenCalled();

    mask.detach();
    expect(elRemove.mock.calls.length).toBe(elAdd.mock.calls.length);
    expect(docRemove.mock.calls.length).toBe(docAdd.mock.calls.length);
    // The pairs are the same event types, not merely the same count.
    expect(elRemove.mock.calls.map((c) => c[0]).sort()).toEqual(
      elAdd.mock.calls.map((c) => c[0]).sort(),
    );

    mask.detach();
    expect(elRemove.mock.calls.length).toBe(elAdd.mock.calls.length);

    elAdd.mockRestore();
    elRemove.mockRestore();
    docAdd.mockRestore();
    docRemove.mockRestore();
  });

  test('a detached masker ignores every event it used to handle', () => {
    const { el, mask } = mount({ format: '###-###-####', initialValue: '555' });
    mask.detach();
    expect(beforeinput(el, 'insertText', '1')).toBe(false);
    browserWrote(el, 'garbage');
    expect(el.value).toBe('garbage');
  });

  test('seeds from initialValue, normalized through the mask', () => {
    const { el, mask } = mount({ format: '###-###-####', initialValue: '5551234567' });
    expect(el.value).toBe('555-123-4567');
    expect(mask.getRawValue()).toBe('5551234567');
  });

  test('seeds from the element value already present when initialValue is absent', () => {
    const el = document.createElement('input');
    el.value = 'chg4821';
    document.body.append(el);
    const mask = createInputMask(el, { format: '@@@-####', caseMode: 'upper' });
    attached.push(mask);
    expect(el.value).toBe('CHG-4821');
  });

  test('an empty field with a guide shows the guide; without one it shows nothing', () => {
    const withGuide = mount({ format: '##/##/####', guide: 'mm/dd/yyyy' });
    expect(withGuide.el.value).toBe('mm/dd/yyyy');
    const bare = mount({ format: '##/##/####' });
    expect(bare.el.value).toBe('');
  });
});

describe('typing through beforeinput', () => {
  test('a digit is accepted, formatted, and the literal comes with it', () => {
    const { el, mask } = mount({ format: '###-###-####' });
    type(el, '555');
    expect(el.value).toBe('555');
    type(el, '1');
    expect(el.value).toBe('555-1');
    expect(mask.getRawValue()).toBe('5551');
  });

  test('the caret is pulled past a literal run so the next character lands right', () => {
    const { el } = mount({ format: '###-###-####', guide: '   -   -    ' });
    type(el, '555');
    // raw 3 maps past the '-' to index 4, which is where the next digit goes.
    expect(el.value).toBe('555-   -    ');
    expect(el.selectionStart).toBe(4);
  });

  test('without a guide there is no text to sit in front of, so the caret ends at the end', () => {
    // Not a weaker version of the test above: with no guide the field shows only up to the
    // last typed character, so index 4 does not exist yet. The literal arrives with the
    // next digit (`555` -> `555-1`), and raw position 3 is still what gets typed into.
    const { el } = mount({ format: '###-###-####' });
    type(el, '555');
    expect(el.value).toBe('555');
    expect(el.selectionStart).toBe(3);
    type(el, '1');
    expect(el.value).toBe('555-1');
  });

  test('the caret never rests inside a leading literal run', () => {
    const { el } = mount({ format: 'V-***', guide: 'V-   ' });
    type(el, 'A');
    expect(el.value).toBe('V-A  ');
    expect(el.selectionStart).toBe(3);
  });

  test('case folds per caseMode', () => {
    const { el } = mount({ format: '@@@-####', caseMode: 'upper' });
    type(el, 'chg4821');
    expect(el.value).toBe('CHG-4821');
  });

  test('the interception cancels the event so the browser never writes', () => {
    const { el } = mount({ format: '###' });
    expect(beforeinput(el, 'insertText', '1')).toBe(true);
  });

  test('onInput reports the canonical and formatted values together', () => {
    const onInput = vi.fn();
    const { el } = mount({ format: '###-###-####', semantic: 'tel', onInput });
    type(el, '5551234567');
    expect(onInput).toHaveBeenLastCalledWith({ canonical: '5551234567', formatted: '555-123-4567' });
  });

  test('an inputType the masker does not own is left to the browser', () => {
    const { el } = mount({ format: '###' });
    expect(beforeinput(el, 'formatBold')).toBe(false);
  });
});

describe('rejection decides loudly (§5.3)', () => {
  test('a wrong-class character is refused, reported, and the text does not change', () => {
    const onReject = vi.fn();
    const { el } = mount({ format: '###-###-####', onReject });
    type(el, '55');
    const before = el.value;
    expect(beforeinput(el, 'insertText', 'x')).toBe(true);
    expect(el.value).toBe(before);
    expect(onReject).toHaveBeenCalledWith({ reason: 'wrong-class', data: 'x' });
  });

  test('a keystroke into a full field reports `full`', () => {
    const onReject = vi.fn();
    const { el } = mount({ format: '###', initialValue: '123', onReject });
    caret(el, 3);
    expect(beforeinput(el, 'insertText', '4')).toBe(true);
    expect(el.value).toBe('123');
    expect(onReject).toHaveBeenCalledWith({ reason: 'full', data: '4' });
  });

  test('a paste longer than the field reports `over-capacity` and keeps what fit', () => {
    const onReject = vi.fn();
    const { el } = mount({ format: '###-###-####', onReject });
    beforeinput(el, 'insertFromPaste', '55512345678901');
    expect(el.value).toBe('555-123-4567');
    expect(onReject).toHaveBeenCalledWith({ reason: 'over-capacity', data: '55512345678901' });
  });

  test('separators absorbed from a paste that DOES fit are not mistaken for over-capacity', () => {
    // The whole point of the probe-pattern check: `chg 4821` is 8 characters absorbed into
    // 7 fill positions, and nothing was lost.
    const onReject = vi.fn();
    const { el } = mount({ format: '@@@-####', caseMode: 'upper', onReject });
    beforeinput(el, 'insertFromPaste', 'chg 4821');
    expect(el.value).toBe('CHG-4821');
    expect(onReject).not.toHaveBeenCalled();
  });

  test('a rejected edit does not notify onInput', () => {
    const onInput = vi.fn();
    const { el } = mount({ format: '###', initialValue: '123', onInput });
    caret(el, 3);
    beforeinput(el, 'insertText', '4');
    expect(onInput).not.toHaveBeenCalled();
  });
});

describe('paste normalization is literal-aware (§5.7)', () => {
  test('pasting `V-123` under `V-***` keeps the literal as a literal', () => {
    const { el, mask } = mount({ format: 'V-***', guide: 'V-   ' });
    beforeinput(el, 'insertFromPaste', 'V-123');
    expect(el.value).toBe('V-123');
    expect(mask.getRawValue()).toBe('123');
  });

  test('every separator spelling of a ticket number normalizes the same way', () => {
    for (const pasted of ['chg4821', 'CHG 4821', 'chg-4821', 'CHG-4821']) {
      const { el } = mount({ format: '@@@-####', caseMode: 'upper' });
      beforeinput(el, 'insertFromPaste', pasted);
      expect(el.value).toBe('CHG-4821');
    }
  });

  test('a paste over a selection replaces exactly that range', () => {
    const { el, mask } = mount({ format: '@@@-####', caseMode: 'upper', initialValue: 'chg4821' });
    caret(el, 0, 3); // 'CHG'
    beforeinput(el, 'insertFromPaste', 'abc');
    expect(mask.getRawValue()).toBe('ABC4821');
    expect(el.value).toBe('ABC-4821');
  });

  test('an insertion in the middle shifts the rest along', () => {
    const { el, mask } = mount({ format: '#####', initialValue: '1234' });
    caret(el, 2);
    beforeinput(el, 'insertText', '9');
    expect(mask.getRawValue()).toBe('12934');
  });
});

describe('deletion', () => {
  test('backspace removes the previous fill character, not the literal in front of it', () => {
    const { el, mask } = mount({ format: '###-###-####', initialValue: '5551' });
    caret(el, 5);
    expect(beforeinput(el, 'deleteContentBackward')).toBe(true);
    expect(mask.getRawValue()).toBe('555');
    expect(el.value).toBe('555');
  });

  test('backspace with the caret just after a literal run still deletes a character', () => {
    const { el, mask } = mount({ format: '###-###-####', initialValue: '555' });
    caret(el, 4); // past the '-'
    beforeinput(el, 'deleteContentBackward');
    expect(mask.getRawValue()).toBe('55');
  });

  test('forward delete removes the character under the caret', () => {
    const { el, mask } = mount({ format: '#####', initialValue: '12345' });
    caret(el, 2);
    beforeinput(el, 'deleteContentForward');
    expect(mask.getRawValue()).toBe('1245');
  });

  test('deleting a selected range removes exactly that range', () => {
    const { el, mask } = mount({ format: '#####', initialValue: '12345' });
    caret(el, 1, 4);
    beforeinput(el, 'deleteContentBackward');
    expect(mask.getRawValue()).toBe('15');
  });

  test('backspace at the start changes nothing and notifies nobody', () => {
    const onInput = vi.fn();
    const { el, mask } = mount({ format: '#####', initialValue: '12345', onInput });
    caret(el, 0);
    beforeinput(el, 'deleteContentBackward');
    expect(mask.getRawValue()).toBe('12345');
    expect(onInput).not.toHaveBeenCalled();
  });

  test('a selection covering ONLY literals deletes nothing, in either direction', () => {
    // The DOM selection is real and non-empty; it just maps to an empty RAW range. Treating
    // that as a collapsed caret is how backspace ends up eating the digit in front of the
    // separator the user actually selected.
    const { el, mask } = mount({ format: '###-###-####', initialValue: '5551234567' });
    caret(el, 3, 4); // exactly the '-'
    beforeinput(el, 'deleteContentBackward');
    expect(mask.getRawValue()).toBe('5551234567');
    caret(el, 3, 4);
    beforeinput(el, 'deleteContentForward');
    expect(mask.getRawValue()).toBe('5551234567');
    expect(el.value).toBe('555-123-4567');
  });

  test('a multi-literal selection is a no-op too, and a leading one stays a no-op', () => {
    const inner = mount({ format: '###--###', initialValue: '123456' });
    caret(inner.el, 3, 5);
    beforeinput(inner.el, 'deleteContentBackward');
    expect(inner.mask.getRawValue()).toBe('123456');

    const leading = mount({ format: 'V-@@@', initialValue: 'abc' });
    caret(leading.el, 0, 2);
    beforeinput(leading.el, 'deleteContentBackward');
    expect(leading.mask.getRawValue()).toBe('abc');
  });

  test('a selection that covers a literal AND fill characters still deletes the fills', () => {
    const { el, mask } = mount({ format: '###-###-####', initialValue: '5551234567' });
    caret(el, 2, 5); // '5-1'
    beforeinput(el, 'deleteContentBackward');
    expect(mask.getRawValue()).toBe('55234567');
  });

  test('a word/line delete clears the whole side of the caret', () => {
    const { el, mask } = mount({ format: '#####', initialValue: '12345' });
    caret(el, 3);
    beforeinput(el, 'deleteWordBackward');
    expect(mask.getRawValue()).toBe('45');
  });
});

describe('the diff-reconcile fallback in `input` (§5.1)', () => {
  test('an autofill the masker never saw is normalized on `input`', () => {
    // Synthesized: in a browser the autofill writes `.value` and fires `input` with a
    // non-cancelable (or absent) beforeinput. Here the test writes it.
    const { el, mask } = mount({ format: '###-###-####', semantic: 'tel' });
    browserWrote(el, '(555) 123-4567');
    expect(el.value).toBe('555-123-4567');
    expect(mask.getCanonicalValue()).toBe('5551234567');
  });

  test('a browser-side deletion is reconciled by diff', () => {
    const { el, mask } = mount({ format: '###-###-####', initialValue: '5551234567' });
    browserWrote(el, '555-123-456', 11);
    expect(mask.getRawValue()).toBe('555123456');
    expect(el.value).toBe('555-123-456');
  });

  test('a non-cancelable beforeinput is ignored and the `input` diff takes over', () => {
    const { el, mask } = mount({ format: '###-###-####' });
    expect(beforeinput(el, 'insertText', '5', false)).toBe(false);
    browserWrote(el, '5');
    expect(mask.getRawValue()).toBe('5');
  });

  test('an `input` whose value already matches the stored text is a no-op', () => {
    const onInput = vi.fn();
    const { el } = mount({ format: '###', initialValue: '12', onInput });
    onInput.mockClear();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onInput).not.toHaveBeenCalled();
  });

  test('a browser mutation the mask refuses is rolled back, loudly', () => {
    const onReject = vi.fn();
    const { el } = mount({ format: '###', initialValue: '123', onReject });
    browserWrote(el, '1234');
    expect(el.value).toBe('123');
    expect(onReject).toHaveBeenCalledWith({ reason: 'full', data: '4' });
  });
});

describe('composition (§5.2) -- state machine only; the IME half is task 6', () => {
  test('nothing is canceled, rewritten or re-caretted between start and end', () => {
    const { el } = mount({ format: '@@@-####', caseMode: 'upper' });
    const setSelection = vi.spyOn(el, 'setSelectionRange');

    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    setSelection.mockClear();

    // A real IME would produce these; jsdom cannot, so the test does.
    expect(beforeinput(el, 'insertCompositionText', 'c')).toBe(false);
    el.value = 'chg4821';
    el.dispatchEvent(new Event('input', { bubbles: true }));

    expect(el.value).toBe('chg4821'); // untouched mid-composition
    expect(setSelection).not.toHaveBeenCalled();
    setSelection.mockRestore();
  });

  test('reconciles exactly once, on compositionend', () => {
    const onInput = vi.fn();
    const { el, mask } = mount({ format: '@@@-####', caseMode: 'upper', onInput });
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    el.value = 'chg4821';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onInput).not.toHaveBeenCalled();

    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'chg4821' }));
    expect(el.value).toBe('CHG-4821');
    expect(mask.getRawValue()).toBe('CHG4821');
    expect(onInput).toHaveBeenCalledTimes(1);
  });

  test('the selection clamp stands down while a composition is active', () => {
    const { el } = mount({ format: 'V-***', guide: 'V-   ' });
    el.focus();
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    caret(el, 0);
    selectionChange(el);
    expect(el.selectionStart).toBe(0);
  });

  test('setValue during a composition is deferred to compositionend', () => {
    // The classic controlled-input IME bug: a framework re-render calls setValue while an
    // IME is composing, the field is rewritten under the composition, and the composition
    // dies. §5.2 forbids the masker's own writes mid-composition; a consumer write routed
    // through the masker is the masker's write too.
    const { el, mask } = mount({ format: '###-###-####' });
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    el.value = '99';
    const setSelection = vi.spyOn(el, 'setSelectionRange');

    mask.setValue('5551234567');
    expect(el.value).toBe('99');
    expect(setSelection).not.toHaveBeenCalled();

    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    expect(el.value).toBe('555-123-4567');
    expect(mask.getRawValue()).toBe('5551234567');
    setSelection.mockRestore();
  });

  test('update() during a composition defers its write too', () => {
    const { el, mask } = mount({ format: '###-###-####', initialValue: '5551234567' });
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    mask.update({ format: '### ### ####' });
    expect(el.value).toBe('555-123-4567');
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    expect(el.value).toBe('555 123 4567');
  });

  test('only the LATEST deferred write lands, and it beats the composed text', () => {
    const { el, mask } = mount({ format: '###-###-####' });
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    el.value = '111';
    mask.setValue('5551234567');
    mask.setValue('5559876543');
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    expect(el.value).toBe('555-987-6543');
  });

  test('detaching mid-composition drops the deferred write instead of firing it later', () => {
    const { el, mask } = mount({ format: '###-###-####' });
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    mask.setValue('5551234567');
    mask.detach();
    el.value = 'left alone';
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    expect(el.value).toBe('left alone');
  });

  test('a compositionend that changed nothing does not notify', () => {
    const onInput = vi.fn();
    const { el } = mount({ format: '@@@-####', initialValue: 'ABC1234', onInput });
    onInput.mockClear();
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    expect(onInput).not.toHaveBeenCalled();
  });
});

describe('undo and redo (§5.6)', () => {
  test('a typed run collapses into one undo entry', () => {
    const { el } = mount({ format: '###-###-####' });
    type(el, '555');
    expect(el.value).toBe('555');
    expect(keydown(el, { key: 'z', ctrlKey: true })).toBe(true);
    expect(el.value).toBe('');
  });

  test('a caret move breaks the run', () => {
    const { el } = mount({ format: '#####' });
    type(el, '12');
    keydown(el, { key: 'ArrowLeft' });
    caret(el, 2);
    type(el, '3');
    expect(el.value).toBe('123');
    keydown(el, { key: 'z', ctrlKey: true });
    expect(el.value).toBe('12');
    keydown(el, { key: 'z', ctrlKey: true });
    expect(el.value).toBe('');
  });

  test('a delete breaks the run', () => {
    const { el } = mount({ format: '#####' });
    type(el, '123');
    beforeinput(el, 'deleteContentBackward');
    expect(el.value).toBe('12');
    keydown(el, { key: 'z', ctrlKey: true });
    expect(el.value).toBe('123');
  });

  test('undo restores the selection the user had', () => {
    const { el } = mount({ format: '#####', initialValue: '12345' });
    caret(el, 1, 4);
    beforeinput(el, 'deleteContentBackward');
    expect(el.value).toBe('15');
    keydown(el, { key: 'z', ctrlKey: true });
    expect(el.value).toBe('12345');
    expect([el.selectionStart, el.selectionEnd]).toEqual([1, 4]);
  });

  test('Ctrl+Y and Ctrl+Shift+Z both redo; a new edit clears the redo stack', () => {
    const { el } = mount({ format: '#####' });
    type(el, '12');
    keydown(el, { key: 'z', ctrlKey: true });
    expect(el.value).toBe('');
    keydown(el, { key: 'y', ctrlKey: true });
    expect(el.value).toBe('12');

    keydown(el, { key: 'z', ctrlKey: true });
    keydown(el, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(el.value).toBe('12');

    keydown(el, { key: 'z', ctrlKey: true });
    type(el, '9');
    keydown(el, { key: 'y', ctrlKey: true });
    expect(el.value).toBe('9');
  });

  test('metaKey works too, and the shortcut is canceled so the native stack is not touched', () => {
    const { el } = mount({ format: '#####' });
    type(el, '12');
    expect(keydown(el, { key: 'z', metaKey: true })).toBe(true);
    expect(el.value).toBe('');
  });

  test('historyUndo arriving as a beforeinput routes to the same stack', () => {
    const { el } = mount({ format: '#####' });
    type(el, '12');
    expect(beforeinput(el, 'historyUndo')).toBe(true);
    expect(el.value).toBe('');
  });

  test('the stack is capped at 200 entries and drops from the bottom', () => {
    const { el } = mount({ format: '####' });
    const at = (n: number) => String(n).padStart(4, '0');
    for (let n = 1; n <= 250; n += 1) attached[0]!.setValue(at(n));
    expect(el.value).toBe(at(250));
    for (let i = 0; i < 200; i += 1) keydown(el, { key: 'z', ctrlKey: true });
    expect(el.value).toBe(at(50));
    keydown(el, { key: 'z', ctrlKey: true }); // nothing left
    expect(el.value).toBe(at(50));
  });

  test('undo on an untouched field does nothing', () => {
    const { el } = mount({ format: '#####', initialValue: '12' });
    keydown(el, { key: 'z', ctrlKey: true });
    expect(el.value).toBe('12');
  });
});

describe('selection clamp (§5.9) -- one handler, no timers', () => {
  test('a collapsed caret in the leading literal region is pulled to the first fill', () => {
    const { el } = mount({ format: 'V-***', guide: 'V-   ' });
    el.focus();
    caret(el, 0);
    selectionChange(el);
    expect(el.selectionStart).toBe(2);
  });

  test('a caret past the last typed character is pulled back', () => {
    const { el } = mount({ format: '##/##/####', guide: 'mm/dd/yyyy', initialValue: '12' });
    el.focus();
    caret(el, 9);
    selectionChange(el);
    expect(el.selectionStart).toBe(3);
  });

  test('a selection may not extend past the last typed character', () => {
    const { el } = mount({ format: '##/##/####', guide: 'mm/dd/yyyy', initialValue: '12' });
    el.focus();
    caret(el, 0, 10);
    selectionChange(el);
    expect([el.selectionStart, el.selectionEnd]).toEqual([0, 3]);
  });

  test('a valid caret is left alone -- the clamp is idempotent', () => {
    const { el } = mount({ format: 'V-***', guide: 'V-   ', initialValue: 'AB' });
    el.focus();
    caret(el, 4);
    const setSelection = vi.spyOn(el, 'setSelectionRange');
    selectionChange(el);
    selectionChange(el);
    expect(setSelection).not.toHaveBeenCalled();
    setSelection.mockRestore();
  });

  test('a selectionchange for some other focused element is ignored', () => {
    const other = document.createElement('input');
    document.body.append(other);
    const { el } = mount({ format: 'V-***', guide: 'V-   ' });
    caret(el, 0);
    other.focus();
    selectionChange(el);
    expect(el.selectionStart).toBe(0);
  });
});

describe('caret discipline: the [floor, frontier] window', () => {
  // The owner's bar, in three sentences: with a leading literal run the caret may never
  // rest left of the first fill position (the FLOOR); it may never rest right of one past
  // the last filled character (the FRONTIER); and arrows, Home, End, clicks and selections
  // all live inside that window. "I could only go back to the start of ####; the CHG- would
  // remain."
  const TICKET = { format: 'CHG-####', guide: 'CHG-    ' } as const;

  test('focus lands on the floor, not on index 0', () => {
    const { el } = mount({ ...TICKET });
    caret(el, 0); // whatever the field was left holding
    el.focus();
    expect(el.selectionStart).toBe(4);
    expect(el.selectionEnd).toBe(4);
  });

  test('focus on a filled field lands inside the window too', () => {
    const { el } = mount({ ...TICKET, initialValue: '4821' });
    caret(el, 1);
    el.focus();
    expect(el.selectionStart).toBe(4);
  });

  test('Home goes to the floor, not to 0', () => {
    const { el } = mount({ ...TICKET, initialValue: '4821' });
    el.focus();
    caret(el, 0); // what the browser does for Home
    selectionChange(el);
    expect(el.selectionStart).toBe(4);
  });

  test('a click inside the leading literal run snaps right to the floor', () => {
    const { el } = mount({ ...TICKET, initialValue: '4821' });
    el.focus();
    for (const clicked of [0, 1, 2, 3]) {
      caret(el, clicked);
      selectionChange(el);
      expect(el.selectionStart, `click at ${clicked}`).toBe(4);
    }
  });

  test('End goes to the frontier, not to the end of the format', () => {
    const { el } = mount({ ...TICKET, initialValue: '48' });
    expect(el.value).toBe('CHG-48  ');
    el.focus();
    caret(el, 8); // what the browser does for End
    selectionChange(el);
    expect(el.selectionStart).toBe(6);
  });

  test('a click into the unfilled guide tail snaps back to the frontier', () => {
    const { el } = mount({ format: '##/##/####', guide: 'mm/dd/yyyy', initialValue: '12234' });
    expect(el.value).toBe('12/23/4yyy');
    el.focus();
    for (const clicked of [8, 9, 10]) {
      caret(el, clicked);
      selectionChange(el);
      expect(el.selectionStart, `click at ${clicked}`).toBe(7); // 12/23/4|yyy
    }
  });

  test('a caret BETWEEN filled characters is legal and is left completely alone', () => {
    const { el } = mount({ ...TICKET, initialValue: '4821' });
    el.focus();
    caret(el, 6);
    const setSelection = vi.spyOn(el, 'setSelectionRange');
    selectionChange(el);
    expect(setSelection).not.toHaveBeenCalled();
    expect(el.selectionStart).toBe(6);
    setSelection.mockRestore();
  });

  test('ArrowLeft cannot walk out of the floor', () => {
    const { el } = mount({ ...TICKET, initialValue: '4821' });
    el.focus();
    caret(el, 4);
    caret(el, 3); // the browser moved it; the clamp is what puts it back
    selectionChange(el);
    expect(el.selectionStart).toBe(4);
  });

  test('a selection dragged into the leading literal run clamps its START to the floor', () => {
    const { el } = mount({ ...TICKET, initialValue: '4821' });
    el.focus();
    caret(el, 0, 6);
    selectionChange(el);
    expect([el.selectionStart, el.selectionEnd]).toEqual([4, 6]);
  });

  test('select-all on a guided field selects the editable window only', () => {
    const { el } = mount({ ...TICKET, initialValue: '48' });
    el.focus();
    caret(el, 0, 8); // Ctrl+A
    selectionChange(el);
    expect([el.selectionStart, el.selectionEnd]).toEqual([4, 6]);
  });

  test('select-all still copies the whole canonical value despite the clamp', () => {
    const { el } = mount({ ...TICKET, initialValue: '4821', semantic: 'custom' });
    el.focus();
    caret(el, 0, 8);
    selectionChange(el);
    const { ev, read } = clipboardEvent('copy');
    el.dispatchEvent(ev);
    expect(read()).toBe('CHG-4821');
  });

  test('deleting back past the literal run leaves the caret on the floor', () => {
    const { el, mask } = mount({ ...TICKET, initialValue: '4' });
    expect(el.value).toBe('CHG-4   ');
    caret(el, 5);
    beforeinput(el, 'deleteContentBackward');
    expect(mask.getRawValue()).toBe('');
    expect(el.value).toBe('CHG-    ');
    expect(el.selectionStart).toBe(4);
  });

  test('an unguided field is unaffected: the floor is wherever the text ends', () => {
    // Without a guide there is no rendered prefix to be trapped behind until a character
    // exists, so the floor collapses to 0 on an empty field. Nothing to clamp.
    const { el } = mount({ format: 'CHG-####' });
    expect(el.value).toBe('');
    caret(el, 0);
    el.focus();
    expect(el.selectionStart).toBe(0);
    selectionChange(el);
    expect(el.selectionStart).toBe(0);
  });

  test("a semantic type's default format gets the same discipline", () => {
    const { el } = mount({
      format: '###-###-####',
      guide: '   -   -    ',
      semantic: 'tel',
      initialValue: '555',
    });
    expect(el.value).toBe('555-   -    ');
    el.focus();
    caret(el, 0);
    selectionChange(el);
    expect(el.selectionStart, 'floor is 0 -- no leading literal run').toBe(0);
    caret(el, 11);
    selectionChange(el);
    expect(el.selectionStart, 'frontier is past the literal that follows raw 3').toBe(4);
  });

  // Every test above mounts into the flat document, where `document.activeElement` IS the
  // input -- and so did the browser IVP, which drives a Storybook story. That is the one
  // arrangement no `kai-*` element ships in: a real consumer's input sits inside at least
  // one shadow root, `document.activeElement` retargets to the outermost HOST, and the
  // whole clamp early-returned on a guard that asked the document instead of the field's
  // own root. It was dead in the ops-console app (two shadow roots deep) while green here
  // and green in Chromium. These two mount the same field through a shadow root so the
  // guard is exercised where it actually failed.
  function mountInShadow(options: InputMaskOptions): { el: HTMLInputElement; host: HTMLElement } {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    const el = document.createElement('input');
    root.append(el);
    attached.push(createInputMask(el, options));
    return { el, host };
  }

  test('the clamp holds for a field inside a shadow root (document.activeElement retargets)', () => {
    const { el } = mountInShadow({ ...TICKET, initialValue: '4821' });
    el.focus();
    expect(el.getRootNode(), 'precondition: the field really is in a shadow root').not.toBe(document);
    expect(
      document.activeElement,
      'precondition: the document reports the HOST, which is why the old guard failed',
    ).not.toBe(el);

    caret(el, 0); // Home, or a click into `CHG-`
    selectionChange(el);
    expect(el.selectionStart).toBe(4);
    expect(el.selectionEnd).toBe(4);
  });

  test('a shadow-hosted field still stands down when something else holds focus', () => {
    const other = document.createElement('input');
    document.body.append(other);
    const { el } = mountInShadow({ ...TICKET, initialValue: '4821' });
    other.focus();
    caret(el, 0);
    selectionChange(el);
    expect(el.selectionStart, 'not focused: nothing to clamp').toBe(0);
  });

  test('the clamp stands down when the field is not the focused element', () => {
    const other = document.createElement('input');
    document.body.append(other);
    const { el } = mount({ ...TICKET, initialValue: '4821' });
    other.focus();
    caret(el, 0);
    selectionChange(el);
    expect(el.selectionStart).toBe(0);
  });
});

describe('copy, cut and copyPolicy (§5.10)', () => {
  const tel = (extra: Partial<InputMaskOptions> = {}) =>
    mount({ format: '###-###-####', semantic: 'tel', initialValue: '5551234567', ...extra });

  test('the default policy puts the canonical value on the clipboard', () => {
    const { el } = tel();
    caret(el, 0, el.value.length);
    const { ev, read } = clipboardEvent('copy');
    el.dispatchEvent(ev);
    expect(read()).toBe('5551234567');
    expect(ev.defaultPrevented).toBe(true);
  });

  test('`formatted` copies what is on screen', () => {
    const { el } = tel({ copyPolicy: 'formatted' });
    caret(el, 0, el.value.length);
    const { ev, read } = clipboardEvent('copy');
    el.dispatchEvent(ev);
    expect(read()).toBe('555-123-4567');
  });

  test('`blocked` copies nothing at all', () => {
    const { el } = tel({ copyPolicy: 'blocked' });
    caret(el, 0, el.value.length);
    const { ev, read } = clipboardEvent('copy');
    el.dispatchEvent(ev);
    expect(read()).toBe('');
    expect(ev.defaultPrevented).toBe(true);
  });

  test('`obscured` bullets the obscurable positions and leaves the rest', () => {
    const { el } = mount({
      format: '**** ####',
      semantic: 'credit-card',
      initialValue: '12345678',
      copyPolicy: 'obscured',
    });
    caret(el, 0, el.value.length);
    const { ev, read } = clipboardEvent('copy');
    el.dispatchEvent(ev);
    expect(read()).toBe(`${BULLET.repeat(4)} 5678`);
  });

  test('a partial selection copies the characters it covers', () => {
    const { el } = tel();
    caret(el, 4, 7); // '123'
    const { ev, read } = clipboardEvent('copy');
    el.dispatchEvent(ev);
    expect(read()).toBe('123');
  });

  test('cut writes the clipboard and deletes the range through the commit path', () => {
    const onInput = vi.fn();
    const { el, mask } = tel({ onInput });
    caret(el, 0, 3); // '555'
    const { ev, read } = clipboardEvent('cut');
    el.dispatchEvent(ev);
    expect(read()).toBe('555');
    expect(mask.getRawValue()).toBe('1234567');
    expect(onInput).toHaveBeenCalled();
  });

  test('cut with a collapsed caret copies nothing and deletes nothing', () => {
    const { el, mask } = tel();
    caret(el, 4);
    const { ev } = clipboardEvent('cut');
    el.dispatchEvent(ev);
    expect(mask.getRawValue()).toBe('5551234567');
  });

  test('setObscure flips the default policy but leaves an explicit one alone', () => {
    const explicit = mount({ format: '**** ####', initialValue: '12345678', copyPolicy: 'formatted' });
    explicit.mask.setObscure(true);
    caret(explicit.el, 0, explicit.el.value.length);
    const a = clipboardEvent('copy');
    explicit.el.dispatchEvent(a.ev);
    expect(a.read()).toBe('1234 5678');

    const implicitDefault = mount({ format: '**** ####', initialValue: '12345678' });
    implicitDefault.mask.setObscure(true);
    caret(implicitDefault.el, 0, implicitDefault.el.value.length);
    const b = clipboardEvent('copy');
    implicitDefault.el.dispatchEvent(b.ev);
    expect(b.read()).toBe(`${BULLET.repeat(4)} 5678`);
  });
});

describe('the public surface', () => {
  test('setValue accepts the canonical form and the formatted form alike', () => {
    const { el, mask } = mount({ format: '###-###-####', semantic: 'tel' });
    mask.setValue('5551234567');
    expect(el.value).toBe('555-123-4567');
    mask.setValue('(555) 987-6543');
    expect(el.value).toBe('555-987-6543');
    expect(mask.getCanonicalValue()).toBe('5559876543');
  });

  test('setValue does not echo back through onInput', () => {
    const onInput = vi.fn();
    const { mask } = mount({ format: '###-###-####', onInput });
    mask.setValue('5551234567');
    expect(onInput).not.toHaveBeenCalled();
  });

  test('the three getters report the three different things', () => {
    const custom = mount({ format: '@@@-####', semantic: 'custom', initialValue: 'chg4821', caseMode: 'upper' });
    expect(custom.mask.getRawValue()).toBe('CHG4821');
    expect(custom.mask.getFormattedValue()).toBe('CHG-4821');
    expect(custom.mask.getCanonicalValue()).toBe('CHG-4821');

    const phone = mount({ format: '###-###-####', semantic: 'tel', initialValue: '5551234567' });
    expect(phone.mask.getCanonicalValue()).toBe('5551234567');
    expect(phone.mask.getFormattedValue()).toBe('555-123-4567');
  });

  test('an empty field is canonically the empty string, never the guide', () => {
    const { mask } = mount({ format: '##/##/####', guide: 'mm/dd/yyyy' });
    expect(mask.getCanonicalValue()).toBe('');
    expect(mask.getRawValue()).toBe('');
  });

  test('update() re-compiles and preserves the value', () => {
    const { el, mask } = mount({ format: '###-###-####', initialValue: '5551234567' });
    mask.update({ format: '### ### ####' });
    expect(el.value).toBe('555 123 4567');
    expect(mask.getRawValue()).toBe('5551234567');
  });

  test('update() to a shorter format keeps what still fits, and SAYS SO', () => {
    const onInput = vi.fn();
    const onReject = vi.fn();
    const { el, mask } = mount({
      format: '###-###-####',
      semantic: 'tel',
      initialValue: '5551234567',
      onInput,
      onReject,
    });
    onInput.mockClear();
    mask.update({ format: '###-###' });
    expect(mask.getRawValue()).toBe('555123');
    expect(el.value).toBe('555-123');
    // The consumer's own model still holds `5551234567`; without both of these it never
    // learns otherwise. The reject carries the pre-change text, which is the only copy of
    // the four digits left anywhere.
    expect(onReject).toHaveBeenCalledWith({ reason: 'format-change-clipped', data: '555-123-4567' });
    expect(onInput).toHaveBeenCalledWith({ canonical: '555123', formatted: '555-123' });
  });

  test('update() to a narrower character class reports the same loss', () => {
    const onReject = vi.fn();
    const { mask } = mount({ format: '@@@-####', initialValue: 'abc1234', onReject });
    mask.update({ format: '###-####' });
    expect(mask.getRawValue()).toBe('1234');
    expect(onReject).toHaveBeenCalledWith({ reason: 'format-change-clipped', data: 'abc-1234' });
  });

  test('update() that loses nothing does not cry wolf, but still converges the consumer', () => {
    const onInput = vi.fn();
    const onReject = vi.fn();
    const { mask } = mount({
      format: '###-###-####',
      semantic: 'tel',
      initialValue: '5551234567',
      onInput,
      onReject,
    });
    onInput.mockClear();
    mask.update({ format: '### ### ####' });
    expect(onReject).not.toHaveBeenCalled();
    expect(onInput).toHaveBeenCalledWith({ canonical: '5551234567', formatted: '555 123 4567' });
  });

  test('update() that changes nothing visible notifies nobody', () => {
    const onInput = vi.fn();
    const { mask } = mount({ format: '###-###-####', initialValue: '5551234567', onInput });
    onInput.mockClear();
    mask.update({ semantic: 'tel' });
    expect(onInput).not.toHaveBeenCalled();
  });

  test('the undo history survives a format change, re-fitted to the new pattern', () => {
    const { el, mask } = mount({ format: '#####' });
    type(el, '12');
    keydown(el, { key: 'ArrowRight' }); // break the run so there are two entries to walk
    caret(el, 2);
    type(el, '345');
    mask.update({ format: '###' });
    expect(el.value).toBe('123');

    // The format change itself pushes NO entry -- one would be dead by construction, since
    // restoring it re-fits to the text already on screen. So the first Ctrl+Z reaches the
    // real edit underneath, re-fitted through the new pattern.
    keydown(el, { key: 'z', ctrlKey: true });
    expect(el.value).toBe('12');

    // ...and the one under that, from before the run break, still works.
    keydown(el, { key: 'z', ctrlKey: true });
    expect(el.value).toBe('');
  });

  test('undo does NOT resurrect what a format change clipped', () => {
    // Stated as its own pin rather than left implicit: undo reverses an EDIT, and a format
    // change is not one. The pattern moved, so the digits it can no longer hold have
    // nowhere to go back to -- which is exactly why the loud onReject above is the half
    // that protects the value.
    const { el, mask } = mount({ format: '#####' });
    type(el, '12345');
    mask.update({ format: '###' });
    keydown(el, { key: 'z', ctrlKey: true });
    expect(el.value).toBe('');
    expect(mask.getRawValue()).toBe('');
  });

  test('an undo across a format change re-fits the FORMATTED text, not the bare raw', () => {
    // The one line in this file that a plausible refactor would get wrong, and the only
    // test that reaches it. `normalizeToRaw` is NOT idempotent on bare raw when a fill
    // character equals a leading literal: raw `V12` under `V-***` re-normalizes to `12`,
    // because the walk consumes the `V` as the literal. Feeding the FORMATTED text
    // (`V-V12`) gives the literal its own character to eat. Reaching the branch needs all
    // three of: colliding content, an entry written BEFORE an update(), and an undo after.
    const { el, mask } = mount({ format: 'V-***' });
    mask.setValue('V-V12');
    expect(mask.getRawValue()).toBe('V12');

    mask.setValue('V-A99'); // pushes the entry, stamped with the old pattern
    mask.update({ format: 'V-****' }); // so the restore below takes the re-fit branch

    keydown(el, { key: 'z', ctrlKey: true });
    expect(mask.getRawValue()).toBe('V12'); // the bare-raw form yields '12'
    expect(el.value).toBe('V-V12');
  });

  test('update() is atomic: a format that fails to compile is not applied, now or later', () => {
    const { el, mask } = mount({
      format: '##/##/####',
      guide: 'mm/dd/yyyy',
      initialValue: '12312024',
    });
    expect(() => mask.update({ format: '##/##' })).toThrow(MaskError);
    expect(el.value).toBe('12/31/2024');

    // A later update that says nothing about `format` must not pick up the rejected one.
    mask.update({ semantic: 'custom' });
    expect(el.value).toBe('12/31/2024');
    expect(mask.getRawValue()).toBe('12312024');

    // ...and a guide that would only align with the REJECTED format must not resurrect it:
    // it is measured against the format still in force, so it is refused too.
    expect(() => mask.update({ guide: 'mm/dd' })).toThrow(MaskError);
    expect(el.value).toBe('12/31/2024');
  });

  test('update() to a new caseMode applies it to the value it kept', () => {
    const { el, mask } = mount({ format: '@@@-####', initialValue: 'chg4821' });
    expect(el.value).toBe('chg-4821');
    mask.update({ caseMode: 'upper' });
    expect(el.value).toBe('CHG-4821');
  });

  test('`.value` is never shadowed (§5.8)', () => {
    const { el, mask } = mount({ format: '###-###-####', initialValue: '5551234567' });
    expect(Object.getOwnPropertyDescriptor(el, 'value')).toBeUndefined();
    type(el, '');
    mask.setValue('5559876543');
    expect(Object.getOwnPropertyDescriptor(el, 'value')).toBeUndefined();
    // and the native getter still tells the truth
    expect(el.value).toBe('555-987-6543');
  });

  test('setObscure is wired but does not yet change the display (tier 3 / task 10)', () => {
    const { el, mask } = mount({ format: '**** ####', initialValue: '12345678' });
    mask.setObscure(true);
    expect(el.value).toBe('1234 5678');
  });
});
