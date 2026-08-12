/**
 * The two tiers, and the honesty of what they claim.
 *
 * The load-bearing property is that `hard` and `soft` are genuinely different
 * outcomes. A tiering where both paths do the same thing is a tiering in name only,
 * so every tier assertion here pins the OTHER tier as its control: the hard cases
 * assert `tier === 'hard'` and the soft cases assert `tier === 'soft'`, on payloads
 * that differ in exactly the constraint under test.
 *
 * The second half is the part that is easy to skip and matters most: this file also
 * asserts what is NOT enforced. `validateAgainstSchema` has no applicators and no
 * `additionalProperties`, so "the kit validates cards" is true for a listed set of
 * keywords and false for the rest. Those cases are written down as passing
 * validations, not omitted, so that anyone who implements one of them has a test
 * that goes red and tells them to update the claim.
 */
import { describe, it, expect } from 'vitest';
import { validateAgainstSchema } from './card-validate';
import {
  CARD_VALIDATION_SCHEMAS,
  TIERS_BY_KEYWORD,
  cardValidationMessage,
  isValidatedCardType,
  validateCardData,
} from './card-validate-cards';
import { loadGenerator } from './card-validate-generator.testlib';

// The keyword set the validator actually implements, read out of its own body by the
// generator. Imported rather than restated so the coverage assertions below cannot
// drift from what `validateAgainstSchema` does.
const enforcedKeywords = (await loadGenerator()).enforcedKeywords;

const okConfirm = {
  body: 'Deploy to production?',
  actions: [{ id: 'go', label: 'Deploy', style: 'primary' }],
};

describe('validateCardData', () => {
  it('passes a well-formed confirm card', () => {
    const report = validateCardData('confirm', okConfirm)!;
    expect(report.ok).toBe(true);
    expect(report.tier).toBe('ok');
    expect(report.issues).toEqual([]);
  });

  it('returns null for a type with no built-in schema', () => {
    // Not an empty pass. "There was nothing to check" must stay distinguishable
    // from "we checked and it was fine", or a caller reports the second as the first.
    expect(validateCardData('my-pricing-table', { anything: true })).toBeNull();
    expect(isValidatedCardType('my-pricing-table')).toBe(false);
    expect(isValidatedCardType('confirm')).toBe(true);
  });

  it('covers all 7 built-in card types', () => {
    for (const type of ['artifact', 'choice', 'confirm', 'embed', 'form', 'link', 'tasks']) {
      expect(validateCardData(type, {}), type).not.toBeNull();
    }
  });
});

describe('HARD: the card has nothing to render', () => {
  it('a missing required property is hard, and names the path', () => {
    const report = validateCardData('confirm', { body: 'no actions here' })!;
    expect(report.tier).toBe('hard');
    expect(report.hard).toHaveLength(1);
    expect(report.hard[0]?.keyword).toBe('required');
    expect(report.summary).toBe('(root).actions: required');
    expect(cardValidationMessage(report)).toBe('invalid card data (hard): (root).actions: required');
  });

  it('a wrong type is hard', () => {
    const report = validateCardData('confirm', { actions: 'Deploy' })!;
    expect(report.tier).toBe('hard');
    expect(report.hard[0]?.keyword).toBe('type');
    expect(report.summary).toContain('(root).actions: expected array, got string');
  });

  it('an empty required collection is hard, and this is the plan\'s headline case', () => {
    // `{ actions: [] }` is the corrupted-fixture shape S19b replays. It is the one
    // that today renders a confirm card with empty chrome and no signal at all.
    const report = validateCardData('confirm', { body: 'Deploy?', actions: [] })!;
    expect(report.tier).toBe('hard');
    expect(report.hard[0]?.keyword).toBe('minItems');
    expect(report.summary).toBe('(root).actions: fewer than minItems 1');
  });

  it('a wrong const discriminator is hard', () => {
    const report = validateCardData('form', { type: 'array', properties: {} })!;
    expect(report.tier).toBe('hard');
    expect(report.hard[0]?.keyword).toBe('const');
  });

  it('a hard issue wins over soft issues in the same payload', () => {
    const report = validateCardData('confirm', {
      actions: [{ id: 'a', label: 'x'.repeat(5) }, { id: 'b', label: 'y' }, { id: 'c', label: 'z' },
                { id: 'd', label: 'w' }, { id: 'e', label: 'v' }], // maxItems 4 → soft
      tone: 'purple', // enum → soft
      dismissible: 'yes', // type → HARD
    })!;
    expect(report.tier).toBe('hard');
    // The summary shows the HARD issues, because those are what stopped the render.
    expect(report.summary).toContain('dismissible');
    expect(report.summary).not.toContain('purple');
    expect(report.issues.some((i) => i.tier === 'soft')).toBe(true);
  });
});

describe('SOFT: the card renders, the bounds do not hold', () => {
  it('too many actions is soft, NOT hard', () => {
    // The control for the hard cases above: same card, same field, one keyword
    // apart, opposite tier. Five buttons render fine; zero do not.
    const report = validateCardData('confirm', {
      actions: [1, 2, 3, 4, 5].map((n) => ({ id: `a${n}`, label: `Action ${n}` })),
    })!;
    expect(report.ok).toBe(false);
    expect(report.tier).toBe('soft');
    expect(report.hard).toEqual([]);
    expect(report.issues[0]?.keyword).toBe('maxItems');
    expect(cardValidationMessage(report)).toBe('invalid card data (soft): (root).actions: more than maxItems 4');
  });

  it('an over-long string is soft', () => {
    const report = validateCardData('link', { url: 'https://example.com', title: 'x'.repeat(400) })!;
    expect(report.tier).toBe('soft');
    expect(report.issues[0]?.keyword).toBe('maxLength');
  });

  it('an unknown enum value is soft: the card falls back to its default variant', () => {
    const report = validateCardData('confirm', { ...okConfirm, tone: 'chartreuse' })!;
    expect(report.tier).toBe('soft');
    expect(report.issues[0]?.keyword).toBe('enum');
  });

  it('a blank label is soft while an empty action LIST is hard', () => {
    // The judgement call, pinned. One blank label leaves a working button; an empty
    // list leaves a decision card with no decisions. Replacing the whole card over
    // the first would be the regression the tiering exists to avoid.
    expect(validateCardData('confirm', { actions: [{ id: 'a', label: '' }] })!.tier).toBe('soft');
    expect(validateCardData('confirm', { actions: [] })!.tier).toBe('hard');
  });

  it('a pattern miss is soft', () => {
    const report = validateCardData('embed', { provider: 'youtube', id: 'not a valid id!' })!;
    expect(report.tier).toBe('soft');
    expect(report.issues[0]?.keyword).toBe('pattern');
  });
});

describe('the tier table covers the validator', () => {
  it('tiers every keyword validateAgainstSchema can report', () => {
    // Without this, adding a check to the validator silently lands in the soft
    // default and nobody decides which tier it belongs to. Structural, not a list:
    // the keyword set is read out of the validator's own body.
    const structural = new Set(['properties', 'items']); // never reported on their own
    const reportable = [...enforcedKeywords()].filter((k) => !structural.has(k));
    for (const keyword of reportable) {
      expect(TIERS_BY_KEYWORD, `${keyword} is enforced but not tiered`).toHaveProperty(keyword);
    }
  });

  it('tiers nothing the validator cannot report', () => {
    const enforced = enforcedKeywords();
    for (const keyword of Object.keys(TIERS_BY_KEYWORD)) {
      expect(enforced.has(keyword), `${keyword} is tiered but nothing enforces it`).toBe(true);
    }
  });

  it('uses BOTH tiers', () => {
    const tiers = new Set(Object.values(TIERS_BY_KEYWORD));
    expect(tiers).toEqual(new Set(['hard', 'soft']));
  });
});

describe('what is NOT enforced, stated as tests rather than left implicit', () => {
  it('does NOT catch an embed missing both id and url (allOf + if)', () => {
    // embed's entire provider/url contract lives in `allOf` + `if`/`then`, which
    // this validator has no applicators for. The card renders an empty player.
    expect(validateCardData('embed', { provider: 'youtube' })!.ok).toBe(true);
    expect(validateCardData('embed', { provider: 'generic' })!.ok).toBe(true);
  });

  it('does NOT catch an artifact with neither src nor files (anyOf)', () => {
    expect(validateCardData('artifact', {})!.ok).toBe(true);
  });

  it('does NOT catch an artifact height of the wrong type (oneOf)', () => {
    // `height` is `oneOf: [number, string]` and nothing else, so the whole subschema
    // drops out of the projection: there is not even a `type` left to check.
    expect(validateCardData('artifact', { src: 'https://example.com', height: true })!.ok).toBe(true);
    expect(CARD_VALIDATION_SCHEMAS.artifact.properties).not.toHaveProperty('height');
  });

  it('does NOT catch a link.url that is not a URL (format)', () => {
    expect(validateCardData('link', { url: 'not a url at all' })!.ok).toBe(true);
  });

  it('does NOT catch an undeclared extra property (additionalProperties)', () => {
    // `link` sets `additionalProperties: false`. Nothing enforces it, so the
    // plan's "soft: an unknown property" tier case does not exist in this build.
    expect(validateCardData('link', { url: 'https://example.com', bogus: 1 })!.ok).toBe(true);
  });
});

describe('the projection behaves identically to the authored schema on the keywords it keeps', () => {
  it('agrees with the authored confirm schema on a valid and an invalid payload', async () => {
    // Guards the projection against having dropped a keyword it claims to keep. If
    // these ever disagree, the lean copy is validating a different shape than the
    // one we publish at @kitn.ai/ui/schemas.
    const authored = (await import('./card-schemas/confirm.schema.json')).default;
    for (const payload of [okConfirm, { actions: [] }, { body: 'x' }, { ...okConfirm, tone: 'nope' }]) {
      const a = validateAgainstSchema(authored as never, payload);
      const p = validateAgainstSchema(CARD_VALIDATION_SCHEMAS.confirm, payload);
      expect(p.errors, JSON.stringify(payload)).toEqual(a.errors);
    }
  });
});
