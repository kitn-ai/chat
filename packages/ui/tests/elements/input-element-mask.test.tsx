// The `<kai-input>` half of the form-field formats work (spec §7.2 + task 5). The Solid
// widget's own masking is pinned in `tests/ui/input-mask-integration.test.tsx`; what is
// pinned HERE is only what the facade adds on top of it:
//
//   - the five SCALARS arrive by attribute AND by property and both reach the masker,
//   - `el.value` is the CANONICAL value (digits for `tel`, formatted for `custom`),
//   - `kai-input` / `kai-change` carry `{ value, formattedValue }`,
//   - `kai-input-rejected` projects ALL FOUR reject reasons,
//   - an external `el.value = ...` write goes THROUGH the masker instead of landing as
//     unformatted text on the inner input (the reviewer's I-1 finding from task 4).
//
// jsdom has no editing host, so every "keystroke" below travels the masker's documented
// `input` diff-reconciliation fallback (spec §5.1) rather than the `beforeinput` path.
// Caret placement, cancelation semantics and composition are NOT testable here and are
// deliberately not asserted; they belong to the real-Chromium pass.
import { flush as flushSync } from 'solid-js';
import '../../src/elements/input';

/** Let Solid's scheduler flush effects + the queued post-attach canonical sync. */
const flush = () => new Promise((r) => setTimeout(r, 0));

type MaskedInput = HTMLElement & {
  value: string;
  clear: () => void;
  format?: string;
  guide?: string;
  semantic?: string;
  caseMode?: string;
  copyPolicy?: string;
};

const mount = async (attrs: Record<string, string> = {}): Promise<MaskedInput> => {
  const el = document.createElement('kai-input') as MaskedInput;
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  document.body.appendChild(el);
  await flush();
  return el;
};

const inner = (el: HTMLElement): HTMLInputElement => el.shadowRoot!.querySelector('input')!;

/** One character at a time onto the end of the FORMATTED text, each one dispatched as a
 *  real `input` event -- the closest jsdom gets to typing into a masked field. */
const type = (input: HTMLInputElement, text: string): void => {
  for (const ch of text) {
    input.value = `${input.value}${ch}`;
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  }
};

/** A bulk replacement (paste / autofill / drag-drop all arrive this way). */
const paste = (input: HTMLInputElement, text: string): void => {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
};

const record = <T,>(el: HTMLElement, name: string): T[] => {
  const seen: T[] = [];
  el.addEventListener(name, (e) => seen.push((e as CustomEvent<T>).detail));
  return seen;
};

type ValueDetail = { value: string; formattedValue: string };
type RejectDetail = { reason: string; data: string };

test('the format/case-mode ATTRIBUTES mask, and el.value is the canonical value', async () => {
  const el = await mount({ format: '@@@-####', 'case-mode': 'upper' });
  const events = record<ValueDetail>(el, 'kai-input');

  type(inner(el), 'chg4821');
  await flush();

  expect(inner(el).value).toBe('CHG-4821');
  // `custom` (the default semantic) canonicalizes to the FORMATTED text, so both halves
  // of the detail agree here -- the tel case below is where they diverge.
  expect(el.value).toBe('CHG-4821');
  expect(events.at(-1)).toEqual({ value: 'CHG-4821', formattedValue: 'CHG-4821' });

  el.remove();
});

test('the same five props set as PROPERTIES mask too, and tel canonicalizes to digits', async () => {
  const el = document.createElement('kai-input') as MaskedInput;
  el.format = 'default';
  el.semantic = 'tel';
  el.guide = '   -   -    ';
  document.body.appendChild(el);
  await flush();

  const inputs = record<ValueDetail>(el, 'kai-input');
  const changes = record<ValueDetail>(el, 'kai-change');

  type(inner(el), '5551234567');
  await flush();

  expect(inner(el).value).toBe('555-123-4567');
  expect(el.value).toBe('5551234567');
  expect(inputs.at(-1)).toEqual({ value: '5551234567', formattedValue: '555-123-4567' });

  inner(el).dispatchEvent(new Event('blur'));
  flushSync(); // V2-FLUSH: v2 stages writes; commit before asserting
  await flush();
  expect(changes).toEqual([{ value: '5551234567', formattedValue: '555-123-4567' }]);

  el.remove();
});

test('semantic alone applies the tier-1 attributes and does NOT mask', async () => {
  const el = await mount({ semantic: 'tel' });
  const input = inner(el);

  expect(input.getAttribute('inputmode')).toBe('tel');
  expect(input.getAttribute('autocomplete')).toBe('tel');

  type(input, '5551234567');
  await flush();
  expect(input.value).toBe('5551234567'); // no separators: no mask ran
  expect(el.value).toBe('5551234567');

  el.remove();
});

test('no format and no semantic is the behavior of today, byte for byte', async () => {
  const el = await mount();
  const input = inner(el);

  for (const name of ['inputmode', 'autocomplete', 'spellcheck', 'autocorrect', 'autocapitalize']) {
    expect(input.getAttribute(name)).toBeNull();
  }

  const events = record<ValueDetail>(el, 'kai-input');
  paste(input, 'anything at all');
  await flush();

  expect(el.value).toBe('anything at all');
  expect(events.at(-1)).toEqual({ value: 'anything at all', formattedValue: 'anything at all' });

  el.remove();
});

test('kai-input-rejected fires on an over-capacity paste, with the value clamped', async () => {
  const el = await mount({ format: '###-###-####', semantic: 'tel' });
  const rejects = record<RejectDetail>(el, 'kai-input-rejected');

  paste(inner(el), '5551234567890123');
  await flush();

  expect(rejects.map((r) => r.reason)).toContain('over-capacity');
  expect(rejects.at(-1)!.data).toBe('5551234567890123');
  expect(inner(el).value).toBe('555-123-4567');
  expect(el.value).toBe('5551234567');

  el.remove();
});

test('kai-input-rejected fires with `full` on a keystroke past the end', async () => {
  const el = await mount({ format: '###-###-####', semantic: 'tel' });
  const input = inner(el);
  type(input, '5551234567');
  const rejects = record<RejectDetail>(el, 'kai-input-rejected');

  type(input, '8');
  await flush();

  expect(rejects).toEqual([{ reason: 'full', data: '8' }]);
  expect(input.value).toBe('555-123-4567');

  el.remove();
});

test('kai-input-rejected fires with `wrong-class` on a character the position refuses', async () => {
  const el = await mount({ format: '###-###-####', semantic: 'tel' });
  const rejects = record<RejectDetail>(el, 'kai-input-rejected');

  type(inner(el), 'a');
  await flush();

  expect(rejects).toEqual([{ reason: 'wrong-class', data: 'a' }]);
  expect(inner(el).value).toBe('');

  el.remove();
});

test('kai-input-rejected projects format-change-clipped WITHOUT flipping the field invalid', async () => {
  const el = await mount({ format: '###-###-####', semantic: 'tel' });
  type(inner(el), '5551234567');
  const rejects = record<RejectDetail>(el, 'kai-input-rejected');

  // The pattern moves out from under a value that was already accepted. Per the binding
  // ruling this is NOT a user-input error: it reports, and it must not touch validity.
  el.setAttribute('format', '###-####');
  await flush();

  expect(rejects.map((r) => r.reason)).toEqual(['format-change-clipped']);
  expect(inner(el).getAttribute('aria-invalid')).toBeNull();
  expect(el.value).toBe('5551234');

  el.remove();
});

test('an external el.value write goes THROUGH the masker and fires no event', async () => {
  const el = await mount({ format: '###-###-####', semantic: 'tel' });
  const inputs = record<ValueDetail>(el, 'kai-input');
  const changes = record<ValueDetail>(el, 'kai-change');

  el.value = '555123';
  await flush();

  // The I-1 finding: before this task the raw text landed on the inner input and stayed
  // there until the next keystroke reconciled it.
  expect(inner(el).value).toBe('555-123');
  expect(el.value).toBe('555123');
  expect(el.getAttribute('value')).toBe('555123');
  expect(inputs).toEqual([]);
  expect(changes).toEqual([]);

  // And the masker's own state moved with it: typing continues from the written value
  // rather than from whatever the masker was holding before.
  type(inner(el), '4');
  await flush();
  expect(inner(el).value).toBe('555-123-4');
  expect(inputs.at(-1)).toEqual({ value: '5551234', formattedValue: '555-123-4' });

  el.remove();
});

test('a value present at FIRST render is masked and canonicalized', async () => {
  const el = await mount({ format: '@@@-####', 'case-mode': 'upper', value: 'chg4821' });

  expect(inner(el).value).toBe('CHG-4821');
  expect(el.value).toBe('CHG-4821');
  expect(el.getAttribute('value')).toBe('CHG-4821');

  el.remove();
});

test('clear() empties a masked field and resets the masker with it', async () => {
  const el = await mount({ format: '###-###-####', semantic: 'tel' });
  type(inner(el), '5551234567');
  await flush();

  const changes = record<ValueDetail>(el, 'kai-change');
  el.clear();
  await flush();

  expect(el.value).toBe('');
  expect(inner(el).value).toBe('');
  expect(changes).toEqual([{ value: '', formattedValue: '' }]);

  // Not just the display: the masker itself is empty, so typing starts over.
  type(inner(el), '212');
  await flush();
  expect(inner(el).value).toBe('212');

  el.remove();
});

// --- Post-mount configuration changes (review finding I-1) --------------------------
//
// `format` is normally present at first render and the seed path handles that. When it
// arrives LATER the masker attaches without notifying, so the facade has to re-derive the
// canonical value itself. Two things the masker cannot tell it, both pinned here:
//   - a fresh attach seeds silently (`commitRaw(..., notify: false)`),
//   - `update()` notifies only when the FORMATTED text changed, so a reconfiguration that
//     moves the canonical value without moving the display is silent too.

test('a format applied AFTER mount canonicalizes el.value, not just the display', async () => {
  // The reviewer's exact repro (P12a/b/c).
  const el = await mount();
  paste(inner(el), 'chg4821');
  await flush();
  expect(el.value).toBe('chg4821'); // unmasked: canonical is the text

  el.setAttribute('case-mode', 'upper');
  el.setAttribute('format', '@@@-####');
  await flush();

  expect(inner(el).value).toBe('CHG-4821');
  expect(el.value).toBe('CHG-4821');
  expect(el.getAttribute('value')).toBe('CHG-4821');

  el.remove();
});

test('switching `semantic` post-mount moves the canonical value without touching the display', async () => {
  // `custom` canonicalizes to the formatted text, `tel` to the digits. The DISPLAY is
  // identical either way, so the masker never notifies: only the facade can catch this.
  const el = await mount({ format: '###-###-####' });
  type(inner(el), '5551234567');
  await flush();
  expect(el.value).toBe('555-123-4567');

  el.setAttribute('semantic', 'tel');
  await flush();

  expect(inner(el).value).toBe('555-123-4567');
  expect(el.value).toBe('5551234567');

  el.remove();
});

test('removing the format post-mount leaves el.value as the text on screen', async () => {
  const el = await mount({ format: '###-###-####', semantic: 'tel' });
  type(inner(el), '5551234567');
  await flush();
  expect(el.value).toBe('5551234567');

  el.removeAttribute('format');
  await flush();

  expect(el.value).toBe(inner(el).value);

  el.remove();
});

test('getRawValue() and getFormattedValue() read the two forms off the element', async () => {
  const el = (await mount({ format: '###-###-####', semantic: 'tel' })) as MaskedInput & {
    getRawValue: () => string;
    getFormattedValue: () => string;
  };
  type(inner(el), '5551234567');
  await flush();

  expect(el.getRawValue()).toBe('5551234567');
  expect(el.getFormattedValue()).toBe('555-123-4567');
  expect(el.getRawValue()).toBe(el.value);

  el.remove();
});
