import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHAT_SLOTS,
  PROMPT_INPUT_SLOTS,
  PROMPT_INPUT_PARTS,
  MESSAGE_SLOTS,
  MESSAGE_PARTS,
  FILE_TREE_PARTS,
  NAV_PARTS,
  ELEMENT_COMPOSITION,
  readSlots,
} from './slots';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('CHAT_SLOTS registry', () => {
  it('lists the eight kai-chat slots, in order, with unique names', () => {
    expect(CHAT_SLOTS.map((s) => s.name)).toEqual([
      'header-start', 'header-end', 'header', 'sidebar',
      'empty', 'composer', 'composer-actions', 'footer',
    ]);
    const names = CHAT_SLOTS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('marks header, empty, and composer as replace slots', () => {
    expect(CHAT_SLOTS.filter((s) => s.mode === 'replace').map((s) => s.name))
      .toEqual(['header', 'empty', 'composer']);
  });

  it('every slot has a non-empty doc contract', () => {
    expect(CHAT_SLOTS.every((s) => s.doc.trim().length > 0)).toBe(true);
  });
});

describe('readSlots', () => {
  const host = (html: string): Element => {
    const el = document.createElement('kai-chat');
    el.innerHTML = html;
    return el;
  };

  it('reports false for every slot when nothing is projected', () => {
    const slots = readSlots(host(''));
    expect(Object.keys(slots)).toHaveLength(CHAT_SLOTS.length);
    expect(Object.values(slots).every((v) => v === false)).toBe(true);
  });

  it('detects direct children carrying a slot attribute', () => {
    const slots = readSlots(host('<nav slot="sidebar"></nav><footer slot="footer"></footer>'));
    expect(slots.sidebar).toBe(true);
    expect(slots.footer).toBe(true);
    expect(slots.header).toBe(false);
  });

  it('ignores nested (non-direct-child) slotted descendants', () => {
    const slots = readSlots(host('<div><span slot="sidebar"></span></div>'));
    expect(slots.sidebar).toBe(false);
  });
});

describe('PROMPT_INPUT_SLOTS registry', () => {
  it('lists the three prompt-input slots in order, with unique names', () => {
    expect(PROMPT_INPUT_SLOTS.map((s) => s.name)).toEqual([
      'input-top', 'toolbar-start', 'toolbar-end',
    ]);
    const names = PROMPT_INPUT_SLOTS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('marks all slots as inject mode', () => {
    expect(PROMPT_INPUT_SLOTS.every((s) => s.mode === 'inject')).toBe(true);
  });

  it('every slot has a non-empty doc contract', () => {
    expect(PROMPT_INPUT_SLOTS.every((s) => s.doc.trim().length > 0)).toBe(true);
  });
});

describe('PROMPT_INPUT_PARTS registry', () => {
  it('declares the send part (the styleable, non-slot surface), with unique names', () => {
    const names = PROMPT_INPUT_PARTS.map((p) => p.name);
    expect(names).toContain('send');
    expect(new Set(names).size).toBe(names.length);
  });

  it('every part has a non-empty doc contract', () => {
    expect(PROMPT_INPUT_PARTS.every((p) => p.doc.trim().length > 0)).toBe(true);
  });

  it('the send part documents the hide recipe (the dropped `never` case is pure CSS)', () => {
    const send = PROMPT_INPUT_PARTS.find((p) => p.name === 'send');
    expect(send?.recipe).toMatch(/::part\(send\)/);
    expect(send?.recipe).toMatch(/display:\s*none/);
  });
});

describe('MESSAGE_SLOTS registry', () => {
  it('lists the three message slots in order, with unique names', () => {
    expect(MESSAGE_SLOTS.map((s) => s.name)).toEqual([
      'before-body', 'after-body', 'avatar',
    ]);
    const names = MESSAGE_SLOTS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('marks before-body / after-body as inject and avatar as replace', () => {
    expect(MESSAGE_SLOTS.filter((s) => s.mode === 'inject').map((s) => s.name))
      .toEqual(['before-body', 'after-body']);
    expect(MESSAGE_SLOTS.filter((s) => s.mode === 'replace').map((s) => s.name))
      .toEqual(['avatar']);
  });

  it('exposes the avatar replace slot as a styleable part', () => {
    expect(MESSAGE_SLOTS.find((s) => s.name === 'avatar')?.part).toBe(true);
  });

  it('every slot has a non-empty doc contract', () => {
    expect(MESSAGE_SLOTS.every((s) => s.doc.trim().length > 0)).toBe(true);
  });
});

describe('MESSAGE_PARTS registry', () => {
  it('declares row / bubble / content / actions, with unique names', () => {
    const names = MESSAGE_PARTS.map((p) => p.name);
    expect(names).toEqual(['row', 'bubble', 'content', 'actions']);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every part has a non-empty doc contract', () => {
    expect(MESSAGE_PARTS.every((p) => p.doc.trim().length > 0)).toBe(true);
  });
});

describe('FILE_TREE_PARTS registry', () => {
  it('declares the changed-files diff parts, with unique names', () => {
    const names = FILE_TREE_PARTS.map((p) => p.name);
    expect(names).toEqual(['summary', 'status', 'stat-additions', 'stat-deletions']);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every part has a non-empty doc contract', () => {
    expect(FILE_TREE_PARTS.every((p) => p.doc.trim().length > 0)).toBe(true);
  });

  it('is wired into ELEMENT_COMPOSITION under kai-file-tree', () => {
    expect(ELEMENT_COMPOSITION['kai-file-tree'].parts).toBe(FILE_TREE_PARTS);
  });
});

describe('NAV_PARTS registry', () => {
  it('declares nav / item plus the nested-group + status parts, with unique names', () => {
    const names = NAV_PARTS.map((p) => p.name);
    expect(names).toEqual(['nav', 'item', 'group', 'chevron', 'status', 'meta', 'item-action']);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every part has a non-empty doc contract', () => {
    expect(NAV_PARTS.every((p) => p.doc.trim().length > 0)).toBe(true);
  });

  it('is wired into ELEMENT_COMPOSITION under kai-nav', () => {
    expect(ELEMENT_COMPOSITION['kai-nav'].parts).toBe(NAV_PARTS);
  });
});

describe('ELEMENT_COMPOSITION registry (single source of truth the build extracts)', () => {
  // Every `::part` a consumer can style is declared by writing `part="name"` in a
  // facade/component. The registry must name each one so docs + the kai MCP can
  // surface it; this guard fails the build if a part is added in code but not here.
  const PART_RE = /part="([a-z][a-z0-9-]*)"/g;

  function partNamesInSource(): Set<string> {
    const found = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(p);
          continue;
        }
        if (!entry.name.endsWith('.tsx') && !entry.name.endsWith('.ts')) continue;
        if (/\.(test|stories)\.tsx?$/.test(entry.name)) continue;
        // `ui/stat.tsx` is an internal-only SolidJS component — there is no
        // `kai-stat` web component, so its parts are intentionally unregistered.
        if (p.endsWith(join('ui', 'stat.tsx'))) continue;
        for (const m of readFileSync(p, 'utf8').matchAll(PART_RE)) found.add(m[1]);
      }
    };
    for (const d of ['elements', 'ui', 'components']) walk(join(HERE, '..', d));
    return found;
  }

  function registeredPartNames(): Set<string> {
    const out = new Set<string>();
    for (const def of Object.values(ELEMENT_COMPOSITION)) {
      for (const part of def.parts ?? []) out.add(part.name);
      for (const slot of def.slots ?? []) if (slot.part) out.add(slot.name);
    }
    return out;
  }

  it('registers every ::part declared anywhere in the source (drift guard)', () => {
    const inCode = partNamesInSource();
    const registered = registeredPartNames();
    expect(inCode.size).toBeGreaterThan(0); // sanity: the scan actually found parts
    const missing = [...inCode].filter((name) => !registered.has(name)).sort();
    expect(missing).toEqual([]);
  });

  it('maps each composable element to its slots/parts arrays', () => {
    expect(Object.keys(ELEMENT_COMPOSITION).sort()).toEqual([
      'kai-agent-card',
      'kai-attachments',
      'kai-audio-visualizer',
      'kai-badge',
      'kai-button',
      'kai-card',
      'kai-chat',
      'kai-coachmark',
      'kai-command',
      'kai-conversations',
      'kai-dialog',
      'kai-editable-label',
      'kai-file-tree',
      'kai-hover-card',
      'kai-icon',
      'kai-input',
      'kai-kbd',
      'kai-menu',
      'kai-message',
      'kai-nav',
      'kai-notice',
      'kai-pane',
      'kai-pane-group',
      'kai-progress-bar',
      'kai-prompt-dock',
      'kai-prompt-input',
      'kai-screen',
      'kai-scroll-area',
      'kai-search',
      'kai-segmented',
      'kai-separator',
      'kai-setting-item',
      'kai-settings-group',
      'kai-skeleton',
      'kai-status',
      'kai-tabs',
      'kai-thread',
      'kai-voice-output',
      'kai-workspace',
    ]);
    expect(ELEMENT_COMPOSITION['kai-chat'].slots).toBe(CHAT_SLOTS);
    expect(ELEMENT_COMPOSITION['kai-message'].slots).toBe(MESSAGE_SLOTS);
    expect(ELEMENT_COMPOSITION['kai-message'].parts).toBe(MESSAGE_PARTS);
    expect(ELEMENT_COMPOSITION['kai-prompt-input'].slots).toBe(PROMPT_INPUT_SLOTS);
    expect(ELEMENT_COMPOSITION['kai-prompt-input'].parts).toBe(PROMPT_INPUT_PARTS);
  });

  it('every registered part carries a non-empty doc contract', () => {
    for (const def of Object.values(ELEMENT_COMPOSITION)) {
      for (const part of def.parts ?? []) {
        expect(part.doc.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
