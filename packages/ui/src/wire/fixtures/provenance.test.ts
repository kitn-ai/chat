import { describe, expect, it } from 'vitest';
import { ANTHROPIC_FIXTURES } from './anthropic';
import { OPENAI_FIXTURES } from './openai';

const REQUIRED = ['fixture', 'capture', 'provider', 'model', 'captured', 'request'];

function header(sse: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of sse.split('\n')) {
    if (!line.startsWith(': ')) break;
    const at = line.indexOf(':', 2);
    if (at === -1) continue;
    out[line.slice(2, at).trim()] = line.slice(at + 1).trim();
  }
  return out;
}

const ALL: Array<[string, string]> = [
  ...Object.entries(OPENAI_FIXTURES).map(([k, v]): [string, string] => [`openai/${k}`, v]),
  ...Object.entries(ANTHROPIC_FIXTURES).map(([k, v]): [string, string] => [`anthropic/${k}`, v]),
];

describe('captured fixture provenance', () => {
  it('finds fixtures for both providers', () => {
    expect(Object.keys(OPENAI_FIXTURES).length).toBeGreaterThan(0);
    expect(Object.keys(ANTHROPIC_FIXTURES).length).toBeGreaterThan(0);
  });

  it.each(ALL)('%s carries a complete provenance header', (name, sse) => {
    const h = header(sse);
    for (const key of REQUIRED) expect(h[key], `${name} is missing ": ${key}:"`).toBeTruthy();
    expect(h.fixture).toBe(name);
    expect(['live', 'synthetic']).toContain(h.capture);
    expect(h.captured).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The request body is what makes the capture reproducible.
    expect(() => JSON.parse(h.request)).not.toThrow();
    if (h.capture === 'synthetic') {
      expect(h.source, `${name} is synthetic and must cite the doc it was written from`).toBeTruthy();
    }
  });

  it.each(ALL)('%s contains no API key material', (_name, sse) => {
    expect(sse).not.toMatch(/sk-[A-Za-z0-9_-]{10,}/);
    expect(sse).not.toMatch(/x-api-key/i);
    expect(sse).not.toMatch(/authorization/i);
  });

  it.each(ALL)('%s has at least one data frame after its header', (_name, sse) => {
    expect(sse).toMatch(/\ndata: /);
  });
});
