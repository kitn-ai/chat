// src/primitives/field-semantics.ts
// Tier 1: semantic input types. A semantic type derives the attributes a browser and an
// assistive technology already know how to use -- `inputmode`, `autocomplete`,
// `spellcheck`, `autocorrect`, `autocapitalize` -- and the canonical (submitted) form of
// the field's value. No DOM, no Solid, no state. Spec:
// docs/superpowers/specs/2026-08-24-form-field-formats-design.md (§2 tier 1, §4).
//
// `postal` is DROPPED from the spec's tier-1 table per decided O-2: the enum here is the
// binding one, exported ONCE and read by the schema, the element facade and the tool
// projection (CLAUDE.md "derive it, don't type it") -- no second copy of these four
// strings anywhere else in the tree.
import { formatRaw, rawFromFormatted, type MaskPattern } from './field-mask';

export const FIELD_SEMANTIC_TYPES = ['tel', 'ssn', 'credit-card', 'custom'] as const;
export type FieldSemanticType = (typeof FIELD_SEMANTIC_TYPES)[number];

/** The tier-1 attribute bag for one semantic type. */
export interface FieldSemantics {
  readonly inputmode?: 'tel' | 'numeric';
  readonly autocomplete?: string; // `ssn` sends 'off' -- no standard token, so this is a
                                   // defensive marker against wrong autofill, not an omission
  readonly spellcheck: false;
  readonly autocorrect: 'off';
  readonly autocapitalize: 'off';
  /** The default tier-2 mask for this type, resolved only when the consumer opts in
   *  (`mask="default"` / the form card's `x-kai-format`) -- NOT applied automatically
   *  by a bare semantic type (decision 1). */
  readonly defaultFormat?: string;
  /** What the field submits: digit-only types strip separators, `custom`
   *  keeps its formatted/literal value, `as-typed` is the unmasked fallback. */
  readonly canonical: 'digits' | 'formatted' | 'as-typed';
}

const UNMASKED_FALLBACK: FieldSemantics = {
  spellcheck: false,
  autocorrect: 'off',
  autocapitalize: 'off',
  canonical: 'as-typed',
};

/** Resolve the tier-1 attribute bag for a semantic type.
 *
 *  Passing anything outside `FIELD_SEMANTIC_TYPES` is a TypeScript error at a typed call
 *  site; a value crossing an untyped boundary (JSON Schema, model output) that turns out
 *  not to be one of the four falls back to plain unmasked-text behavior at runtime, loudly
 *  -- `console.warn`, never a silent guess. */
export function fieldSemantics(type: FieldSemanticType): FieldSemantics {
  switch (type) {
    case 'tel':
      return {
        inputmode: 'tel',
        autocomplete: 'tel',
        spellcheck: false,
        autocorrect: 'off',
        autocapitalize: 'off',
        defaultFormat: '###-###-####',
        canonical: 'digits',
      };
    case 'ssn':
      return {
        inputmode: 'numeric',
        // 'off' -- no standard autocomplete token exists for a Social Security number, and
        // an absent attribute invites wrong autofill; 'off' is the defensive marker even
        // where a browser honors it unevenly (spec §2 tier 1 table).
        autocomplete: 'off',
        spellcheck: false,
        autocorrect: 'off',
        autocapitalize: 'off',
        defaultFormat: '###-##-####',
        canonical: 'digits',
      };
    case 'credit-card':
      return {
        inputmode: 'numeric',
        autocomplete: 'cc-number',
        spellcheck: false,
        autocorrect: 'off',
        autocapitalize: 'off',
        defaultFormat: '#### #### #### ####',
        canonical: 'digits',
      };
    case 'custom':
      // inputmode/autocomplete are INHERITED -- the consumer sets them directly, since a
      // custom mask carries no semantic of its own. No default format: `mask` IS the format.
      return {
        spellcheck: false,
        autocorrect: 'off',
        autocapitalize: 'off',
        canonical: 'formatted',
      };
    default: {
      const unknown: string = type;
      console.warn(
        `fieldSemantics: unrecognized semantic type ${JSON.stringify(unknown)}; falling back to unmasked text`,
      );
      return UNMASKED_FALLBACK;
    }
  }
}

/** The canonical (submitted) value for a field, given its compiled mask, the current
 *  FORMATTED text (`input.value`), and its semantic type.
 *
 *  Reads the raw value back out of `formatted` by position first -- an empty field is
 *  always `''`, never the bare guide. From there the two canonical shapes are read, not
 *  re-derived, per Task 1's handoff: `tel`/`ssn`/`credit-card` want the raw digits
 *  directly (their formats carry no letters, so raw IS the digit string); `custom` wants
 *  `formatRaw`, because a literal-terminated custom format (`##-END`) only carries its
 *  trailing literal once every fill position is full, and `formatRaw` is what tracks that
 *  -- `rawFromFormatted` gives raw characters only, with no literal reinsertion. */
export function canonicalize(p: MaskPattern, formatted: string, type: FieldSemanticType): string {
  const raw = rawFromFormatted(p, formatted);
  if (raw.length === 0) return '';
  return type === 'custom' ? formatRaw(p, raw) : raw;
}
