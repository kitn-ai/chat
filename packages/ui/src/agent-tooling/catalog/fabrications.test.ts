import { describe, expect, it } from 'vitest';
import derived from './derived.json';
import { Fabrication, listFabrications, type TFabrication } from './fabrications';

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

  // BOTH DIRECTIONS. The direction that rots is `invented`: the day the kit
  // ships a tag some agent once invented, the row becomes a lie on the one page
  // whose job is telling agents what is real.
  it('resolves every recorded row against the derived layer, in both directions', () => {
    for (const row of listFabrications()) {
      expect(realTags.has(row.invented), `${row.invented} is recorded as invented but the kit now SHIPS it — delete the row`).toBe(
        false,
      );
      if (row.useInstead) {
        expect(realTags.has(row.useInstead), `${row.useInstead} is offered as a replacement and does not exist`).toBe(true);
      }
    }
  });

  // POSITIVE CONTROL for the loop above. With zero rows it iterates zero times
  // and passes whatever the resolution rule is, so the rule is exercised here
  // against fixtures that make it fire in each direction.
  it('the resolution rule can actually see both failures', () => {
    const shipsItNow = { ...base, invented: 'kai-chat' };
    expect(realTags.has(shipsItNow.invented)).toBe(true); // would fail the record check

    const replacementMissing = { ...base, useInstead: 'kai-not-an-element' };
    expect(realTags.has(replacementMissing.useInstead)).toBe(false); // would fail the record check

    // And the honest row still resolves.
    expect(realTags.has(base.invented)).toBe(false);
    expect(realTags.has(base.useInstead!)).toBe(true);
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
