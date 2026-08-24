// tests/primitives/form-schemas.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { validateAgainstSchema, type JsonSchema } from '../../src/primitives/card-validate';
import { FIELD_SEMANTIC_TYPES } from '../../src/primitives/field-semantics';
import { compileMask } from '../../src/primitives/field-mask';

const load = (name: string): JsonSchema =>
  JSON.parse(readFileSync(`src/primitives/card-schemas/${name}`, 'utf-8'));

/** The field-definition node the form schema declares under `properties`. */
const fieldNode = (): Record<string, JsonSchema> => {
  const s = load('form.schema.json') as unknown as {
    properties: { properties: { additionalProperties?: { properties?: Record<string, JsonSchema> } } };
  };
  const props = s.properties.properties.additionalProperties?.properties;
  if (!props) throw new Error('form.schema.json declares no field-definition node under `properties`');
  return props;
};

test('form.schema.json parses + validates a known-good form definition', () => {
  const s = load('form.schema.json');
  const good = {
    type: 'object',
    title: 'How did we do?',
    required: ['rating'],
    properties: {
      rating: { type: 'integer', minimum: 1, maximum: 5 },
    },
  };
  expect(validateAgainstSchema(s, good).valid).toBe(true);
});

test('form.schema.json rejects a malformed form definition', () => {
  const s = load('form.schema.json');
  // wrong root type (not the object meta-shape)
  expect(validateAgainstSchema(s, { type: 'array', properties: {} }).valid).toBe(false);
  // missing required `properties`
  expect(validateAgainstSchema(s, { type: 'object' }).valid).toBe(false);
  // missing required `type`
  expect(validateAgainstSchema(s, { properties: {} }).valid).toBe(false);
});

// ─────────────────────────────────────────────────────────────────────────────
// x-kai-format / x-kai-mask / x-kai-mask-guide (spec §7.3)
// ─────────────────────────────────────────────────────────────────────────────

describe('form.schema.json declares the field-format hints', () => {
  test('all three, on the field-definition node', () => {
    const props = fieldNode();
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining(['x-kai-format', 'x-kai-mask', 'x-kai-mask-guide']),
    );
  });

  test('`x-kai-format` is an ENUM, and its members ARE FIELD_SEMANTIC_TYPES — not a retyped copy', () => {
    // Cheap-model reliability (spec §7.3): an enum on the projected tool schema is
    // emitted reliably where a free-form string is not. The list lives once, in
    // field-semantics.ts; this is the derivation check for the JSON copy, which
    // cannot import it. Order included — the projected schema shows the model a list.
    expect(fieldNode()['x-kai-format']!.enum).toEqual([...FIELD_SEMANTIC_TYPES]);
  });

  test('`x-kai-mask` is capped at exactly the length `compileMask` accepts', () => {
    const cap = fieldNode()['x-kai-mask']!.maxLength;
    expect(typeof cap).toBe('number');
    // Derived, not asserted against a literal 64: the schema's cap is the engine's cap.
    expect(() => compileMask('#'.repeat(cap!))).not.toThrow();
    expect(() => compileMask('#'.repeat(cap! + 1))).toThrow();
  });

  test('`x-kai-mask-guide` is a capped string too — it is aligned with the pattern', () => {
    const guide = fieldNode()['x-kai-mask-guide']!;
    expect(guide.type).toBe('string');
    expect(guide.maxLength).toBe(fieldNode()['x-kai-mask']!.maxLength);
  });

  test('a form definition carrying the hints still validates', () => {
    const s = load('form.schema.json');
    const good = {
      type: 'object',
      properties: {
        phone: { type: 'string', title: 'Phone', 'x-kai-format': 'tel' },
        ticket: { type: 'string', 'x-kai-format': 'custom', 'x-kai-mask': 'CHG-####' },
      },
    };
    expect(validateAgainstSchema(s, good).valid).toBe(true);
  });

  test('a HOSTILE x-kai-format does NOT invalidate the card — the widget degrades instead', () => {
    // Load-bearing and easy to get wrong. `validateAgainstSchema` implements no
    // `additionalProperties` applicator, so the field-node declaration is model-facing
    // only (tool projection + docs) and never a render-time gate. That is the behavior
    // spec §7.3 asks for: a bad hint falls back to an unmasked text input with a
    // console.warn, rather than nuking a card whose OTHER fields are fine.
    const s = load('form.schema.json');
    const hostile = {
      type: 'object',
      properties: { ticket: { type: 'string', 'x-kai-format': '<script>' } },
    };
    expect(validateAgainstSchema(s, hostile).valid).toBe(true);
  });
});

test('form.result.schema.json parses + requires an object', () => {
  const s = load('form.result.schema.json');
  expect(validateAgainstSchema(s, { rating: 4, plan: 'pro' }).valid).toBe(true);
  expect(validateAgainstSchema(s, 'not an object').valid).toBe(false);
});
