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

  it('reasoningOpen: accepted with reasoning full/omitted, rejected with compact/off', () => {
    expect(validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
      capabilities: { reasoningOpen: true },
    }).ok).toBe(true);
    expect(validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
      capabilities: { reasoning: 'full', reasoningOpen: true },
    }).ok).toBe(true);
    expect(validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
      capabilities: { reasoning: 'compact', reasoningOpen: true },
    }).ok).toBe(false);
    expect(validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
      capabilities: { reasoning: 'off', reasoningOpen: true },
    }).ok).toBe(false);
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

  it('slots: rejects "pane" on layout: split — collides with split\'s own fixed <slot name="pane">', () => {
    const out = validateConstruct({ ...minimal, layout: 'split', slots: ['pane'] });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.problems.some((p) => p.path === 'slots.0')).toBe(true);
  });

  it('slots: "pane" is fine on every other layout', () => {
    for (const layout of ['widget', 'fullscreen', 'aside']) {
      expect(validateConstruct({ ...minimal, layout, slots: ['pane'] }).ok).toBe(true);
    }
    expect(validateConstruct({ ...minimal, layout: 'custom', slots: ['pane'] }).ok).toBe(true);
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

  it('rejects a javascript: launcherIcon (same isSafeUrl policy as markdown/artifact image sinks)', () => {
    const out = validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
      widget: { launcherIcon: 'javascript:alert(1)' },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.problems.some((p) => p.path === 'widget.launcherIcon')).toBe(true);
  });

  it('accepts an https launcherIcon and a relative one (isSafeUrl resolves relative against a base)', () => {
    expect(
      validateConstruct({
        name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
        widget: { launcherIcon: 'https://example.com/logo.png' },
      }).ok,
    ).toBe(true);
    expect(
      validateConstruct({
        name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
        widget: { launcherIcon: '/logo.png' },
      }).ok,
    ).toBe(true);
  });

  it('accepts defaultOpen alongside position/launcherIcon', () => {
    const out = validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
      widget: { defaultOpen: true },
    });
    expect(out.ok).toBe(true);
  });
});

describe('header', () => {
  it('accepts a title on any layout', () => {
    const out = validateConstruct({
      name: 'acme-support', layout: 'fullscreen', provider: { mode: 'mock' },
      header: { title: 'Acme Support' },
    });
    expect(out.ok).toBe(true);
  });

  it('rejects an empty title (min length 1, same discipline as starters)', () => {
    const out = validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
      header: { title: '' },
    });
    expect(out.ok).toBe(false);
  });

  it('rejects an unknown key on header (vocabulary is closed)', () => {
    const out = validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
      header: { title: 'x', icon: 'https://example.com/a.png' },
    });
    expect(out.ok).toBe(false);
  });
});

describe('empty (welcome-screen greeting, Task 14)', () => {
  it('accepts a title-only block on any layout', () => {
    const out = validateConstruct({
      name: 'acme-support', layout: 'fullscreen', provider: { mode: 'mock' },
      empty: { title: 'Hi, welcome' },
    });
    expect(out.ok).toBe(true);
  });

  it('accepts title + description + an https icon', () => {
    const out = validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
      empty: { title: 'Hi', description: 'Ask us anything.', icon: 'https://example.com/icon.png' },
    });
    expect(out.ok).toBe(true);
  });

  it('rejects an empty title (min length 1, same discipline as header.title/starters)', () => {
    const out = validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
      empty: { title: '' },
    });
    expect(out.ok).toBe(false);
  });

  it('rejects an empty description', () => {
    const out = validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
      empty: { title: 'Hi', description: '' },
    });
    expect(out.ok).toBe(false);
  });

  it('requires title (title is not optional)', () => {
    const out = validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
      empty: { description: 'Ask us anything.' },
    });
    expect(out.ok).toBe(false);
  });

  it('rejects an unknown key on empty (vocabulary is closed)', () => {
    const out = validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
      empty: { title: 'x', subtitle: 'y' },
    });
    expect(out.ok).toBe(false);
  });

  it('rejects a javascript: icon (same isSafeUrl policy as widget.launcherIcon)', () => {
    const out = validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
      empty: { title: 'Hi', icon: 'javascript:alert(1)' },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.problems.some((p) => p.path === 'empty.icon')).toBe(true);
  });

  it('accepts an https icon and a relative one (isSafeUrl resolves relative against a base)', () => {
    expect(
      validateConstruct({
        name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
        empty: { title: 'Hi', icon: 'https://example.com/icon.png' },
      }).ok,
    ).toBe(true);
    expect(
      validateConstruct({
        name: 'acme-support', layout: 'widget', provider: { mode: 'mock' },
        empty: { title: 'Hi', icon: '/icon.png' },
      }).ok,
    ).toBe(true);
  });
});

describe('userId', () => {
  it('accepts a top-level userId independent of provider mode', () => {
    const out = validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' }, userId: 'user_123',
    });
    expect(out.ok).toBe(true);
  });

  it('rejects an empty userId', () => {
    const out = validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' }, userId: '',
    });
    expect(out.ok).toBe(false);
  });

  // Deviation from the brief: the brief's Step 1 only specified min(1) +
  // top-level placement. userId reaches an HTTP header value (x-kai-user-id)
  // as well as a JS string sink, and fetch() throws AT RUNTIME on a header
  // value containing CR/LF or a code point outside ISO-8859-1. Schema.ts
  // constrains userId to printable ASCII (no line breaks) so a bad value is
  // a loud validation-time rejection, not an opaque runtime crash in the
  // consumer's generated app. Covered here rather than left implicit.
  it('rejects a userId containing CR/LF (would break the emitted header value at runtime)', () => {
    const out = validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' }, userId: 'user\r\nX-Evil: 1',
    });
    expect(out.ok).toBe(false);
  });

  it('rejects a userId with a non-ISO-8859-1 code point (fetch() disallows it in a header value)', () => {
    const out = validateConstruct({
      name: 'acme-support', layout: 'widget', provider: { mode: 'mock' }, userId: 'user_\u{1F600}',
    });
    expect(out.ok).toBe(false);
  });
});
