import { describe, expect, it } from 'vitest';
import { Scenario } from './catalog-types';
import { listScenarios, scenarios } from './scenarios';

describe('scenario deck', () => {
  it('carries exactly S1 through S7, in order', () => {
    expect(scenarios.map((s) => s.id)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
  });

  it('every scenario parses against the schema and has non-empty needs and scoring', () => {
    for (const s of listScenarios()) {
      expect(() => Scenario.parse(s)).not.toThrow();
      expect(s.needs.length).toBeGreaterThan(0);
      expect(s.scoring.length).toBeGreaterThan(0);
    }
  });

  it('S6 is the refusal scenario: its scoring demands a loud refusal, not output', () => {
    const s6 = listScenarios().find((s) => s.id === 'S6');
    expect(s6?.scoring.join(' ')).toMatch(/refus/i);
  });
});
