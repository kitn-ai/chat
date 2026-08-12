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
  it('declares row / bubble / content / actions / citations, with unique names', () => {
    const names = MESSAGE_PARTS.map((p) => p.name);
    expect(names).toEqual(['row', 'bubble', 'content', 'actions', 'citations']);
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
  // Every `::part` a consumer can style is declared by writing `part="name"`
  // (or, for a value that toggles, `part={lit ? 'name modifier' : 'name'}`)
  // in a facade/component. The registry must name each one so docs + the kai
  // MCP can surface it; this guard fails the build if a part is added in
  // code but not here.
  //
  // `part` is a space-separated TOKEN LIST (like `class`), so ONE attribute
  // can declare more than one name -- `part="bubble content"` is TWO parts,
  // not one -- and it can be built dynamically, e.g.
  // `part={highlighted() ? 'bar highlighted' : 'bar'}`, which is how the
  // audio-visualizer variants expose their lit state: `::part()` cannot be
  // followed by a `[data-*]` attribute selector, so a second part TOKEN is
  // the only way to select the lit state from outside the shadow root. Both
  // shapes must be visible to this scan, or it reports success while
  // covering nothing for whichever files use them -- which is exactly what
  // happened here: a plain `/part="([a-z][a-z0-9-]*)"/g` regex cannot match
  // either the dynamic form OR a multi-token static value (no whitespace is
  // in that character class), so it silently stopped seeing `bar`/`cell`
  // once the audio-visualizer variants switched to the dynamic form, and it
  // had ALREADY never seen `content` in message.tsx's pre-existing
  // `part="bubble content"` for the same reason.
  //
  // A dynamic `part={...}` value is not reliably parseable as an arbitrary
  // JS expression with a regex, so this does not try to evaluate it: it
  // scans for STRING LITERALS inside the balanced `{...}` that follows
  // `part=`, and treats each one as a candidate part-token string -- which
  // is exactly the shape every `part={...}` in this codebase that declares a
  // NEW name actually uses (a ternary between string literals). A bare
  // passthrough like `part={props.part}` has no string literal inside it, so
  // it contributes nothing here; whoever supplies that prop with a literal
  // value elsewhere in the tree is what the scan sees for that part name.
  const STATIC_PART_RE = /\bpart="([a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*)*)"/g;
  const DYNAMIC_PART_START_RE = /\bpart=\{/g;
  const STRING_LITERAL_RE = /'([^']*)'|"([^"]*)"/g;
  const TOKEN_RE = /^[a-z][a-z0-9-]*$/;

  /** Every space-separated token from every string literal inside the
   *  balanced `{...}` that opens at `openBraceIndex` (the index of that
   *  `{` itself). Brace-balanced rather than regex-bounded, so a nested `?:`
   *  or object literal inside the expression cannot truncate the scan
   *  early or run it past the attribute's actual end. */
  function tokensInDynamicPart(source: string, openBraceIndex: number): string[] {
    let depth = 1;
    let i = openBraceIndex + 1;
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') depth--;
      i++;
    }
    const expr = source.slice(openBraceIndex + 1, i - 1);
    const tokens: string[] = [];
    for (const m of expr.matchAll(STRING_LITERAL_RE)) {
      const literal = m[1] ?? m[2] ?? '';
      tokens.push(...literal.split(/\s+/).filter((t) => TOKEN_RE.test(t)));
    }
    return tokens;
  }

  const SRC = join(HERE, '..');

  // The scan walks ALL of `src/` and skips a DENYLIST, rather than walking an
  // allowlist of roots. An allowlist silently drops any top-level directory
  // nobody remembered to add, which is exactly how a `part="card artifact"`
  // living in `primitives/` stayed invisible until the file happened to MOVE
  // into `components/` -- the guard reported success the whole time while
  // covering nothing for that directory. A denylist fails the other way: a new
  // directory is scanned by default, and the only way to lose coverage is to
  // name the directory here, in the diff, on purpose.
  //
  // Both entries below are for source that is NOT part of any `kai-*` element's
  // shadow DOM, so a `part=` in them is not a styling surface we owe consumers
  // documentation for:
  //   - `agent-tooling/` is the `kai` MCP scaffolder. The code it EMITS lives in
  //     string literals; a `part=` there belongs to the consumer app it
  //     generates, not to a kit element.
  //   - `stories/` is Storybook demo/doc pages -- the same category the existing
  //     `.stories.tsx` filename filter already excludes; this just covers the
  //     non-`.stories` helpers that sit in that directory.
  // Excluding these matters in BOTH directions: counting them would manufacture
  // forward-guard failures that tempt bogus registry entries, and it would WEAKEN
  // the reverse guard by letting a template string "justify" a registered name
  // that no element actually renders. Neither directory contains a `part=` today,
  // so both exclusions are provably no-ops at the time they were written.
  const UNSCANNED_DIRS = new Set(['agent-tooling', 'stories']);

  function partNamesInSource(): Set<string> {
    const found = new Set<string>();
    const scanFile = (p: string, name: string) => {
      if (!name.endsWith('.tsx') && !name.endsWith('.ts')) return;
      if (/\.(test|stories)\.tsx?$/.test(name)) return;
      // `ui/stat.tsx` is an internal-only SolidJS component — there is no
      // `kai-stat` web component, so its parts are intentionally unregistered.
      if (p.endsWith(join('ui', 'stat.tsx'))) return;
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(STATIC_PART_RE)) {
        for (const tok of m[1].split(/\s+/)) found.add(tok);
      }
      for (const m of src.matchAll(DYNAMIC_PART_START_RE)) {
        const openBraceIndex = m.index + m[0].length - 1;
        for (const tok of tokensInDynamicPart(src, openBraceIndex)) found.add(tok);
      }
    };
    // `skip` is passed only at the top level, so the denylist names top-level
    // directories of `src/` and cannot accidentally match a nested one.
    const walk = (dir: string, skip?: Set<string>) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (skip?.has(entry.name)) continue;
          walk(p);
          continue;
        }
        scanFile(p, entry.name);
      }
    };
    walk(SRC, UNSCANNED_DIRS);
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

  // Parts whose `part="…"` value reaches the DOM through a local helper's
  // PARAMETER instead of a literal JSX attribute, so the scan structurally
  // cannot see them. `ui/input.tsx` renders one shared `<input part={part}>` via
  // `const inputEl = (cls: string, part: string) => …` and passes the literal at
  // the two CALL SITES -- `inputEl(…, 'field input')` and `inputEl(ROW_INPUT,
  // 'input')`. Those literals are function arguments, not `part=` attributes, so
  // neither the static nor the dynamic matcher above ever sees `input`, even
  // though every `kai-input` / `kai-search` / `kai-editable-label` on the page
  // really does expose `::part(input)`.
  //
  // This is an exception to the REVERSE guard only -- the forward guard is
  // unaffected. It is deliberately not "fixed" by teaching the scanner to chase
  // string literals into call expressions: harvesting every part-shaped literal
  // out of a file that happens to contain a `part={…}` passthrough would also
  // swallow class strings (`'flex w-full items-center'` tokenizes just like a
  // part list), which would let almost any registered name find a bogus match
  // and gut the reverse guard everywhere. An over-clever regex "parser" is also
  // the exact failure documented at the top of this block.
  //
  // Each entry names the file that renders it, and the test below re-derives
  // that evidence from source, so a stale exception FAILS instead of quietly
  // excusing a part that has since been deleted.
  const INDIRECT_PART_DECLARATIONS: Record<string, string> = {
    input: join('ui', 'input.tsx'),
  };

  /** Tokens from string literals in `src` that are pure part-token lists —
   *  the shape a `part` value has when it is passed as a function argument. */
  function partLikeLiteralTokens(src: string): Set<string> {
    const out = new Set<string>();
    for (const m of src.matchAll(STRING_LITERAL_RE)) {
      const literal = m[1] ?? m[2] ?? '';
      const tokens = literal.trim().split(/\s+/);
      if (tokens.length > 0 && tokens.every((t) => TOKEN_RE.test(t))) {
        for (const t of tokens) out.add(t);
      }
    }
    return out;
  }

  it('every indirect-part exception still points at a real passthrough in source', () => {
    for (const [name, rel] of Object.entries(INDIRECT_PART_DECLARATIONS)) {
      const src = readFileSync(join(SRC, rel), 'utf8');
      // The file must still hand a computed value to `part=` … (a FRESH
      // non-global regex: `DYNAMIC_PART_START_RE` is `/g`, and `.test()` on a
      // shared global regex advances `lastIndex` between iterations.)
      expect(src, `${rel} no longer passes a value to part={…}`).toMatch(/\bpart=\{/);
      // … and must still contain the exempted name as a standalone token in a
      // part-shaped string literal (the call-site argument).
      expect(
        [...partLikeLiteralTokens(src)],
        `${rel} no longer supplies the "${name}" part token`,
      ).toContain(name);
    }
  });

  it('declares every registered ::part somewhere in the source (reverse drift guard)', () => {
    // The other half of the pair above. Without it the registry can name parts
    // that no longer exist: deleting `part="row"` from components/message.tsx
    // left `kai-message::part(row)` registered with a full styling recipe and
    // every test still passed. The "declares row / bubble / content / actions"
    // test is NOT this guard -- it pins the registry against a hardcoded list,
    // i.e. against itself, which a stale entry satisfies perfectly.
    //
    // This compares the registry to the FILESYSTEM (`partNamesInSource` reads
    // `src/` and never looks at ELEMENT_COMPOSITION), so it cannot be satisfied
    // by the registry agreeing with itself.
    const inCode = partNamesInSource();
    const registered = registeredPartNames();
    expect(registered.size).toBeGreaterThan(0); // sanity: the registry is non-empty
    expect(inCode.size).toBeGreaterThan(0); // sanity: the scan actually found parts
    // `Object.hasOwn`, not `name in …`: `in` walks the prototype chain, so a part
    // legitimately named `constructor` (it matches TOKEN_RE) would be silently
    // excused by a key this map never declared.
    const stale = [...registered]
      .filter((name) => !inCode.has(name) && !Object.hasOwn(INDIRECT_PART_DECLARATIONS, name))
      .sort();
    expect(stale).toEqual([]);
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
      'kai-empty',
      'kai-file-tree',
      'kai-file-upload',
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
      'kai-popover',
      'kai-progress-bar',
      'kai-prompt-dock',
      'kai-prompt-input',
      'kai-resizable',
      'kai-resizable-item',
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
      'kai-tooltip',
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
