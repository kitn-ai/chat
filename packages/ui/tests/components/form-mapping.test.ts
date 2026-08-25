// tests/components/form-mapping.test.ts
// The load-bearing JSON-Schema -> widget mapping matrix, tested as a pure function.
import { describe, expect, test } from 'vitest';
import {
  widgetFor,
  resolveFieldMask,
  humanize,
  orderedKeys,
  coerceValue,
  validateForm,
  buildResult,
  type FormDefinition,
  type FormField,
} from '../../src/components/form';

const DEFAULT_INLINE_MAX = 4;

describe('widgetFor — the mapping table', () => {
  const cases: Array<[string, FormField, number, string]> = [
    ['string -> text', { type: 'string' }, DEFAULT_INLINE_MAX, 'text'],
    ['string enum <= max -> radio', { type: 'string', enum: ['a', 'b', 'c'] }, DEFAULT_INLINE_MAX, 'radio'],
    ['string enum > max -> select', { type: 'string', enum: ['a', 'b', 'c', 'd', 'e'] }, DEFAULT_INLINE_MAX, 'select'],
    ['string email -> email', { type: 'string', format: 'email' }, DEFAULT_INLINE_MAX, 'email'],
    ['string uri -> url', { type: 'string', format: 'uri' }, DEFAULT_INLINE_MAX, 'url'],
    ['string url -> url', { type: 'string', format: 'url' }, DEFAULT_INLINE_MAX, 'url'],
    ['string date -> date', { type: 'string', format: 'date' }, DEFAULT_INLINE_MAX, 'date'],
    ['string date-time -> datetime', { type: 'string', format: 'date-time' }, DEFAULT_INLINE_MAX, 'datetime'],
    ['string time -> time', { type: 'string', format: 'time' }, DEFAULT_INLINE_MAX, 'time'],
    ['string maxLength>120 -> textarea', { type: 'string', maxLength: 200 }, DEFAULT_INLINE_MAX, 'textarea'],
    ['number -> number', { type: 'number' }, DEFAULT_INLINE_MAX, 'number'],
    ['integer -> number', { type: 'integer' }, DEFAULT_INLINE_MAX, 'number'],
    ['boolean -> switch', { type: 'boolean' }, DEFAULT_INLINE_MAX, 'switch'],
    [
      'array items.enum <= max -> checkbox-group',
      { type: 'array', items: { enum: ['x', 'y'] } },
      DEFAULT_INLINE_MAX,
      'checkbox-group',
    ],
    [
      'array items.enum > max -> multiselect',
      { type: 'array', items: { enum: ['a', 'b', 'c', 'd', 'e'] } },
      DEFAULT_INLINE_MAX,
      'multiselect',
    ],
    ['array items.object -> repeater', { type: 'array', items: { type: 'object', properties: {} } }, DEFAULT_INLINE_MAX, 'repeater'],
    ['array items.string -> taglist', { type: 'array', items: { type: 'string' } }, DEFAULT_INLINE_MAX, 'taglist'],
    ['nested object -> fieldset', { type: 'object', properties: {} }, DEFAULT_INLINE_MAX, 'fieldset'],
  ];

  for (const [name, field, inlineMax, expected] of cases) {
    test(name, () => {
      expect(widgetFor(field, inlineMax)).toBe(expected);
    });
  }

  test('x-kai-widget overrides the default mapping', () => {
    expect(widgetFor({ type: 'integer', 'x-kai-widget': 'rating' }, DEFAULT_INLINE_MAX)).toBe('rating');
    expect(widgetFor({ type: 'number', 'x-kai-widget': 'slider' }, DEFAULT_INLINE_MAX)).toBe('slider');
    expect(widgetFor({ type: 'string', 'x-kai-widget': 'textarea' }, DEFAULT_INLINE_MAX)).toBe('textarea');
    expect(widgetFor({ type: 'string', 'x-kai-widget': 'password' }, DEFAULT_INLINE_MAX)).toBe('password');
    expect(widgetFor({ type: 'boolean', 'x-kai-widget': 'checkbox' }, DEFAULT_INLINE_MAX)).toBe('checkbox');
  });

  test('unknown x-kai-widget falls back to the default mapping', () => {
    // An out-of-enum hint must be ignored (forward-compatible), not break.
    const field = { type: 'string', 'x-kai-widget': 'wormhole' } as unknown as FormField;
    expect(widgetFor(field, DEFAULT_INLINE_MAX)).toBe('text');
  });

  // THE PIN (spec §7.3): `x-kai-format` selects FORMATTING, never a widget.
  //
  // The temptation is real — `format: 'email'` two lines up in `widgetFor` picks a
  // widget, so the next reader may "finish the pattern" and switch on `x-kai-format`
  // here too. That would be a different feature: a `tel` field would stop being a text
  // field with a mask and start being whatever the new branch returned, and `custom`
  // would have no widget to name at all. Masking is a property of the CONTROL, resolved
  // in `resolveFieldMask` and handed to `Input`; the widget stays `text`.
  test('x-kai-format is NOT a widget selector — every token still resolves to `text`', () => {
    for (const token of ['tel', 'ssn', 'credit-card', 'custom']) {
      const field = { type: 'string', 'x-kai-format': token } as unknown as FormField;
      expect(widgetFor(field, DEFAULT_INLINE_MAX), token).toBe('text');
    }
    // …and it does not override an explicit widget hint either, in either direction.
    const withHint = { type: 'string', 'x-kai-format': 'tel', 'x-kai-widget': 'textarea' } as unknown as FormField;
    expect(widgetFor(withHint, DEFAULT_INLINE_MAX)).toBe('textarea');
    // A mask on a field the mapping sends elsewhere does not drag it back to `text`.
    const long = { type: 'string', maxLength: 400, 'x-kai-format': 'custom', 'x-kai-mask': 'CHG-####' } as unknown as FormField;
    expect(widgetFor(long, DEFAULT_INLINE_MAX)).toBe('textarea');
  });
});

describe('resolveFieldMask — what the field-format hints resolve to', () => {
  test('each semantic token resolves its own default pattern, and only when opted into', () => {
    expect(resolveFieldMask({ type: 'string', 'x-kai-format': 'tel' }).format).toBe('###-###-####');
    expect(resolveFieldMask({ type: 'string', 'x-kai-format': 'credit-card' }).format).toBe('#### #### #### ####');
    // A field with no hint is untouched: no format, no semantic, no hint text.
    expect(resolveFieldMask({ type: 'string' })).toEqual({ warnings: [] });
  });

  test('an explicit aligned guide wins over the derived one and becomes the hint text', () => {
    const r = resolveFieldMask({
      type: 'string',
      'x-kai-format': 'custom',
      'x-kai-mask': '##/##/####',
      'x-kai-mask-guide': 'mm/dd/yyyy',
    });
    expect(r.guide).toBe('mm/dd/yyyy');
    expect(r.hint).toContain('mm/dd/yyyy');
    expect(r.warnings).toEqual([]);
  });

  test('x-kai-mask is ignored — loudly — unless the format is `custom`', () => {
    const r = resolveFieldMask({ type: 'string', 'x-kai-format': 'tel', 'x-kai-mask': 'CHG-####' }, 'phone');
    expect(r.format).toBe('###-###-####');
    expect(r.warnings.join(' ')).toContain('x-kai-mask');
  });
});

describe('humanize', () => {
  test('humanizes a property key into a label', () => {
    expect(humanize('firstName')).toBe('First Name');
    expect(humanize('contact_ok')).toBe('Contact Ok');
    expect(humanize('plan')).toBe('Plan');
  });
});

describe('orderedKeys', () => {
  const def = (over: Partial<FormDefinition>): FormDefinition => ({
    type: 'object',
    properties: { a: { type: 'string' }, b: { type: 'string' }, c: { type: 'string' } },
    ...over,
  });

  test('x-kai-order wins', () => {
    expect(orderedKeys(def({ 'x-kai-order': ['c', 'a', 'b'] }))).toEqual(['c', 'a', 'b']);
  });

  test('x-kai-order ignores unknown keys and appends missing ones', () => {
    expect(orderedKeys(def({ 'x-kai-order': ['c', 'zzz'] }))).toEqual(['c', 'a', 'b']);
  });

  test('without order: required first, then declaration order', () => {
    expect(orderedKeys(def({ required: ['b'] }))).toEqual(['b', 'a', 'c']);
  });

  test('without order or required: declaration order', () => {
    expect(orderedKeys(def({}))).toEqual(['a', 'b', 'c']);
  });
});

describe('coerceValue', () => {
  test('number/integer coerce string -> number', () => {
    expect(coerceValue({ type: 'number' }, '3.5')).toBe(3.5);
    expect(coerceValue({ type: 'integer' }, '7')).toBe(7);
  });

  test('boolean coerces to a real boolean', () => {
    expect(coerceValue({ type: 'boolean' }, true)).toBe(true);
    expect(coerceValue({ type: 'boolean' }, false)).toBe(false);
  });

  test('empty number string coerces to undefined', () => {
    expect(coerceValue({ type: 'number' }, '')).toBeUndefined();
  });
});

describe('validateForm', () => {
  const schema: FormDefinition = {
    type: 'object',
    required: ['name', 'age'],
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 5 },
      age: { type: 'integer', minimum: 0, maximum: 120 },
      email: { type: 'string', format: 'email' },
      plan: { type: 'string', enum: ['free', 'pro'] },
    },
  };

  test('required missing -> error for that field', () => {
    const res = validateForm(schema, { age: 10 });
    expect(res.valid).toBe(false);
    expect(res.fieldErrors.name).toBeTruthy();
  });

  test('minLength / maxLength enforced', () => {
    expect(validateForm(schema, { name: 'a', age: 1 }).fieldErrors.name).toBeTruthy();
    expect(validateForm(schema, { name: 'abcdef', age: 1 }).fieldErrors.name).toBeTruthy();
    expect(validateForm(schema, { name: 'abc', age: 1 }).fieldErrors.name).toBeUndefined();
  });

  test('min / max enforced; integer rejects floats', () => {
    expect(validateForm(schema, { name: 'abc', age: -1 }).fieldErrors.age).toBeTruthy();
    expect(validateForm(schema, { name: 'abc', age: 999 }).fieldErrors.age).toBeTruthy();
    expect(validateForm(schema, { name: 'abc', age: 3.5 }).fieldErrors.age).toBeTruthy();
    expect(validateForm(schema, { name: 'abc', age: 30 }).fieldErrors.age).toBeUndefined();
  });

  test('enum rejects out-of-set, accepts in-set', () => {
    expect(validateForm(schema, { name: 'abc', age: 1, plan: 'enterprise' }).fieldErrors.plan).toBeTruthy();
    expect(validateForm(schema, { name: 'abc', age: 1, plan: 'pro' }).fieldErrors.plan).toBeUndefined();
  });

  test('email format pattern enforced', () => {
    expect(validateForm(schema, { name: 'abc', age: 1, email: 'nope' }).fieldErrors.email).toBeTruthy();
    expect(validateForm(schema, { name: 'abc', age: 1, email: 'a@b.co' }).fieldErrors.email).toBeUndefined();
  });

  test('a fully valid object validates', () => {
    expect(validateForm(schema, { name: 'abc', age: 30, email: 'a@b.co', plan: 'free' }).valid).toBe(true);
  });
});

describe('buildResult', () => {
  const schema: FormDefinition = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      comments: { type: 'string' },
      age: { type: 'integer' },
    },
  };

  test('omits empty optional strings; keeps real values', () => {
    const out = buildResult(schema, { name: 'Bo', comments: '', age: 4 });
    expect(out).toEqual({ name: 'Bo', age: 4 });
    expect('comments' in out).toBe(false);
  });

  test('keeps false booleans and zero numbers (not "empty")', () => {
    const s: FormDefinition = {
      type: 'object',
      properties: { ok: { type: 'boolean' }, n: { type: 'integer' } },
    };
    expect(buildResult(s, { ok: false, n: 0 })).toEqual({ ok: false, n: 0 });
  });
});
