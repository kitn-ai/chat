// tests/primitives/field-mask.test.ts
// The pure format engine (spec 2026-08-24-form-field-formats-design.md, tier 2 / §3).
// jsdom `unit` project: this file covers the PURE parts only -- normalization, position
// mapping, capacity, class membership. Caret rendering, `beforeinput` cancelation and
// composition are NOT verifiable here and are deliberately absent (spec §8.2).
import { describe, expect, test } from 'vitest';
import {
  MaskError,
  acceptsAt,
  compileMask,
  formatRaw,
  formatForDisplay,
  formattedToRawIndex,
  normalizeToRaw,
  rawFromFormatted,
  rawToFormattedIndex,
} from '../../src/primitives/field-mask';

describe('compileMask', () => {
  test('derives a spaces-for-fills guide when none is given', () => {
    const p = compileMask('V-***');
    expect(p.guide).toBe('V-   ');
    expect(p.fillIndexes).toEqual([2, 3, 4]);
    expect(p.capacity).toBe(3);
  });

  test('every unknown character is a literal, identified by position', () => {
    // `V`, `-` and `/` are all literals here: `V` is a letter but sits at a literal
    // POSITION, which is the whole point of the token design (spec §2).
    const p = compileMask('V-##/##');
    expect(p.fillIndexes).toEqual([2, 3, 5, 6]);
    expect(p.guide).toBe('V-  /  ');
  });

  test('an explicit guide is kept verbatim and must be the same length', () => {
    expect(compileMask('##/##/####', 'mm/dd/yyyy').guide).toBe('mm/dd/yyyy');
    expect(() => compileMask('##/##/####', 'mm/dd')).toThrow(MaskError);
    expect(() => compileMask('##', 'abc')).toThrow(MaskError);
  });

  test('format is capped at 64 characters -- over the cap throws, at the cap compiles', () => {
    expect(() => compileMask('#'.repeat(65))).toThrow(MaskError);
    expect(compileMask('#'.repeat(64)).capacity).toBe(64);
  });

  test('capacity is exactly the number of fill positions', () => {
    const p = compileMask('###-##-####');
    expect(p.capacity).toBe(9);
    expect(p.capacity).toBe(p.fillIndexes.length);
  });
});

describe('normalizeToRaw -- lenient normalization (spec §2, §5.7)', () => {
  const ticket = compileMask('@@@-####');

  test.each(['chg4821', 'CHG4821', 'CHG-4821', 'chg 4821'])(
    '%s normalizes to raw CHG4821 and formats to CHG-4821 under caseMode upper',
    (input) => {
      const raw = normalizeToRaw(ticket, input, 'upper');
      expect(raw).toBe('CHG4821');
      expect(formatRaw(ticket, raw)).toBe('CHG-4821');
    },
  );

  test('caseMode defaults to preserve', () => {
    expect(normalizeToRaw(ticket, 'chg4821')).toBe('chg4821');
    expect(normalizeToRaw(ticket, 'CHG4821', 'lower')).toBe('chg4821');
  });

  // §5.7 -- THE DEFECT BEING FIXED. A strip-then-fill normalizer reads the leading
  // literal `V` as user input, renders `V-V12` and silently discards the `3`.
  test('consumes a matching literal prefix before filling (V-*** / V-123 -> V-123)', () => {
    const p = compileMask('V-***', 'V-   ');
    const raw = normalizeToRaw(p, 'V-123');
    expect(formatRaw(p, raw)).toBe('V-123');
    expect(raw).toBe('123');
  });

  test('the literal prefix is consumed case-insensitively, and is optional', () => {
    const p = compileMask('V-***', 'V-   ');
    expect(formatRaw(p, normalizeToRaw(p, 'v-123'))).toBe('V-123');
    expect(formatRaw(p, normalizeToRaw(p, 'v123'))).toBe('V-123');
    expect(formatRaw(p, normalizeToRaw(p, '123'))).toBe('V-123');
  });

  // The §5.7 rule generalized: a literal is identified by POSITION, so it must be
  // recognized wherever it sits -- not only in the leading run. `V` here is a literal at
  // index 2 AND a legal `*` fill character, so a leading-run-only matcher lets the second
  // fill position swallow it and drops the real trailing input.
  test('an INTERIOR literal is consumed positionally, not swallowed by a fill position', () => {
    const p = compileMask('*-V-*', ' -V- ');
    const raw = normalizeToRaw(p, 'A-V-B');
    expect(formatRaw(p, raw)).toBe('A-V-B');
    expect(raw).toBe('AB');
  });

  test('interior literals are optional in the input, exactly as the leading run is', () => {
    const p = compileMask('*-V-*', ' -V- ');
    expect(normalizeToRaw(p, 'AVB')).toBe('AB'); // separators omitted, literal V present
    expect(normalizeToRaw(p, 'AB')).toBe('AB');  // skeleton omitted entirely
    expect(normalizeToRaw(p, 'a-v-b', 'upper')).toBe('AB'); // literal match is case-insensitive
  });

  test('a TRAILING literal run is consumed positionally too', () => {
    const p = compileMask('##-END');
    expect(normalizeToRaw(p, '12-END')).toBe('12');
    expect(normalizeToRaw(p, '12')).toBe('12');
  });

  test('over-capacity input is clipped at capacity', () => {
    const ssn = compileMask('###-##-####');
    expect(ssn.capacity).toBe(9);
    expect(normalizeToRaw(ssn, '123456789')).toBe('123456789');
    expect(formatRaw(ssn, normalizeToRaw(ssn, '123456789'))).toBe('123-45-6789');
    expect(normalizeToRaw(ssn, '123456789012')).toBe('123456789');
    expect(formatRaw(ssn, normalizeToRaw(ssn, '123456789012'))).toBe('123-45-6789');
  });
});

describe('character classes -- Unicode, not ASCII (spec §5.4)', () => {
  test('# takes a digit and rejects a letter', () => {
    const p = compileMask('###');
    expect(acceptsAt(p, 0, '4')).toBe(true);
    expect(acceptsAt(p, 0, 'a')).toBe(false);
    expect(acceptsAt(p, 0, 'é')).toBe(false);
    expect(normalizeToRaw(p, 'a4b8')).toBe('48');
  });

  test('@ accepts non-ASCII letters', () => {
    const p = compileMask('@@@');
    expect(acceptsAt(p, 0, 'é')).toBe(true);
    expect(acceptsAt(p, 0, 'Ω')).toBe(true);
    expect(acceptsAt(p, 0, '7')).toBe(true);
    expect(acceptsAt(p, 0, '-')).toBe(false);
    expect(normalizeToRaw(p, 'é-Ω7')).toBe('éΩ7');
  });

  test('* behaves as @ for input purposes (it differs only in DISPLAY)', () => {
    const at = compileMask('@@@');
    const star = compileMask('***');
    for (const ch of ['é', 'Ω', '7', '-', ' ']) {
      expect(acceptsAt(star, 0, ch)).toBe(acceptsAt(at, 0, ch));
    }
    expect(normalizeToRaw(star, 'é-Ω7')).toBe('éΩ7');
  });

  test('acceptsAt is false outside the fill range', () => {
    const p = compileMask('###');
    expect(acceptsAt(p, -1, '4')).toBe(false);
    expect(acceptsAt(p, 3, '4')).toBe(false);
    expect(acceptsAt(p, 0, '')).toBe(false);
    expect(acceptsAt(p, 0, '44')).toBe(false);
  });
});

describe('formatRaw / formatForDisplay -- two call sites, two answers for empty', () => {
  const p = compileMask('##/##/####', 'mm/dd/yyyy');

  test('empty raw is the empty string for DATA purposes even with a guide', () => {
    expect(formatRaw(p, '')).toBe('');
  });

  test('empty raw is the guide for DISPLAY purposes', () => {
    expect(formatForDisplay(p, '')).toBe('mm/dd/yyyy');
  });

  test('a partial raw shows up to the last typed character for data, guide-padded for display', () => {
    expect(formatRaw(p, '12')).toBe('12');
    expect(formatForDisplay(p, '12')).toBe('12/dd/yyyy');
    expect(formatRaw(p, '123')).toBe('12/3');
    expect(formatForDisplay(p, '123')).toBe('12/3d/yyyy');
  });

  test('a full raw formats identically through both', () => {
    expect(formatRaw(p, '12312024')).toBe('12/31/2024');
    expect(formatForDisplay(p, '12312024')).toBe('12/31/2024');
  });

  // Spec §4: the canonical value for a `custom` mask is "formatted, trailing PLACEHOLDERS
  // trimmed" -- and a trailing literal run is not a placeholder. Once raw is at capacity
  // there is no unfilled placeholder left to trim, so the suffix is part of the datum, the
  // same way `CHG-` is part of `CHG-4821`.
  describe('a format ending in a literal run', () => {
    const p = compileMask('##-END');

    test('a FULL raw carries the trailing literal run into the data value', () => {
      expect(p.capacity).toBe(2);
      expect(formatRaw(p, '12')).toBe('12-END');
      expect(formatForDisplay(p, '12')).toBe('12-END');
    });

    test('a PARTIAL raw still stops at the first unfilled position', () => {
      expect(formatRaw(p, '1')).toBe('1');
      expect(formatForDisplay(p, '1')).toBe('1 -END');
    });

    test('the trailing run round-trips back out by position', () => {
      expect(rawFromFormatted(p, formatRaw(p, '12'))).toBe('12');
    });
  });

  test('an empty field is the empty string, never the bare mask template (spec §4)', () => {
    // The guard matters for a format whose LEADING position is a literal: walking the
    // format with nothing to fill would otherwise emit the skeleton `V-`.
    expect(formatRaw(compileMask('V-***', 'V-   '), '')).toBe('');
    expect(formatRaw(compileMask('##-END'), '')).toBe('');
    expect(formatRaw(compileMask('ABC'), '')).toBe('');
  });

  test('rawFromFormatted extracts by POSITION, so alphanumeric literals are never read back', () => {
    const v = compileMask('V-***', 'V-   ');
    expect(rawFromFormatted(v, 'V-123')).toBe('123');
    expect(rawFromFormatted(v, 'V-1')).toBe('1');
    expect(rawFromFormatted(v, '')).toBe('');
    // A display string's guide characters are not raw content.
    expect(rawFromFormatted(v, formatForDisplay(v, ''))).toBe('');
    const t = compileMask('@@@-####');
    expect(rawFromFormatted(t, formatRaw(t, 'CHG4821'))).toBe('CHG4821');
  });
});

describe('position mapping', () => {
  const p = compileMask('###-##-####');
  const raw = '12345'; // half filled
  const formatted = formatRaw(p, raw); // '123-45'

  test('the fixture is the half-filled value the mapping is specified over', () => {
    expect(formatted).toBe('123-45');
  });

  test('raw index 0 maps to the first fill index (never into a leading literal)', () => {
    const v = compileMask('V-***', 'V-   ');
    expect(rawToFormattedIndex(v, formatForDisplay(v, ''), 0)).toBe(2);
    expect(rawToFormattedIndex(v, formatRaw(v, '123'), 0)).toBe(2);
  });

  test('formattedToRawIndex counts FILLED fill positions before the caret', () => {
    expect(formattedToRawIndex(p, formatted, 0)).toBe(0);
    expect(formattedToRawIndex(p, formatted, 3)).toBe(3);
    expect(formattedToRawIndex(p, formatted, 4)).toBe(3); // the literal spans 3..4
    expect(formattedToRawIndex(p, formatted, 6)).toBe(5);
    expect(formattedToRawIndex(p, formatted, 99)).toBe(5); // clamped
  });

  test('round trip: rawToFormattedIndex(formattedToRawIndex(x)) === x for every CANONICAL caret position', () => {
    // Canonical = every caret position except the one immediately BEFORE a literal
    // run, which is not a resting place: the caret is pulled past the separator.
    const canonical = [0, 1, 2, 4, 5, 6];
    for (const x of canonical) {
      expect(rawToFormattedIndex(p, formatted, formattedToRawIndex(p, formatted, x))).toBe(x);
    }
  });

  test('the one non-canonical caret position is pulled forward past the literal run', () => {
    expect(rawToFormattedIndex(p, formatted, formattedToRawIndex(p, formatted, 3))).toBe(4);
  });

  test('rawToFormattedIndex clamps to the formatted text, never past it', () => {
    expect(rawToFormattedIndex(p, formatted, 5)).toBe(6);
    expect(rawToFormattedIndex(p, formatted, 99)).toBe(6);
    expect(rawToFormattedIndex(p, formatted, -1)).toBe(0);
    const full = formatRaw(p, '123456789');
    expect(rawToFormattedIndex(p, full, 9)).toBe(full.length);
  });
});
