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

  it('layout enum: widget | fullscreen | aside | split', () => {
    for (const layout of ['widget', 'fullscreen', 'aside', 'split']) {
      expect(validateConstruct({ ...minimal, layout }).ok).toBe(true);
    }
    expect(validateConstruct({ ...minimal, layout: 'popup' }).ok).toBe(false);
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

  it('accepts starters and rejects an empty list', () => {
    expect(validateConstruct({ ...minimal, capabilities: { starters: ["Where's my order?"] } }).ok).toBe(true);
    expect(validateConstruct({ ...minimal, capabilities: { starters: [] } }).ok).toBe(false);
  });

  it('rejects more than 6 starters and an unknown capabilities key', () => {
    const tooMany = validateConstruct({
      ...minimal,
      capabilities: { starters: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] },
    });
    expect(tooMany.ok).toBe(false);
    const unknown = validateConstruct({ ...minimal, capabilities: { voice: true } });
    expect(unknown.ok).toBe(false);
  });

  it('attachments require a non-empty accept list (WHETHER stays with the author)', () => {
    expect(
      validateConstruct({ ...minimal, capabilities: { attachments: { accept: ['image/*'] } } }).ok,
    ).toBe(true);
    expect(validateConstruct({ ...minimal, capabilities: { attachments: {} } }).ok).toBe(false);
  });

  it('history: endpoint persistence requires a url, and url requires endpoint', () => {
    const cap = (history: unknown) => validateConstruct({ ...minimal, capabilities: { history } });
    expect(cap({ persistence: 'local' }).ok).toBe(true);
    expect(cap({ persistence: 'endpoint', url: '/api/thread' }).ok).toBe(true);
    expect(cap({ persistence: 'endpoint' }).ok).toBe(false);
    expect(cap({ persistence: 'local', url: '/api/thread' }).ok).toBe(false);
  });

  it('reasoning: accepts full/compact/off and defaults to full when omitted', () => {
    for (const reasoning of ['full', 'compact', 'off']) {
      expect(validateConstruct({ ...minimal, capabilities: { reasoning } }).ok).toBe(true);
    }
    const out = validateConstruct(minimal);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.construct.capabilities?.reasoning).toBeUndefined();

    const withEmptyCapabilities = validateConstruct({ ...minimal, capabilities: {} });
    expect(withEmptyCapabilities.ok).toBe(true);
    // No zod-level default: 'full' is applied by codegen (emitReasoningProp),
    // matching every sibling capability field's own optional-not-defaulted shape.
    if (withEmptyCapabilities.ok) expect(withEmptyCapabilities.construct.capabilities?.reasoning).toBeUndefined();
  });

  it('reasoning: rejects an unknown value', () => {
    const out = validateConstruct({ ...minimal, capabilities: { reasoning: 'verbose' } });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.problems.some((p) => p.path === 'capabilities.reasoning')).toBe(true);
  });

  it('cards: named entries with schema objects; bad tool names rejected', () => {
    const card = { name: 'refund_approval', schema: { type: 'object', properties: {} } };
    expect(validateConstruct({ ...minimal, cards: [card] }).ok).toBe(true);
    expect(validateConstruct({ ...minimal, cards: [{ ...card, name: 'Refund-Approval' }] }).ok).toBe(false);
  });

  it('cards: rejects an empty array and an unstructured schema', () => {
    expect(validateConstruct({ ...minimal, cards: [] }).ok).toBe(false);
    expect(
      validateConstruct({ ...minimal, cards: [{ name: 'refund_approval', schema: 'not-an-object' }] }).ok,
    ).toBe(false);
  });

  it('cards: rejects an unknown key on a card entry (vocabulary is closed)', () => {
    const out = validateConstruct({
      ...minimal,
      cards: [{ name: 'refund_approval', schema: { type: 'object' }, description: 'x' }],
    });
    expect(out.ok).toBe(false);
  });

  it('slots are named, kebab-case; custom layout requires them', () => {
    expect(validateConstruct({ ...minimal, slots: ['header'] }).ok).toBe(true);
    expect(validateConstruct({ ...minimal, slots: ['Header!'] }).ok).toBe(false);
    expect(validateConstruct({ ...minimal, layout: 'custom' }).ok).toBe(false);
    expect(validateConstruct({ ...minimal, layout: 'custom', slots: ['header', 'footer'] }).ok).toBe(true);
  });

  it('slots: rejects duplicates and an empty array', () => {
    expect(validateConstruct({ ...minimal, slots: ['header', 'header'] }).ok).toBe(false);
    expect(validateConstruct({ ...minimal, slots: [] }).ok).toBe(false);
  });

  it('slots: max 8', () => {
    const nine = Array.from({ length: 9 }, (_, i) => `slot-${i}`);
    expect(validateConstruct({ ...minimal, slots: nine }).ok).toBe(false);
    expect(validateConstruct({ ...minimal, slots: nine.slice(0, 8) }).ok).toBe(true);
  });
});

describe('widget (layout-scoped FAB chrome)', () => {
  it('accepts position + launcherIcon on layout: widget', () => {
    const out = validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
      widget: { position: 'top-start', launcherIcon: 'https://example.com/logo.png' },
    });
    expect(out.ok).toBe(true);
  });

  it('rejects widget on any non-widget layout', () => {
    const out = validateConstruct({
      name: 'acme-support', layout: 'fullscreen', provider: { mode: 'mock' },
      widget: { position: 'top-start' },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.problems.some((p) => p.path === 'widget')).toBe(true);
  });

  it('rejects an unknown position value', () => {
    const out = validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
      widget: { position: 'middle' },
    });
    expect(out.ok).toBe(false);
  });
});
