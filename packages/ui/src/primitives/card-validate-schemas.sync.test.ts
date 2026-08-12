/**
 * Drift + coverage guard for the generated lean projection.
 *
 * Three separate properties, because each has failed independently in this repo's
 * history in one form or another:
 *
 *  1. SYNC. The committed src/primitives/card-validate-schemas.ts is exactly what
 *     scripts/gen-card-validation-schemas.mjs produces from the authored schemas
 *     right now. Edit confirm.schema.json without regenerating and this goes red.
 *
 *  2. COVERAGE. Every keyword at every keyword position in every card schema is in
 *     one of the generator's three tables. Add `"multipleOf": 2` to a card schema
 *     and the generator throws, naming the keyword and the file, which fails the
 *     BUILD (it runs in `prebuild`) as well as this test.
 *
 *  3. POSITION-AWARENESS. The projection strips `title`/`description`/`x-*` as
 *     KEYWORDS and never as property NAMES. `link.schema.json` has properties
 *     literally named `title` and `description`; `form.schema.json` has ones named
 *     `type`, `properties`, `required` and `x-kai-order`. A `delete obj[key]` pass
 *     would silently remove real card fields and the projection would then validate
 *     a different shape than the one we publish.
 *
 * The test imports the GENERATOR, not a re-implementation of it. A second copy of
 * the projection logic here would pass while the shipped one was broken.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CARD_TYPES,
  NOT_ENFORCED,
  OUT_FILE,
  STRIPPED,
  build,
  enforcedKeywords,
  projectSchema,
  scanUnclassified,
} from '../../scripts/gen-card-validation-schemas.mjs';
import { CARD_VALIDATION_SCHEMAS, VALIDATED_CARD_TYPES } from './card-validate-schemas';

describe('card-validate-schemas.ts is in sync with the authored schemas', () => {
  it('matches the generator output byte for byte', () => {
    const { source } = build();
    const committed = readFileSync(OUT_FILE, 'utf8');
    if (committed !== source) {
      throw new Error(
        'src/primitives/card-validate-schemas.ts is stale.\n' +
          'Fix: node scripts/gen-card-validation-schemas.mjs (or any build; it runs in prebuild).',
      );
    }
    expect(committed).toBe(source);
  });

  it('exports one projection per card-data schema, and no contract shapes', () => {
    expect([...VALIDATED_CARD_TYPES]).toEqual(CARD_TYPES);
    expect(Object.keys(CARD_VALIDATION_SCHEMAS).sort()).toEqual([...CARD_TYPES].sort());
    // The four contract documents are NOT card data: nothing dispatches on them, so
    // shipping them to the browser would be bytes the dispatcher can never use.
    for (const contract of ['card-envelope', 'card-event', 'form.result', 'tasks.result']) {
      expect(CARD_VALIDATION_SCHEMAS).not.toHaveProperty(contract);
    }
  });
});

describe('keyword coverage: nothing is silently skipped', () => {
  const enforced = enforcedKeywords();

  it('derives the enforced set from validateAgainstSchema, not from a hand list', () => {
    // If this ever reads as a plausible-looking list that does not match the
    // validator's body, the extraction has broken and the guard is blind.
    expect([...enforced].sort()).toEqual([
      'const', 'enum', 'exclusiveMaximum', 'exclusiveMinimum', 'items',
      'maxItems', 'maxLength', 'maximum', 'minItems', 'minLength', 'minimum',
      'pattern', 'properties', 'required', 'type', 'uniqueItems',
    ]);
  });

  it('the three tables are disjoint', () => {
    for (const k of Object.keys(STRIPPED)) expect(enforced.has(k), `${k} is both STRIPPED and enforced`).toBe(false);
    for (const k of Object.keys(NOT_ENFORCED)) {
      expect(enforced.has(k), `${k} is both NOT_ENFORCED and enforced`).toBe(false);
      expect(STRIPPED, `${k} is both NOT_ENFORCED and STRIPPED`).not.toHaveProperty(k);
    }
  });

  it('every NOT_ENFORCED entry carries a written reason, not a placeholder', () => {
    for (const [keyword, reason] of Object.entries(NOT_ENFORCED)) {
      expect(typeof reason, keyword).toBe('string');
      // A one-word "unsupported" is how a skip list gets in wearing a reason's
      // clothes. Require an actual sentence about what goes unchecked.
      expect(reason.length, `NOT_ENFORCED.${keyword} needs a real reason`).toBeGreaterThan(40);
      expect(reason.toUpperCase()).toContain('NOT');
    }
  });

  it('the authored schemas contain no unclassified keyword today', () => {
    expect(() => build()).not.toThrow();
  });

  it('FAILS on a keyword no table accounts for, naming it', () => {
    // The fail-first case from the plan, run as a test so it cannot rot: a numeric
    // constraint the validator does not implement and nobody has classified.
    const doc = { type: 'object', properties: { n: { type: 'integer', multipleOf: 2 } } };
    expect(scanUnclassified(doc, enforced)).toEqual([{ path: '(root).n', keyword: 'multipleOf' }]);
  });

  it('scans INSIDE the applicators the projection throws away', () => {
    // A `multipleOf` under `allOf`/`if` cannot affect validation, because the whole
    // subtree is dropped. It still has to be reported: whoever wrote it believed it
    // constrained the model's output, and this guard exists to correct that belief
    // at build time rather than in production.
    const doc = {
      type: 'object',
      properties: { p: { type: 'string' } },
      allOf: [{ if: { properties: { p: { const: 'x' } } }, then: { properties: { n: { multipleOf: 2 } } } }],
    };
    expect(scanUnclassified(doc, enforced)).toEqual([
      { path: '(root)/allOf[0]/then.n', keyword: 'multipleOf' },
    ]);
  });
});

describe('the projection strips keywords, never property names', () => {
  const enforced = enforcedKeywords();

  it('keeps `link` properties literally named title and description', () => {
    // Both are also annotation KEYWORDS. Stripping by name would delete two real
    // fields of every link-preview card.
    expect(CARD_VALIDATION_SCHEMAS.link.properties).toHaveProperty('title');
    expect(CARD_VALIDATION_SCHEMAS.link.properties).toHaveProperty('description');
    expect(CARD_VALIDATION_SCHEMAS.link.properties?.title).toEqual({ type: 'string', maxLength: 300 });
    // ...while the keyword-position `title`/`description`/`$id` are gone.
    expect(CARD_VALIDATION_SCHEMAS.link).not.toHaveProperty('title');
    expect(CARD_VALIDATION_SCHEMAS.link).not.toHaveProperty('description');
    expect(CARD_VALIDATION_SCHEMAS.link).not.toHaveProperty('$id');
  });

  it('keeps `form` properties named type, properties, required and x-kai-order', () => {
    const props = CARD_VALIDATION_SCHEMAS.form.properties!;
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining(['type', 'properties', 'required', 'x-kai-order', 'x-kai-actions']),
    );
    // The `x-kai-order` PROPERTY survives even though `x-*` KEYWORDS are stripped.
    expect(props['x-kai-order']).toEqual({ type: 'array', items: { type: 'string' } });
  });

  it('keeps `confirm`s property named default while dropping the `default` keyword', () => {
    const action = CARD_VALIDATION_SCHEMAS.confirm.properties!.actions!.items!;
    expect(action.properties).toHaveProperty('default');
    expect(action.properties!.default).toEqual({ type: 'boolean' });
    // `tone` carried `default: "default"` as a keyword; that is gone.
    expect(CARD_VALIDATION_SCHEMAS.confirm.properties!.tone).toEqual({
      type: 'string',
      enum: ['default', 'warning', 'danger'],
    });
  });

  it('drops a subschema that projects to nothing rather than shipping `{}`', () => {
    // `confirm.actions[].payload` is `{ description }` only: after projection there
    // is nothing left to check, and `walk()` would descend into it for no reason.
    const action = CARD_VALIDATION_SCHEMAS.confirm.properties!.actions!.items!;
    expect(action.properties).not.toHaveProperty('payload');
    expect(projectSchema({ description: 'prose only' }, enforced)).toBeUndefined();
  });

  it('carries no annotation or vendor keyword anywhere', () => {
    const seen = new Set<string>();
    const walk = (node: unknown): void => {
      if (typeof node !== 'object' || node === null || Array.isArray(node)) return;
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        seen.add(k);
        if (k === 'properties') {
          for (const child of Object.values(v as Record<string, unknown>)) walk(child);
        } else if (k === 'items') {
          walk(v);
        }
      }
    };
    for (const type of CARD_TYPES) walk(CARD_VALIDATION_SCHEMAS[type as keyof typeof CARD_VALIDATION_SCHEMAS]);
    // Property NAMES land in `seen` too (that is unavoidable without re-walking with
    // position awareness), so assert on the ones that are not property names in any
    // card schema: no card has a field called `$schema`, `$id` or `x-kai-control`.
    for (const stripped of ['$schema', '$id', 'x-kai-control', 'x-kai-unique', 'x-kai-format']) {
      expect(seen, `${stripped} survived the projection`).not.toContain(stripped);
    }
  });
});
