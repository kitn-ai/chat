// tests/primitives/field-semantics.test.ts
// Tier 1 semantic types (spec 2026-08-24-form-field-formats-design.md, §2 tier 1, §4).
// `postal` is DROPPED per decided O-2 -- the enum is tel/ssn/credit-card/custom.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { compileMask } from '../../src/primitives/field-mask';
import {
  FIELD_SEMANTIC_TYPES,
  type FieldSemanticType,
  canonicalize,
  fieldSemantics,
} from '../../src/primitives/field-semantics';

describe('FIELD_SEMANTIC_TYPES -- the single source of the enum', () => {
  test('is exactly tel, ssn, credit-card, custom -- postal dropped (O-2)', () => {
    expect(FIELD_SEMANTIC_TYPES).toEqual(['tel', 'ssn', 'credit-card', 'custom']);
  });
});

describe('fieldSemantics -- tier 1 attribute bag per type (spec §2 tier 1 table)', () => {
  test('tel: inputmode tel, autocomplete tel, digits default mask, canonical digits', () => {
    const s = fieldSemantics('tel');
    expect(s.inputmode).toBe('tel');
    expect(s.autocomplete).toBe('tel');
    expect(s.spellcheck).toBe(false);
    expect(s.autocorrect).toBe('off');
    expect(s.autocapitalize).toBe('off');
    expect(s.defaultFormat).toBe('###-###-####');
    expect(s.canonical).toBe('digits');
  });

  test('ssn: inputmode numeric, autocomplete "off" (no standard token; defensive marker), canonical digits', () => {
    const s = fieldSemantics('ssn');
    expect(s.inputmode).toBe('numeric');
    expect(s.autocomplete).toBe('off');
    expect(s.defaultFormat).toBe('###-##-####');
    expect(s.canonical).toBe('digits');
  });

  test('credit-card: inputmode numeric, autocomplete cc-number, canonical digits', () => {
    const s = fieldSemantics('credit-card');
    expect(s.inputmode).toBe('numeric');
    expect(s.autocomplete).toBe('cc-number');
    expect(s.defaultFormat).toBe('#### #### #### ####');
    expect(s.canonical).toBe('digits');
  });

  test('custom: inputmode/autocomplete inherited (not set here), no default format, canonical formatted', () => {
    const s = fieldSemantics('custom');
    expect(s.inputmode).toBeUndefined();
    expect(s.autocomplete).toBeUndefined();
    expect(s.defaultFormat).toBeUndefined();
    expect(s.canonical).toBe('formatted');
  });

  test('every type carries spellcheck/autocorrect/autocapitalize off', () => {
    for (const type of FIELD_SEMANTIC_TYPES) {
      const s = fieldSemantics(type);
      expect(s.spellcheck).toBe(false);
      expect(s.autocorrect).toBe('off');
      expect(s.autocapitalize).toBe('off');
    }
  });
});

describe('fieldSemantics -- unknown type at runtime (spec §7.3 "decide loudly")', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // @ts-expect-error -- not a member of FieldSemanticType; this is the compile-time half
  // of the contract (a caller working in TS cannot pass a bogus type without an error).
  const _typeCheckOnly = () => fieldSemantics('postal');
  void _typeCheckOnly;

  test('an unrecognized type falls back to unmasked text and warns loudly', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Simulates untyped input crossing a runtime boundary (JSON Schema, model output) --
    // the cast is the only way to reach the fallback branch from a typed call site.
    const s = fieldSemantics('postal' as unknown as FieldSemanticType);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toEqual(expect.stringContaining('postal'));
    // Unmasked text: no inputmode/autocomplete/defaultFormat override, plain as-typed value.
    expect(s.inputmode).toBeUndefined();
    expect(s.autocomplete).toBeUndefined();
    expect(s.defaultFormat).toBeUndefined();
    expect(s.canonical).toBe('as-typed');
    expect(s.spellcheck).toBe(false);
    expect(s.autocorrect).toBe('off');
    expect(s.autocapitalize).toBe('off');
  });
});

describe('canonicalize -- spec §4: digits for tel/ssn/credit-card, formatted (trimmed) for custom', () => {
  test('tel: a full value canonicalizes to digits only', () => {
    const p = compileMask('###-###-####');
    const formatted = '415-555-0100';
    expect(canonicalize(p, formatted, 'tel')).toBe('4155550100');
  });

  test('tel: a half-filled value canonicalizes to the digits typed so far', () => {
    const p = compileMask('###-###-####');
    const formatted = '415-55 -    '; // guide-padded display, per formatForDisplay
    expect(canonicalize(p, formatted, 'tel')).toBe('41555');
  });

  test('ssn: a full value canonicalizes to digits only', () => {
    const p = compileMask('###-##-####');
    expect(canonicalize(p, '123-45-6789', 'ssn')).toBe('123456789');
  });

  test('ssn: a half-filled value canonicalizes to digits typed so far', () => {
    const p = compileMask('###-##-####');
    expect(canonicalize(p, '123-4 -    ', 'ssn')).toBe('1234');
  });

  test('credit-card: a full value canonicalizes to digits only', () => {
    const p = compileMask('#### #### #### ####');
    expect(canonicalize(p, '4111 1111 1111 1111', 'credit-card')).toBe('4111111111111111');
  });

  test('credit-card: a half-filled (partial) value canonicalizes to digits typed so far', () => {
    const p = compileMask('#### #### #### ####');
    expect(canonicalize(p, '4111 11   ', 'credit-card')).toBe('411111');
  });

  test('custom: a full value including a trailing literal canonicalizes to formatted with the literal', () => {
    // The literal-terminated case from Task 1's handoff: formatRaw and rawFromFormatted
    // genuinely differ here, and canonicalize must read formatRaw for `custom`.
    const p = compileMask('##-END');
    const formatted = '12-END';
    expect(canonicalize(p, formatted, 'custom')).toBe('12-END');
  });

  test('custom: a half-filled value trims the unfilled trailing literal (it is not content yet)', () => {
    const p = compileMask('##-END');
    const formatted = '1 -END'; // display-guide padded: one fill position typed, one not
    expect(canonicalize(p, formatted, 'custom')).toBe('1');
  });

  test('custom: an interior-literal format canonicalizes to formatted, literal included', () => {
    const p = compileMask('V-***', 'V-   ');
    expect(canonicalize(p, 'V-123', 'custom')).toBe('V-123');
  });

  test('empty field: canonicalizes to "", never the guide, for every semantic type', () => {
    const tel = compileMask('###-###-####');
    expect(canonicalize(tel, '   -   -    ', 'tel')).toBe('');

    const ssn = compileMask('###-##-####');
    expect(canonicalize(ssn, '   -  -    ', 'ssn')).toBe('');

    const custom = compileMask('V-***', 'V-   ');
    expect(canonicalize(custom, 'V-   ', 'custom')).toBe('');
  });
});
