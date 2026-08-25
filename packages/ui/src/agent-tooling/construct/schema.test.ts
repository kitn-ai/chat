import { describe, expect, it } from 'vitest';
import { validateConstruct } from './schema';

const minimal = {
  name: 'acme-support',
  layout: 'widget',
  provider: { mode: 'mock' },
};

describe('validateConstruct', () => {
  it('accepts the minimal widget construct', () => {
    const out = validateConstruct(minimal);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.construct.name).toBe('acme-support');
  });

  it('rejects a name that is not a valid custom-element tag', () => {
    // customElements.define requires a hyphen and lowercase; the emitted tag IS the name.
    const out = validateConstruct({ ...minimal, name: 'Support' });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.problems[0].path).toBe('name');
      expect(out.problems[0].message).toMatch(/custom-element/i);
    }
  });

  it('rejects unknown keys with the path named (vocabulary is closed)', () => {
    const out = validateConstruct({ ...minimal, onMessage: 'alert(1)' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.problems.map((p) => p.path)).toContain('onMessage');
  });

  it('accepts an endpoint provider and rejects a keyed one', () => {
    expect(
      validateConstruct({
        ...minimal,
        provider: { mode: 'endpoint', url: '/api/chat', wire: 'openai' },
      }).ok,
    ).toBe(true);
    // No client, no secrets: apiKey is not vocabulary, so strict() rejects it.
    const keyed = validateConstruct({
      ...minimal,
      provider: { mode: 'endpoint', url: '/api/chat', wire: 'openai', apiKey: 'sk-x' },
    });
    expect(keyed.ok).toBe(false);
  });

  it('problems carry dotted paths for nested failures', () => {
    const out = validateConstruct({ ...minimal, provider: { mode: 'endpoint' } });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.problems.some((p) => p.path.startsWith('provider'))).toBe(true);
  });
});
