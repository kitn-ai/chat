import { describe, expect, it } from 'vitest';
import derived from './derived.json';
import { Fabrication, listFabrications, resolveFabrications, type TFabrication } from './fabrications';

// The PAGE this record renders into is tested in tests/scripts/acceptance-eval.test.ts.
// It lives there and not here because the renderer is a .mjs build script, and
// the `src` typecheck pass has no `allowJs` — importing it from this file would
// make every call `any` under noImplicitAny, which is worse than the split.

const realTags = new Set(derived.elements.map((e) => e.tag));

/** A well-formed row, used as the base every negative case mutates one field of. */
const base: TFabrication = {
  invented: 'kai-datagrid',
  wanted: 'a spreadsheet grid message type',
  useInstead: 'kai-cards',
  firstSeen: '2026-08-17',
  scenario: 'S6',
  model: 'test-model',
};

describe('the fabrication record', () => {
  it('parses, and is empty until a run fills it', () => {
    const rows = listFabrications();
    expect(Array.isArray(rows)).toBe(true);
    // Not an assertion that it must STAY empty — it is a statement about today.
    // When the first run lands, this flips to a resolution check like the ones
    // below, which is why those are written over a fixture and not over `rows`.
    expect(rows).toHaveLength(0);
  });

  // BOTH DIRECTIONS, over the LIVE record. Today this iterates zero rows and so
  // proves nothing on its own — which is exactly why the rule itself is a named
  // function, exercised against fixtures in the test below. Deleting this
  // assertion used to leave the suite green.
  it('every recorded row resolves against the derived layer', () => {
    expect(resolveFabrications(listFabrications(), realTags)).toEqual([]);
  });

  // THE RULE ITSELF, made to fire. Previously this asserted `realTags.has(...)`,
  // which exercises the SET and not the RULE — it would have passed with the
  // resolution function deleted entirely.
  it('fires on a row whose invented tag the kit now SHIPS — the direction that rots', () => {
    const stale = { ...base, invented: 'kai-chat' };
    const problems = resolveFabrications([stale], realTags);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('SHIPS it now');
  });

  it('fires on a replacement the kit does not ship', () => {
    const problems = resolveFabrications([{ ...base, useInstead: 'kai-not-an-element' }], realTags);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('does not ship that either');
  });

  it('accepts an honest row, so the rule is not simply refusing everything', () => {
    expect(resolveFabrications([base], realTags)).toEqual([]);
    // Both halves of the honest row are real facts about the tree, not fixtures.
    expect(realTags.has(base.invented)).toBe(false);
    expect(realTags.has(base.useInstead!)).toBe(true);
  });

  it('refuses an empty known-tag set instead of reporting a clean record', () => {
    expect(resolveFabrications([base], [])).toHaveLength(1);
  });

  it('refuses a row that drops the replacement without saying why', () => {
    expect(() => Fabrication.parse({ ...base, useInstead: null })).toThrow(/noReplacementReason/);
    expect(() => Fabrication.parse({ ...base, useInstead: null, noReplacementReason: 'the kit has no grid' })).not.toThrow();
  });

  it('refuses a malformed tag or date rather than rendering it', () => {
    expect(() => Fabrication.parse({ ...base, invented: 'datagrid' })).toThrow();
    expect(() => Fabrication.parse({ ...base, firstSeen: 'August' })).toThrow();
  });
});
