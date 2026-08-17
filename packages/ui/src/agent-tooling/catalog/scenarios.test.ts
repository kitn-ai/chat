import { describe, expect, it } from 'vitest';
import { Scenario } from './catalog-types';
import { listScenarios, scenarios } from './scenarios';

describe('scenario deck', () => {
  it('carries exactly S1 through S7, in order', () => {
    expect(scenarios.map((s) => s.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
  });

  it('every scenario parses against the schema and has non-empty needs and scoring', () => {
    // The count assertions are what stop this passing vacuously: `listScenarios()`
    // has ALREADY run `z.array(Scenario).parse`, so on an empty or unparseable
    // deck the loop body simply never executes and every expect() inside it is
    // skipped. Pinning the parsed count to the authored count, and both above
    // zero, makes "nothing was checked" a failure rather than a pass.
    const parsed = listScenarios();
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed.length).toBe(scenarios.length);
    for (const s of parsed) {
      expect(s.needs.length).toBeGreaterThan(0);
      expect(s.scoring.length).toBeGreaterThan(0);
      // zod STRIPS unknown keys, so a field dropped from the schema would be
      // silently absent from what Tasks 8 and 9 receive. Assert it survived.
      expect(s.depth.length).toBeGreaterThan(0);
    }
  });

  it('S6 is the refusal scenario: its scoring demands a loud refusal, not output', () => {
    const s6 = listScenarios().find((s) => s.id === 'S6');
    expect(s6?.scoring.join(' ')).toMatch(/refus/i);
  });
});

/**
 * The assertions above check the DECK'S DATA and cannot detect a WEAKENED SCHEMA:
 * delete `depth` from `Scenario`, or drop its `.min(1)` constraints, and every
 * one of them stays green. These drive `Scenario.parse` with hand-built INVALID
 * objects instead of deck members, so they fail when a constraint goes missing.
 */
describe('scenario schema, driven with hand-built objects', () => {
  const valid = { id: 'S1', prompt: 'p', needs: ['n'], depth: 'd', scoring: ['s'] };

  const without = (key: string): Record<string, unknown> => {
    const rest: Record<string, unknown> = { ...(valid as Record<string, unknown>) };
    delete rest[key];
    return rest;
  };

  it('parses a valid hand-built scenario', () => {
    // POSITIVE CONTROL: without this, a schema that rejected everything would
    // satisfy all four negative cases below.
    expect(() => Scenario.parse(valid)).not.toThrow();
  });

  it('rejects a scenario with no depth', () => {
    expect(() => Scenario.parse(without('depth'))).toThrow();
  });

  it('rejects an empty needs array', () => {
    expect(() => Scenario.parse({ ...valid, needs: [] })).toThrow();
  });

  it('rejects an empty scoring array', () => {
    expect(() => Scenario.parse({ ...valid, scoring: [] })).toThrow();
  });

  it('rejects an id outside S1 through S7', () => {
    expect(() => Scenario.parse({ ...valid, id: 'S99' })).toThrow();
  });
});
