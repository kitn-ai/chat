/**
 * B-21: the construct itself IS the form state — this module supplies the
 * path-based reads/writes the derived panel edits through. The registry
 * starters are the free round-trip corpus: a no-op edit on every manifest
 * path must be byte-identical (JSON.stringify), which is what "construct →
 * form → construct byte-identical" means when the form holds no copy.
 */
import { describe, expect, it } from 'vitest';
import { CROSS_FIELD_RULES, validateConstruct, type Construct } from '../agent-tooling/construct/schema';
import { buildableTemplates } from '../agent-tooling/construct/templates';
import {
  getAtPath,
  setAtPath,
  deleteAtPath,
  readPresenceBoolean,
  writePresenceBoolean,
  PRESENCE_BOOLEAN_PATHS,
  derivePresenceBooleanPaths,
  ANCHORED_BOOLEAN_DEFAULTS,
  readAnchoredBoolean,
  schemaNodeAt,
  controlKindFor,
  RULE_VISIBILITY,
} from './construct-form-paths';

const starterCases = buildableTemplates().flatMap((t) => [
  { label: t.id, template: t, starter: t.starter },
  ...(t.variants ?? []).map((v) => ({ label: `${t.id}.${v.id}`, template: t, starter: v.starter })),
]);

describe('round-trips over the registry corpus (B-21)', () => {
  it('has a corpus, so the loops below are not vacuous', () => {
    expect(starterCases.length).toBeGreaterThan(0);
  });

  for (const { label, template, starter } of starterCases) {
    it(`${label}: a no-op edit on every manifest path is byte-identical`, () => {
      for (const path of template.controls.flatMap((s) => s.paths)) {
        const cur = getAtPath(starter, path);
        const next = cur === undefined ? deleteAtPath(starter, path) : setAtPath(starter, path, cur);
        expect(JSON.stringify(next), path).toBe(JSON.stringify(starter));
      }
    });
  }

  it('deleteAtPath of an absent key is reference identity — no phantom prune', () => {
    const widget = buildableTemplates().find((t) => t.id === 'widget')!.starter;
    expect(deleteAtPath(widget, 'widget.launcherIcon')).toBe(widget);
    expect(deleteAtPath(widget, 'shell.userMenu')).toBe(widget);
  });
});

describe('delete-on-empty (B-21)', () => {
  const assistant = buildableTemplates().find((t) => t.id === 'assistant')!.starter;

  it('an empty starters list deletes the key — the schema min(1) demands it', () => {
    const next = setAtPath(assistant, 'capabilities.starters', []);
    expect(getAtPath(next, 'capabilities.starters')).toBeUndefined();
    expect(validateConstruct(next).ok).toBe(true);
  });

  it('emptying the last member of an object prunes the object itself', () => {
    // Build a construct whose capabilities holds only starters, then empty it.
    const base = validateConstruct({
      name: 'acme-x', layout: 'fullscreen', provider: { mode: 'mock' },
      capabilities: { starters: ['hi'] },
    });
    if (!base.ok) throw new Error('fixture invalid');
    const next = setAtPath(base.construct, 'capabilities.starters', []);
    expect(getAtPath(next, 'capabilities')).toBeUndefined();
  });

  it('an empty string deletes the key (all schema strings are min(1))', () => {
    const next = setAtPath(assistant, 'header.title', '');
    expect(getAtPath(next, 'header.title')).toBeUndefined();
    // The assistant starter's header also carries themeToggle (2026-08-30
    // default-on round), so the parent legitimately survives — pruning is
    // proven below on a header whose title really IS its only member.
    expect(getAtPath(next, 'header')).toEqual({ themeToggle: true });
  });

  it('emptying a header whose title is its only member prunes the header itself', () => {
    const base = validateConstruct({
      name: 'acme-y', layout: 'fullscreen', provider: { mode: 'mock' },
      header: { title: 'Hi' },
    });
    if (!base.ok) throw new Error('fixture invalid');
    const next = setAtPath(base.construct, 'header.title', '');
    expect(getAtPath(next, 'header')).toBeUndefined();
  });
});

describe('presence-as-boolean (B-21)', () => {
  const widget = buildableTemplates().find((t) => t.id === 'widget')!.starter;

  it('the module list matches the schema-derived z.literal(true) leaves — the drift check', () => {
    expect([...PRESENCE_BOOLEAN_PATHS].sort()).toEqual(derivePresenceBooleanPaths().sort());
  });

  it('on sets literal true; off deletes the key, never writes false', () => {
    expect(readPresenceBoolean(widget, 'capabilities.conversations')).toBe(true);
    const off = writePresenceBoolean(widget, 'capabilities.conversations', false);
    expect(getAtPath(off, 'capabilities.conversations')).toBeUndefined();
    const on = writePresenceBoolean(off, 'capabilities.conversations', true);
    expect(getAtPath(on, 'capabilities.conversations')).toBe(true);
  });
});

describe('default-anchored booleans (B-4/B-21)', () => {
  it('sources.strip anchors to true: absent reads ON; writes are always explicit (stating the default is legal — Research does)', () => {
    expect(ANCHORED_BOOLEAN_DEFAULTS['capabilities.sources.strip']).toBe(true);
    const widget = buildableTemplates().find((t) => t.id === 'widget')!.starter;
    expect(readAnchoredBoolean(widget, 'capabilities.sources.strip')).toBe(true); // absent
    const research = buildableTemplates().find((t) => t.id === 'research')!.starter;
    expect(readAnchoredBoolean(research, 'capabilities.sources.strip')).toBe(true); // stated
  });
});

describe('schema walk (B-19 groundwork)', () => {
  it('every registry control path resolves in ConstructSchema.shape — a renamed path goes red here', () => {
    for (const t of buildableTemplates())
      for (const s of t.controls)
        for (const p of s.paths) expect(schemaNodeAt(p), `${t.id}/${s.id}/${p}`).toBeDefined();
  });

  it('classifies representative nodes', () => {
    expect(controlKindFor(schemaNodeAt('layout')!)).toEqual({ kind: 'enum', options: ['widget', 'fullscreen', 'aside', 'split', 'custom'] });
    expect(controlKindFor(schemaNodeAt('header.themeToggle')!)).toEqual({ kind: 'boolean' });
    expect(controlKindFor(schemaNodeAt('shell.commandPalette')!)).toEqual({ kind: 'presence' });
    expect(controlKindFor(schemaNodeAt('aside.width')!)).toEqual({ kind: 'string' });
    expect(controlKindFor(schemaNodeAt('capabilities.starters')!)).toEqual({ kind: 'string-list' });
    expect(controlKindFor(schemaNodeAt('header.actions')!)).toEqual({ kind: 'complex' });
    expect(controlKindFor(schemaNodeAt('provider')!)).toEqual({ kind: 'complex' });
    const home = controlKindFor(schemaNodeAt('home')!);
    expect(home.kind).toBe('section');
  });
});

describe('RULE_VISIBILITY (B-20 — the key-set-equality drift guard)', () => {
  it('classifies exactly the CROSS_FIELD_RULES ids — a new rule fails until the builder classifies it', () => {
    expect(Object.keys(RULE_VISIBILITY).sort()).toEqual(CROSS_FIELD_RULES.map((r) => r.id).sort());
  });

  it('the two settled treatments carry their targets', () => {
    expect(RULE_VISIBILITY['widget-layout-scope']).toEqual({ treatment: 'hide-section', section: 'widget', layout: 'widget' });
    expect(RULE_VISIBILITY['aside-layout-scope']).toEqual({ treatment: 'hide-section', section: 'aside', layout: 'aside' });
    expect(RULE_VISIBILITY['work-surface-layout-scope']).toEqual({
      treatment: 'hide-section',
      section: 'workSurface',
      layout: 'split',
    });
    expect(RULE_VISIBILITY['work-surface-code-view'].treatment).toBe('show-requires');
    expect(RULE_VISIBILITY['conversations-need-history'].treatment).toBe('disable-with-reason');
    expect(RULE_VISIBILITY['reasoning-open-scope'].treatment).toBe('disable-with-reason');
    expect(RULE_VISIBILITY['history-endpoint-url'].treatment).toBe('show-requires');
  });

  it('every hide-section rule states a layout that is a real layout enum member — a section id is NOT a layout', () => {
    const layouts = (schemaNodeAt('layout') as unknown as { options: readonly string[] }).options;
    for (const [id, vis] of Object.entries(RULE_VISIBILITY)) {
      if (vis.treatment !== 'hide-section') continue;
      expect(layouts, `${id} scopes to a layout that does not exist`).toContain(vis.layout);
    }
  });
});
