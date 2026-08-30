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

describe('capabilities.conversations (C-4)', () => {
  const base = { name: 'acme-support', layout: 'widget', provider: { mode: 'mock' } } as const;

  it('accepts conversations: true when history persistence is local', () => {
    const out = validateConstruct({
      ...base,
      capabilities: { conversations: true, history: { persistence: 'local' } },
    });
    expect(out.ok).toBe(true);
  });

  it('rejects conversations: true with no history persistence configured — loud, pathed', () => {
    const out = validateConstruct({ ...base, capabilities: { conversations: true } });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.problems.some((p) => p.path === 'capabilities.conversations')).toBe(true);
    }
  });

  it('rejects conversations: true with history.persistence "none"', () => {
    const out = validateConstruct({
      ...base,
      capabilities: { conversations: true, history: { persistence: 'none' } },
    });
    expect(out.ok).toBe(false);
  });

  it('rejects conversations: false — the vocabulary is presence-only, matching every other true-only capability flag in this schema', () => {
    const out = validateConstruct({ ...base, capabilities: { conversations: false } });
    expect(out.ok).toBe(false);
  });
});

describe('home (Intercom-style landing, H-1..H-5)', () => {
  const base = { name: 'acme-support', layout: 'widget', provider: { mode: 'mock' } } as const;

  it('home: {} is valid and every sub-key is optional (H-1, H-4)', () => {
    expect(validateConstruct({ ...base, home: {} }).ok).toBe(true);
    expect(
      validateConstruct({
        ...base,
        home: {
          greeting: { title: 'Hi', subtitle: 'There' },
          recentConversation: true,
          newConversation: { label: 'Message us' },
          links: [{ label: 'Docs', href: 'https://ui.kitn.ai', description: 'Guides', icon: 'book-open' }],
        },
      }).ok,
    ).toBe(true);
  });

  it('home.links[].href rejects javascript: (untrusted construct author)', () => {
    const out = validateConstruct({ ...base, home: { links: [{ label: 'x', href: 'javascript:alert(1)' }] } });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(JSON.stringify(out.problems)).toContain('links');
  });

  it('home.links[].icon: URL-shaped values go through isSafeUrl; names pass untouched', () => {
    expect(validateConstruct({ ...base, home: { links: [{ label: 'x', icon: 'book-open' }] } }).ok).toBe(true);
    expect(validateConstruct({ ...base, home: { links: [{ label: 'x', icon: 'javascript:alert(1)' }] } }).ok).toBe(
      false,
    );
  });

  it('home does NOT require conversations (H-3) — home without any capability parses', () => {
    expect(validateConstruct({ ...base, home: { recentConversation: true } }).ok).toBe(true);
  });

  it('unknown home keys are rejected (strict)', () => {
    expect(validateConstruct({ ...base, home: { search: true } }).ok).toBe(false);
  });

  it('rejects an empty greeting.title/subtitle and newConversation.label (min length 1)', () => {
    expect(validateConstruct({ ...base, home: { greeting: { title: '' } } }).ok).toBe(false);
    expect(validateConstruct({ ...base, home: { greeting: { subtitle: '' } } }).ok).toBe(false);
    expect(validateConstruct({ ...base, home: { newConversation: { label: '' } } }).ok).toBe(false);
  });

  it('rejects recentConversation: false — presence-only, matching capabilities.conversations', () => {
    expect(validateConstruct({ ...base, home: { recentConversation: false } }).ok).toBe(false);
  });

  it('links[].label is required; empty href is rejected (min length 1)', () => {
    expect(validateConstruct({ ...base, home: { links: [{ href: 'https://ui.kitn.ai' }] } }).ok).toBe(false);
    expect(validateConstruct({ ...base, home: { links: [{ label: 'x', href: '' }] } }).ok).toBe(false);
  });

  it('accepts an https icon and a relative icon URL (isSafeUrl resolves relative against a base)', () => {
    expect(validateConstruct({ ...base, home: { links: [{ label: 'x', icon: 'https://example.com/a.png' }] } }).ok).toBe(
      true,
    );
    expect(validateConstruct({ ...base, home: { links: [{ label: 'x', icon: '/a.png' }] } }).ok).toBe(true);
  });
});

describe('aside geometry (B-2)', () => {
  const asideBase = { name: 'acme-support', layout: 'aside', provider: { mode: 'mock' } } as const;

  it('accepts position + width on layout: aside', () => {
    expect(validateConstruct({ ...asideBase, aside: { position: 'start', width: '320px' } }).ok).toBe(true);
    expect(validateConstruct({ ...asideBase, aside: {} }).ok).toBe(true);
  });

  it('rejects aside on any non-aside layout — loud, pathed, mirroring widget', () => {
    const out = validateConstruct({ ...minimal, aside: { position: 'end' } }); // minimal is layout: widget
    expect(out.ok).toBe(false);
    if (!out.ok) {
      const p = out.problems.find((p) => p.path === 'aside');
      expect(p?.message).toBe('"aside" is only valid on layout: "aside"');
    }
  });

  it('rejects an unknown position and an unknown key (vocabulary is closed)', () => {
    expect(validateConstruct({ ...asideBase, aside: { position: 'left' } }).ok).toBe(false);
    expect(validateConstruct({ ...asideBase, aside: { height: '100px' } }).ok).toBe(false);
  });
});

describe('capabilities.messageActions (B-3)', () => {
  it('accepts ordered role arrays of enum ids', () => {
    expect(validateConstruct({
      ...minimal,
      capabilities: { messageActions: { user: ['edit', 'copy'], assistant: ['copy', 'like', 'dislike', 'speak'] } },
    }).ok).toBe(true);
  });

  it('rejects an off-list id — the enum reads the ONE const (B-6), so this is the whole drift test', () => {
    const out = validateConstruct({ ...minimal, capabilities: { messageActions: { assistant: ['share'] } } });
    expect(out.ok).toBe(false);
  });

  it('rejects a CustomAction object — enum ids ONLY, no dead affordances', () => {
    expect(validateConstruct({
      ...minimal,
      capabilities: { messageActions: { assistant: [{ id: 'x', label: 'X' }] } },
    }).ok).toBe(false);
  });

  it('rejects duplicate ids within one array, pathed to the duplicate (slots pattern)', () => {
    const out = validateConstruct({
      ...minimal,
      capabilities: { messageActions: { assistant: ['copy', 'like', 'copy'] } },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.problems.some((p) => p.path === 'capabilities.messageActions.assistant.2')).toBe(true);
  });

  it('does NOT reject the same id across the two roles (per-array rule only)', () => {
    expect(validateConstruct({
      ...minimal,
      capabilities: { messageActions: { user: ['copy'], assistant: ['copy'] } },
    }).ok).toBe(true);
  });

  it('rejects an empty role array (min 1 — an empty list is the absent key)', () => {
    expect(validateConstruct({ ...minimal, capabilities: { messageActions: { user: [] } } }).ok).toBe(false);
  });
});

describe('capabilities.sources (B-4)', () => {
  it('accepts strip true, strip false, and the bare object', () => {
    expect(validateConstruct({ ...minimal, capabilities: { sources: { strip: true } } }).ok).toBe(true);
    expect(validateConstruct({ ...minimal, capabilities: { sources: { strip: false } } }).ok).toBe(true);
    expect(validateConstruct({ ...minimal, capabilities: { sources: {} } }).ok).toBe(true);
  });
  it('rejects an unknown key (vocabulary is closed)', () => {
    expect(validateConstruct({ ...minimal, capabilities: { sources: { show: true } } }).ok).toBe(false);
  });
});

describe('header.themeToggle + header.actions (B-5)', () => {
  it('accepts themeToggle and variant-carrying actions on any layout', () => {
    expect(validateConstruct({
      ...minimal,
      header: { title: 'Acme', themeToggle: true, actions: [{ label: 'Docs', variant: 'ghost' }, { label: 'Share' }] },
    }).ok).toBe(true);
  });
  it('rejects an off-list variant — the enum reads BUTTON_VARIANT_NAMES (B-6a)', () => {
    expect(validateConstruct({ ...minimal, header: { actions: [{ label: 'X', variant: 'primary' }] } }).ok).toBe(false);
  });
  it('rejects an empty actions array and an empty label', () => {
    expect(validateConstruct({ ...minimal, header: { actions: [] } }).ok).toBe(false);
    expect(validateConstruct({ ...minimal, header: { actions: [{ label: '' }] } }).ok).toBe(false);
  });
});

describe('composer.triggers (B-5)', () => {
  it('accepts slash and mention entry lists of display data', () => {
    expect(validateConstruct({
      ...minimal,
      composer: { triggers: { slash: [{ id: 'help', label: 'Help', description: 'Show help' }], mention: [{ id: 'docs', label: 'Docs' }] } },
    }).ok).toBe(true);
  });
  it('rejects the kit-side TriggerItem fields (promptText/data/kind stay kit-side)', () => {
    expect(validateConstruct({
      ...minimal,
      composer: { triggers: { slash: [{ id: 'x', label: 'X', promptText: 'y' }] } },
    }).ok).toBe(false);
  });
  it('rejects an empty entry array and an unknown composer key', () => {
    expect(validateConstruct({ ...minimal, composer: { triggers: { slash: [] } } }).ok).toBe(false);
    expect(validateConstruct({ ...minimal, composer: { chips: [] } }).ok).toBe(false);
  });
});

describe('shell (B-5/10a)', () => {
  it('accepts commandPalette: true and a userMenu with name/plan', () => {
    expect(validateConstruct({
      ...minimal,
      shell: { commandPalette: true, userMenu: { name: 'Ada Lovelace', plan: 'Pro' } },
    }).ok).toBe(true);
    expect(validateConstruct({ ...minimal, shell: { userMenu: { name: 'Ada' } } }).ok).toBe(true);
  });
  it('rejects commandPalette: false — presence-only, matching conversations', () => {
    expect(validateConstruct({ ...minimal, shell: { commandPalette: false } }).ok).toBe(false);
  });
  it('rejects an empty name and an unknown shell key', () => {
    expect(validateConstruct({ ...minimal, shell: { userMenu: { name: '' } } }).ok).toBe(false);
    expect(validateConstruct({ ...minimal, shell: { search: true } }).ok).toBe(false);
  });
});

describe('CROSS_FIELD_RULES (B-20)', () => {
  it('is the exported, named-rule form of the superRefine body: sixteen rules, unique ids, in source order', async () => {
    const { CROSS_FIELD_RULES } = await import('./schema');
    const ids = CROSS_FIELD_RULES.map((r) => r.id);
    expect(ids).toEqual([
      'slots-unique',
      'custom-layout-needs-slots',
      'split-pane-slot-collision',
      'widget-layout-scope',
      'aside-layout-scope',
      'message-actions-unique',
      'launcher-icon-url',
      'empty-icon-url',
      'reasoning-open-scope',
      'conversations-need-history',
      'home-link-urls',
      'history-endpoint-url',
      'work-surface-layout-scope',
      'work-surface-url',
      'work-surface-code-url',
      'work-surface-code-view',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of CROSS_FIELD_RULES) expect(r.paths.length, r.id).toBeGreaterThan(0);
  });
});

describe('workSurface (2026-08-30 — the split pane gets vocabulary)', () => {
  const splitBase = { name: 'build-workspace', layout: 'split', provider: { mode: 'mock' } } as const;

  it('accepts the full shape on layout: split', () => {
    expect(
      validateConstruct({
        ...splitBase,
        workSurface: {
          kind: 'preview',
          url: '/work-surface.html',
          codeUrl: '/work-surface-source.html',
          chrome: { deviceToggle: true, urlBar: true, openInNewTab: true, expand: true, codeView: true },
        },
      }).ok,
    ).toBe(true);
  });

  it('accepts the minimum: kind + url', () => {
    expect(validateConstruct({ ...splitBase, workSurface: { kind: 'artifact', url: '/work-surface.html' } }).ok).toBe(true);
  });

  it('requires url — an optional url reproduces the empty pane this key exists to remove', () => {
    expect(validateConstruct({ ...splitBase, workSurface: { kind: 'artifact' } }).ok).toBe(false);
  });

  it('rejects an unknown kind and an unknown key at both levels (vocabulary is closed)', () => {
    expect(validateConstruct({ ...splitBase, workSurface: { kind: 'browser', url: '/x' } }).ok).toBe(false);
    expect(validateConstruct({ ...splitBase, workSurface: { kind: 'artifact', url: '/x', width: '50%' } }).ok).toBe(false);
    expect(validateConstruct({ ...splitBase, workSurface: { kind: 'artifact', url: '/x', chrome: { zoom: true } } }).ok).toBe(false);
  });

  it('rejects workSurface on every non-split layout — loud, pathed, mirroring widget/aside', () => {
    for (const layout of ['widget', 'fullscreen', 'aside', 'custom'] as const) {
      const out = validateConstruct({
        name: 'acme-support',
        layout,
        provider: { mode: 'mock' },
        ...(layout === 'custom' ? { slots: ['header'] } : {}),
        workSurface: { kind: 'artifact', url: '/work-surface.html' },
      });
      expect(out.ok, layout).toBe(false);
      if (!out.ok) {
        expect(out.problems.find((p) => p.path === 'workSurface')?.message).toBe(
          '"workSurface" is only valid on layout: "split"',
        );
      }
    }
  });

  it('rejects a javascript: url — it reaches an iframe src', () => {
    const out = validateConstruct({ ...splitBase, workSurface: { kind: 'artifact', url: 'javascript:alert(1)' } });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.problems.find((p) => p.path === 'workSurface.url')?.message).toBe(
        'url must be an http(s)/mailto or relative URL — no javascript:/data: schemes',
      );
    }
  });

  it('rejects a data: codeUrl — same sink, same policy', () => {
    const out = validateConstruct({
      ...splitBase,
      workSurface: { kind: 'artifact', url: '/x.html', codeUrl: 'data:text/html,<script>1</script>', chrome: { codeView: true } },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.problems.some((p) => p.path === 'workSurface.codeUrl')).toBe(true);
  });

  it('codeView without codeUrl is rejected — a tab with nothing behind it is a dead affordance', () => {
    const out = validateConstruct({ ...splitBase, workSurface: { kind: 'artifact', url: '/x.html', chrome: { codeView: true } } });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.problems.find((p) => p.path === 'workSurface.codeUrl')?.message).toBe(
        '"chrome.codeView" requires a codeUrl — the Code tab needs source to read',
      );
    }
  });

  it('codeUrl without codeView is rejected too — both directions loud, the history-endpoint-url precedent', () => {
    const out = validateConstruct({ ...splitBase, workSurface: { kind: 'artifact', url: '/x.html', codeUrl: '/src.html' } });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.problems.find((p) => p.path === 'workSurface.codeUrl')?.message).toBe(
        'codeUrl is only valid with "chrome.codeView": true',
      );
    }
  });
});
