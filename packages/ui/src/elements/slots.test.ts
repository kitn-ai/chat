import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHAT_SLOTS,
  PROMPT_INPUT_SLOTS,
  PROMPT_INPUT_PARTS,
  MESSAGE_SLOTS,
  MESSAGE_PARTS,
  FILE_TREE_PARTS,
  NAV_PARTS,
  CONTEXT_PARTS,
  PROGRESS_BAR_PARTS,
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
  it('declares row / bubble / content / actions / citations / attachment, with unique names', () => {
    const names = MESSAGE_PARTS.map((p) => p.name);
    // The last two come from ATTACHMENT_ITEM_PARTS, shared with
    // `<kai-attachments>`: a message renders its `file` parts through the same
    // Attachment chrome, so it exposes the same handles. Spread rather than
    // restated, which is why they appear here without being typed here.
    expect(names).toEqual([
      'row',
      'bubble',
      'content',
      'actions',
      'citations',
      'attachment',
      'attachment-name',
    ]);
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

describe('CONTEXT_PARTS registry', () => {
  it('declares the usage-meter parts, with unique names', () => {
    const names = CONTEXT_PARTS.map((p) => p.name);
    expect(names).toEqual(['track', 'fill']);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every part has a non-empty doc contract', () => {
    expect(CONTEXT_PARTS.every((p) => p.doc.trim().length > 0)).toBe(true);
  });

  // Same two NAMES as kai-progress-bar (both render the shared ProgressBar), but a
  // separate array: the docs are element-specific, and reusing the object would
  // publish `kai-progress-bar::part(track) { … }` as the recipe on kai-context.
  it('is a distinct array from PROGRESS_BAR_PARTS, with kai-context recipes', () => {
    expect(CONTEXT_PARTS).not.toBe(PROGRESS_BAR_PARTS);
    for (const part of CONTEXT_PARTS) {
      expect(part.recipe, `${part.name} has no recipe`).toBeDefined();
      expect(part.recipe).toContain(`kai-context::part(${part.name})`);
    }
  });

  it('is wired into ELEMENT_COMPOSITION under kai-context', () => {
    expect(ELEMENT_COMPOSITION['kai-context'].parts).toBe(CONTEXT_PARTS);
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

  // These scans read the tree thousands of times over (the import closures below
  // revisit shared modules once per element), and the source cannot change mid-run,
  // so every read is memoized. This is not just speed: unmemoized, the syscall +
  // regex load in this worker was enough to starve the timing-sensitive tween and
  // shader-animation suites running in PARALLEL workers, failing three tests in
  // files this change never touches.
  const fileCache = new Map<string, string>();
  function read(p: string): string {
    let src = fileCache.get(p);
    if (src === undefined) {
      src = readFileSync(p, 'utf8');
      fileCache.set(p, src);
    }
    return src;
  }
  /** Memoize a 1-arg pure function over the (immutable, for this run) filesystem. */
  function keyed<T>(fn: (key: string) => T): (key: string) => T {
    const cache = new Map<string, T>();
    return (key: string) => {
      if (!cache.has(key)) cache.set(key, fn(key));
      return cache.get(key)!;
    };
  }
  /** Same, for a whole-tree scan that takes no argument. */
  function lazy<T>(fn: () => T): () => T {
    let value: T | undefined;
    return () => (value ??= fn());
  }

  /**
   * Absolute file path -> the `::part` names that file declares, for every file
   * the scan counts (files declaring none are omitted).
   *
   * This is the ONE place that decides what "declares a part" means. Both the
   * global guards below and the per-element attribution further down read it, so
   * they cannot drift apart on the exclusions (`.test.`/`.stories.`, `ui/stat.tsx`,
   * `UNSCANNED_DIRS`) — a name this map does not carry justifies nothing, anywhere.
   */
  const partNamesByFile = lazy((): Map<string, Set<string>> => {
    const byFile = new Map<string, Set<string>>();
    const scanFile = (p: string, name: string) => {
      if (!name.endsWith('.tsx') && !name.endsWith('.ts')) return;
      if (/\.(test|stories)\.tsx?$/.test(name)) return;
      // `ui/stat.tsx` is an internal-only SolidJS component — there is no
      // `kai-stat` web component, so its parts are intentionally unregistered.
      if (p.endsWith(join('ui', 'stat.tsx'))) return;
      const src = read(p);
      const found = new Set<string>();
      for (const m of src.matchAll(STATIC_PART_RE)) {
        for (const tok of m[1].split(/\s+/)) found.add(tok);
      }
      for (const m of src.matchAll(DYNAMIC_PART_START_RE)) {
        const openBraceIndex = m.index + m[0].length - 1;
        for (const tok of tokensInDynamicPart(src, openBraceIndex)) found.add(tok);
      }
      if (found.size > 0) byFile.set(p, found);
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
    return byFile;
  });

  function partNamesInSource(): Set<string> {
    const found = new Set<string>();
    for (const names of partNamesByFile().values()) {
      for (const name of names) found.add(name);
    }
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
      const src = read(join(SRC, rel));
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

  // ── Per-element attribution ───────────────────────────────────────────────
  //
  // Everything above is GLOBAL. The reverse guard proves a registered name is
  // rendered SOMEWHERE under `src/` — never that it is rendered by the element it
  // is registered under. So `kai-status` can register `::part(row)`, a name only
  // `components/message.tsx` renders, and stay perfectly green. The consumer then
  // follows the docs, writes `kai-status::part(row) { … }`, and gets silence: the
  // selector matches nothing, and a `::part()` that matches nothing is not an
  // error anywhere — not in CSS, not in the console, not in the build.
  //
  // WHY AN IMPORT GRAPH AND NOT A DECLARED `element -> modules` MAP.
  // A hand-written map is a second registry, and its drift is the invisible kind:
  // an entry naming too many modules silently re-widens this guard back toward
  // global and NOTHING fails, which is how a guard ends up proving nothing. The
  // import graph is DERIVED from the same source the components live in, so it
  // cannot fall out of step with what an element renders — move a component or
  // drop an import and the closure moves in that same commit.
  //
  // Three facts about this codebase make the graph the right model. None is
  // assumed: each one is guarded, named below, so if it ever stops holding the
  // suite says so instead of quietly degrading.
  //   1. A tag is bound to exactly ONE module, by a single literal
  //      `defineWebComponent('kai-…', …)` call. `elementModules()` reads those
  //      calls out of `elements/`; "every composable element resolves to a facade
  //      module" fails if a registered tag has no such call. The tag -> module
  //      edge is therefore derived, never declared.
  //   2. Facades render imported SOLID COMPONENTS into their own shadow root;
  //      they do not nest `kai-*` elements inside it. This matters because
  //      `::part()` does NOT pierce a nested custom element without `exportparts`
  //      — and this repo contains no `exportparts` at all ("no element forwards
  //      parts…" below pins that). So "rendered by a module this element imports"
  //      is the ACTUAL styling boundary, not a convenient approximation of a
  //      wider one.
  //   3. The graph discriminates. Closures run 6–88 modules out of ~288, and even
  //      the widest element (`kai-workspace`) reaches only 12 of the 46
  //      part-declaring files — so a misattribution has real room to be caught.
  //      "attribution actually discriminates" below is the control for this: it
  //      fails if closures ever widen to the point that this guard has silently
  //      become the global one again.
  //
  // The closure is a deliberate OVER-approximation: a module can be imported and
  // only conditionally rendered, so an element is credited with a few names it
  // renders only in some states. That is the safe direction — it never fails
  // correct code, which is the direction that gets a guard deleted — and it still
  // rejects the drift above.
  //
  // KNOWN GAP, left open on purpose. This does not prove the converse: that every
  // part rendered inside an element is registered under it. `kai-chat` really does
  // expose `kai-chat::part(row)` today (its shadow root renders `components/
  // message.tsx` directly), yet `row` is registered only under `kai-message`. That
  // is a docs-COMPLETENESS gap — a working selector nobody documented — not the
  // broken-selector gap this guard closes, and enforcing it BLANKET would fail
  // loudly on correct code across most of the registry.
  //
  // It is enforced PER ELEMENT instead, for elements whose closure is small enough
  // that the over-approximation stops costing anything: see CONVERSE_ENFORCED
  // below. That list is an opt-in, not a backlog. 22 of 80 elements render a part
  // they do not register today, and most of those readings are inflated by the
  // over-approximation, so opting one in means reading its tree first.
  const ELEMENTS_DIR = join(SRC, 'elements');

  /** The single literal binding a tag to a module. A generic argument list cannot
   *  contain `(`, so `[^(]*?` can never run past the call's own opening paren. */
  const DEFINE_TAG_RE = /\bdefineWebComponent\s*(?:<[^(]*?>)?\s*\(\s*'([a-z][a-z0-9-]*)'/g;

  /**
   * An import/export STATEMENT and its specifier. Line-anchored at the statement
   * keyword and restricted to a clause charset (`[\w*{},\s$]`) that cannot hold
   * arbitrary code — no parens, dots, or operators — so a match physically cannot
   * run out of one statement and into unrelated source below it. `\s` covers the
   * multi-line `import {\n a,\n b,\n} from '…'` form, and the optional `from`
   * clause covers a bare side-effect `import './x'` (which is how `register-impl`
   * pulls every element in).
   *
   * Anchoring beats the obvious `/\bfrom\s*['"]…['"]/`: that shape also matches
   * inside comments, and two files here carry exactly that
   * (`elements/command.tsx` and `elements/menu.tsx` both document
   * "`import type { … } from './command'`" in a `//` line). Crediting a COMMENT
   * with an import would widen a closure on the strength of prose.
   *
   * Group 1 captures a leading `type`, and type-only statements are dropped: they
   * are erased at build time and render nothing, so counting them would credit an
   * element with modules it never mounts. (Measured on this tree, dropping them
   * narrows closures — kai-chat 82 -> 77 modules — without changing any element's
   * attributed part set, so it is a tightening with no behaviour change today.)
   */
  const IMPORT_STMT_RE =
    /^[ \t]*(?:import|export)[ \t]+(type[ \t]+)?(?:[\w*{},\s$]*?[ \t]+from[ \t]*)?['"]([^'"]+)['"]/gm;
  /** `import('./x')` — a real render path here: the audio-visualizer loads its
   *  shader variants this way, and `variant-wave` is the only route to the
   *  `canvas` part. Missing these would fail correct code. */
  const DYNAMIC_IMPORT_RE = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

  /** Resolve a RELATIVE specifier to a file on disk, the way the bundler does.
   *  A bare specifier is a node_modules package and declares no kit parts. */
  function resolveImport(fromFile: string, spec: string): string | null {
    if (!spec.startsWith('.')) return null;
    const base = resolve(dirname(fromFile), spec);
    for (const candidate of [
      `${base}.tsx`, `${base}.ts`,
      join(base, 'index.tsx'), join(base, 'index.ts'),
    ]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
  }

  const importsOf = keyed((file: string): string[] => {
    const src = read(file);
    const out = new Set<string>();
    for (const m of src.matchAll(IMPORT_STMT_RE)) {
      if (m[1]) continue; // type-only: erased at build, renders nothing
      const resolved = resolveImport(file, m[2]);
      if (resolved) out.add(resolved);
    }
    for (const m of src.matchAll(DYNAMIC_IMPORT_RE)) {
      const resolved = resolveImport(file, m[1]);
      if (resolved) out.add(resolved);
    }
    return [...out];
  });

  /** Every module reachable from `entry` by import — the element's component tree. */
  const importClosure = keyed((entry: string): Set<string> => {
    const seen = new Set([entry]);
    const stack = [entry];
    while (stack.length > 0) {
      const file = stack.pop()!;
      for (const dep of importsOf(file)) {
        if (seen.has(dep)) continue;
        seen.add(dep);
        stack.push(dep);
      }
    }
    return seen;
  });

  /** `kai-*` tag -> the facade module whose `defineWebComponent` call declares it. */
  const elementModules = lazy((): Map<string, string> => {
    const out = new Map<string, string>();
    for (const name of readdirSync(ELEMENTS_DIR)) {
      if (!name.endsWith('.tsx') && !name.endsWith('.ts')) continue;
      if (/\.(test|stories)\.tsx?$/.test(name)) continue;
      const p = join(ELEMENTS_DIR, name);
      for (const m of read(p).matchAll(DEFINE_TAG_RE)) out.set(m[1], p);
    }
    return out;
  });

  /**
   * The `::part` names `tag`'s own component tree can render — the union over its
   * import closure of what each module declares, plus any INDIRECT declaration
   * whose declaring FILE the closure reaches.
   *
   * That last clause is what keeps the `input` exception honest per-element
   * instead of blanket. `ui/input.tsx` renders `<input part={part}>` and takes the
   * literal at its call sites, so no scanner sees it — but the exception map
   * already names the file, so `input` is credited to `kai-input` / `kai-search` /
   * `kai-editable-label` (all of which import that module) and to nothing else. A
   * blanket exemption would have excused `input` on all 45 elements.
   */
  function attributedParts(closure: Set<string>, byFile: Map<string, Set<string>>): Set<string> {
    const out = new Set<string>();
    for (const file of closure) {
      for (const name of byFile.get(file) ?? []) out.add(name);
    }
    for (const [name, rel] of Object.entries(INDIRECT_PART_DECLARATIONS)) {
      if (closure.has(join(SRC, rel))) out.add(name);
    }
    return out;
  }

  it('every composable element resolves to exactly one facade module', () => {
    const modules = elementModules();
    // Sanity: the scan found the real element population, not three stragglers.
    expect(modules.size).toBeGreaterThan(60);
    const unresolved = Object.keys(ELEMENT_COMPOSITION)
      .filter((tag) => !modules.has(tag))
      .sort();
    // A registered tag with no `defineWebComponent('<tag>', …)` call means either
    // the element was renamed/deleted out from under the registry, or the tag is
    // declared in a shape DEFINE_TAG_RE cannot see — in which case the per-element
    // guard below would silently skip it. Fail rather than skip.
    expect(unresolved, 'ELEMENT_COMPOSITION tags with no defineWebComponent call').toEqual([]);
  });

  it('no element forwards parts out of a nested shadow root (exportparts)', () => {
    // Fact 2 above, pinned. `::part()` stops at the first shadow boundary unless
    // the host re-exports a child's parts with `exportparts`. Nothing here does,
    // which is exactly why "reachable by import" is the correct attribution
    // boundary. If that changes, this guard's model is wrong for the forwarding
    // element and attribution must learn to follow the forwarded names — so fail
    // here, loudly, instead of misattributing quietly.
    const offenders: string[] = [];
    const walk = (dir: string, skip?: Set<string>) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (skip?.has(entry.name)) continue;
          walk(p);
          continue;
        }
        if (!entry.name.endsWith('.tsx') && !entry.name.endsWith('.ts')) continue;
        if (/\.(test|stories)\.tsx?$/.test(entry.name)) continue;
        if (/\bexportparts\b/.test(read(p))) offenders.push(relative(SRC, p));
      }
    };
    walk(SRC, UNSCANNED_DIRS);
    expect(
      offenders.sort(),
      'exportparts forwards a nested element\'s parts through the host, so the ' +
      'import-closure attribution in this file no longer describes the styling ' +
      'surface. Teach attributedParts() to follow the forwarded names.',
    ).toEqual([]);
  });

  it('renders every registered ::part from that element\'s own tree (per-element drift guard)', () => {
    const byFile = partNamesByFile();
    const modules = elementModules();
    expect(byFile.size).toBeGreaterThan(0); // sanity: the scan actually found parts

    const misattributed: string[] = [];
    for (const [tag, def] of Object.entries(ELEMENT_COMPOSITION)) {
      const entry = modules.get(tag);
      if (!entry) continue; // reported by the resolve test above
      const closure = importClosure(entry);
      const rendered = attributedParts(closure, byFile);
      const registered = [
        ...(def.parts ?? []).map((p) => p.name),
        ...(def.slots ?? []).filter((s) => s.part).map((s) => s.name),
      ];
      for (const name of registered) {
        if (!rendered.has(name)) misattributed.push(`${tag}::part(${name})`);
      }
    }
    // Names BOTH sides: the element a consumer would write and the part that
    // would silently match nothing on it.
    expect(misattributed.sort()).toEqual([]);
  });

  // The CONVERSE of the guard above, opted into per element. The blanket version
  // is the KNOWN GAP documented at the top of this section: it fails loudly on
  // correct code across most of the registry, because the closure is an
  // over-approximation and a shared module like components/message.tsx credits
  // `row` to four elements that deliberately document it under one.
  //
  // For a SMALL closure the over-approximation stops mattering. `kai-context`
  // reaches exactly one part-declaring module (ui/progress-bar.tsx) and renders
  // its ProgressBar unconditionally inside the hover-card breakdown, so
  // "attributed" and "actually rendered" are the same two names, which is why
  // this element can carry the strict rule the registry as a whole cannot.
  //
  // This is the guard for the defect that put CONTEXT_PARTS here: kai-context
  // exposed ::part(track) and ::part(fill) with NOTHING registered under it, so
  // every generated artifact (element-meta.json, llms-full.txt,
  // docs/web-components.md, the kai MCP's component_reference) listed no parts
  // at all for an element that has two. Both global guards stayed green
  // throughout, because both names were already registered under
  // kai-progress-bar and both are really rendered somewhere in src/.
  const CONVERSE_ENFORCED: Record<string, string> = {
    'kai-context': 'closure reaches one part-declaring module (ui/progress-bar.tsx)',
  };

  it('registers every ::part its own tree renders, for elements opted into the converse', () => {
    const byFile = partNamesByFile();
    const modules = elementModules();
    const undocumented: string[] = [];
    for (const tag of Object.keys(CONVERSE_ENFORCED)) {
      const entry = modules.get(tag);
      expect(entry, `${tag} has no defineWebComponent call`).toBeDefined();
      const rendered = attributedParts(importClosure(entry!), byFile);
      const def = ELEMENT_COMPOSITION[tag];
      expect(def, `${tag} is opted into the converse but not in ELEMENT_COMPOSITION`).toBeDefined();
      const registered = new Set([
        ...(def.parts ?? []).map((p) => p.name),
        ...(def.slots ?? []).filter((s) => s.part).map((s) => s.name),
      ]);
      // Sanity: an element opted in here must actually render parts, or this
      // loop passes by having nothing to compare.
      expect(rendered.size, `${tag} renders no ::part at all`).toBeGreaterThan(0);
      for (const name of [...rendered].sort()) {
        if (!registered.has(name)) undocumented.push(`${tag}::part(${name})`);
      }
    }
    expect(undocumented).toEqual([]);
  });

  it('attribution actually discriminates (control: the guard above can fail)', () => {
    const byFile = partNamesByFile();
    const modules = elementModules();
    const partsOf = (tag: string) => attributedParts(importClosure(modules.get(tag)!), byFile);

    // NEGATIVE. `row` lives in `components/message.tsx`, which `kai-status`'s tree
    // never reaches — so registering `row` under `kai-status` MUST be rejected.
    // Without this, a closure that quietly widened to "all of src/" would make the
    // guard above vacuous and every test would still pass.
    const status = partsOf('kai-status');
    expect(status.has('dot')).toBe(true);   // its own part is attributed
    expect(status.has('row')).toBe(false);  // another element's is not
    expect(status.has('send')).toBe(false);

    // POSITIVE — the false-positive direction, and the one that gets a guard
    // disabled. `row` is genuinely SHARED: `components/message.tsx` renders it and
    // three different elements mount that module, so all four must be credited.
    // A naive "the part must appear in the element's OWN file" rule would fail
    // three of these on correct code.
    for (const tag of ['kai-message', 'kai-chat', 'kai-thread']) {
      expect(partsOf(tag).has('row'), `${tag} should render the shared row part`).toBe(true);
    }

    // The `input` exception resolves per-element, not blanket: only the elements
    // whose tree reaches `ui/input.tsx` are credited with it.
    expect(partsOf('kai-search').has('input')).toBe(true);
    expect(partsOf('kai-status').has('input')).toBe(false);
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
      'kai-code-block',
      'kai-command',
      'kai-context',
      'kai-conversation-item',
      'kai-conversations',
      'kai-dialog',
      'kai-dock',
      'kai-dropdown',
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
