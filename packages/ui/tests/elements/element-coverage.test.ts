/**
 * GUARD — every `kai-*` element in the manifest is exercised by SOME test, or is a
 * NAMED exemption carrying a reason that says what is missing.
 *
 * WHY THIS FILE EXISTS. A coverage audit of the 79 manifest tags found elements with
 * no automated exercise of any kind — `kai-dialog`, `kai-scope-picker`,
 * `kai-response-stream`, `kai-segmented`, `kai-setting-item` among them — and the
 * reason nobody noticed is that the obvious check for "is this element tested?" is a
 * grep for its tag, and a grep OVERCOUNTS every time. The tag appears in
 * `src/elements/slots.test.ts` registry fixtures, in a `tests/react` prop table as a
 * string beside a React wrapper (`['kai-scope-picker', () => <ScopePicker />]`), in a
 * type-only declaration, in a doc comment, and in `payload-boundary.test.ts` as an
 * inert host with no assertion about the host at all. MOST of the elements this guard
 * flags do appear in a test file by name. Not one of them is tested.
 *
 * So the analyzer never trusts a tag's TEXT. Coverage is one of:
 *
 *   (a) a test file IMPORTS the element's facade module — resolved through the real
 *       filesystem from the manifest's own tag→module mapping, so a rename cannot
 *       leave a string behind that still matches — or CONSTRUCTS the element, which
 *       means literally `document.createElement('kai-x')` or JSX `<kai-x>`. A tag
 *       inside an array, a `querySelector`, a template literal compiled by tsc, or a
 *       comment is not construction and does not count.
 *
 *   (b) a test file imports the SOLID COMPONENT the facade renders. That list is
 *       parsed out of the facade's own import lines (below), never written down here.
 *
 * WHAT IS DERIVED AND WHAT IS WRITTEN DOWN. The tag list is the manifest, the same
 * source `src/elements/element-registry.test.ts` partitions. The facade module per
 * tag is the manifest's own mapping. The Solid component per facade is parsed from
 * the facade. The test corpus is walked. The ONLY hand-written thing is EXEMPT — and
 * every entry in it is a punch-list item, not a decision to leave something untested.
 *
 * WATCH IT FAIL. Three ways, all exercised below over fixtures rather than by
 * damaging the tree: the analyzer must REJECT the fixture-noise shapes
 * (`rejects tag mentions that are not construction`), must ACCEPT the real ones
 * (`accepts real construction`), and a stale exemption — an exemption for a tag that
 * has since been covered — is its own failing test rather than a silent pass. The
 * scan being non-vacuous is asserted first, because a wrong glob finds zero test
 * files and then EVERY element looks uncovered, which fails loudly, while a wrong
 * manifest path finds zero tags and makes every assertion below pass while checking
 * nothing.
 *
 * THOSE CHECKS ALREADY EARNED THEIR KEEP, twice, on the first run of this file:
 *   • the analyzer counted `<kai-dialog>` inside a COMMENT as construction, so it
 *     reported an untested element as tested — the very mistake it was written to
 *     stop. Hence `stripNonCode`. Fixing it exposed a NINETEENTH uncovered element,
 *     `kai-empty`, whose only test-file hits are a doc comment and a fixture string.
 *   • the guard scanned ITSELF, and its deliberately construction-shaped fixtures
 *     credited three of the elements it exempts. The stale-exemption test is what
 *     named them. A guard's own fixtures are not coverage.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import manifest from '../../src/elements/element-manifest.json';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '../..');
const ELEMENTS = join(PKG, 'src/elements');

/* ------------------------------------------------------------------ the corpus */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // `.claude/**` holds throwaway agent worktrees — full repo copies, whose
    // duplicated test files would otherwise be counted as coverage of this tree.
    if (entry.name === 'node_modules' || entry.name === '.claude' || entry.name === 'dist') continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/**
 * Every vitest test file that could plausibly exercise an element.
 *
 * `tests/e2e/**` is excluded because those are standalone Playwright specs that
 * vitest never collects (see the `unit` project's exclude in vitest.config.ts), and
 * `tests/react/**` because it is the trap this guard was written against: its prop
 * table names tags as STRINGS next to React wrappers it renders instead. Those
 * wrappers do mount the elements underneath, so this scan is CONSERVATIVE about the
 * React layer by construction — a wrapper test imports `@kitn.ai/ui/elements` by
 * package specifier, which resolves to nothing on disk and could never be credited
 * anyway. An element whose only exercise is a React wrapper test is reported as
 * uncovered here, and that is the honest verdict for a Solid-side behavioural guard.
 */
function testFiles(): string[] {
  return [...walk(join(PKG, 'src')), ...walk(join(PKG, 'tests'))]
    .filter((p) => /\.test\.tsx?$/.test(p))
    .filter((p) => !p.includes(`${join(PKG, 'tests', 'e2e')}`))
    .filter((p) => !p.includes(`${join(PKG, 'tests', 'react')}`))
    // THIS FILE. Its fixtures are deliberately shaped like real construction —
    // `createElement('kai-pane')`, `<kai-dialog>` — because that is what the teeth
    // tests assert on. Left in the corpus it credits itself with covering three of
    // the elements it exempts, which is how it was caught: the stale-exemption test
    // named kai-dialog, kai-pane and kai-pane-group as "now covered by
    // element-coverage.test.ts". A guard's own fixtures are not coverage.
    .filter((p) => p !== fileURLToPath(import.meta.url))
    .sort();
}

/**
 * Blank the two syntaxes where a tag is TEXT rather than code — comments and regex
 * literals — preserving offsets so nothing else shifts.
 *
 * COMMENTS, because prose is where tags get MENTIONED: `// <kai-dialog> traps Tab,
 * this must not` sits in a neighbouring suite today and would otherwise be credited
 * as construction of kai-dialog — the exact overcounting this guard exists to reject,
 * committed by the guard itself.
 *
 * REGEX LITERALS, for the same reason and at a higher cost. `kai-tool` — a core
 * agentic element rendering model-controlled arguments — was reported COVERED for
 * months on the strength of `scaffold.test.ts` asserting the scaffolder does NOT emit
 * it: `expect(text).not.toMatch(/<kai-tool><\/kai-tool>/)`. A tag inside a regex
 * literal, in a NEGATIVE assertion, credited as construction. It never reached the
 * punch list, so it was not even a known gap. Comments were the syntax someone
 * thought of; this is the one they did not.
 *
 * STRINGS come back TWO WAYS, because the two construction shapes want opposite
 * treatments and asking one question of one text is what let the second hole through.
 * `createElement('kai-x')` IS a string literal, so `code` keeps string contents. JSX
 * is code and can NEVER be inside a string, so `codeNoStrings` blanks them — which is
 * what stops a test NAME (`it('… does NOT emit bare <kai-tool> …')`) from counting as
 * a `<kai-tool>` element. `reflected-boolean-coverage.test.ts` splits its own scans
 * the same way and for the same reason. Both views come out of ONE traversal: the
 * scanner already knows where the strings are, and stripping the corpus twice was
 * measurable.
 *
 * Comments go first. Doing it the other way round lets an apostrophe in prose
 * (`// don't do this`) open a string state that swallows real code after it.
 */
export interface StrippedSource {
  /** Comments and regex literals blanked; string CONTENTS kept. */
  code: string;
  /** The same, with string contents blanked too. */
  codeNoStrings: string;
}

export function stripNonCode(source: string): StrippedSource {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, lead: string) => lead + ' '.repeat(m.length - lead.length));
  return blankRegexLiterals(withoutComments);
}

/**
 * The positions where a `/` cannot possibly be division, so it must open a regex.
 *
 * `tail` is the last few NON-WHITESPACE characters emitted so far, carried along by
 * the scanner. Deriving it there rather than re-scanning the output is not a
 * micro-optimisation: the first version asked `out.replace(/\s+$/, '')` at every
 * slash in every file, which is O(n²) over the corpus and took the suite from under a
 * second to past a two-minute timeout. A guard nobody can afford to run is a guard
 * nobody runs.
 *
 * DELIBERATELY INCOMPLETE, and that is the safe direction. Every token here is one
 * after which JavaScript syntactically forbids a binary operator, so treating the
 * slash as a regex cannot misread arithmetic. Omitted on purpose are the ambiguous
 * starts — after `)`, `]`, an identifier, a number, or at the head of a statement —
 * where telling a regex from a division needs a real parser. Missing one of those
 * leaves a tag credited that should not be, which is the SAME failure the guard
 * already had; guessing wrong on one of them would blank live code and hide
 * construction that is really there, which is a NEW and worse failure. The uncovered
 * positions are all shapes nobody writes a tag-matching regex in.
 */
function canStartRegex(tail: string): boolean {
  if (tail === '') return false;
  if (tail.endsWith('=>')) return true;
  if (/[(,=[:!&|?]$/.test(tail)) return true;
  return /(?:^|[^\w$])return$/.test(tail);
}

/**
 * Index of the closing `/` of the regex literal starting at `start`, or -1.
 *
 * Honours `\` escapes and `[...]` classes (where an unescaped `/` is literal), and
 * gives up at a newline because a regex literal cannot span one — which is what keeps
 * a misjudged slash from blanking the rest of a file.
 */
function regexEnd(source: string, start: number): number {
  let i = start + 1;
  let inClass = false;
  while (i < source.length) {
    const c = source[i];
    if (c === '\n') return -1;
    if (c === '\\') { i += 2; continue; }
    if (inClass) { if (c === ']') inClass = false; i++; continue; }
    if (c === '[') { inClass = true; i++; continue; }
    if (c === '/') return i;
    i++;
  }
  return -1;
}

/**
 * Blank every regex literal, and emit the two string views, in ONE traversal.
 *
 * Offsets are preserved throughout (everything blanked becomes spaces), so a future
 * caller wanting line numbers can still have them.
 */
function blankRegexLiterals(source: string): StrippedSource {
  const out: string[] = [];
  const bare: string[] = [];
  /** The last few non-whitespace characters emitted — see `canStartRegex`. */
  let tail = '';
  /** Keep in `code`; blank in `codeNoStrings` unless `keepBare`. */
  const emit = (s: string, keepBare = true) => {
    out.push(s);
    bare.push(keepBare ? s : s.replace(/[^\n]/g, ' '));
    const solid = s.replace(/\s+/g, '');
    if (solid) tail = (tail + solid).slice(-8);
  };

  let i = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const c = source[i];
    if (quote) {
      // The closing quote is kept in BOTH views (it is punctuation, not content), so
      // an empty string still reads as `''` rather than vanishing.
      if (c === '\\') { emit(source.slice(i, i + 2), false); i += 2; continue; }
      if (c === quote) { quote = null; emit(c); i++; continue; }
      emit(c, false);
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; emit(c); i++; continue; }
    // `//` and `/*` are already gone, but guard anyway: neither can open a regex, and
    // a URL's `://` reaches here intact for exactly that reason.
    if (c === '/' && source[i + 1] !== '/' && source[i + 1] !== '*' && canStartRegex(tail)) {
      const end = regexEnd(source, i);
      if (end !== -1) {
        const blank = ' '.repeat(end - i + 1);
        out.push(blank);
        bare.push(blank);
        // A blanked regex is still a VALUE, so a slash after it is division. Standing
        // in a `)` keeps that true without leaking the literal's own characters into
        // the token history.
        tail = (tail + ')').slice(-8);
        i = end + 1;
        continue;
      }
    }
    emit(c);
    i++;
  }
  return { code: out.join(''), codeNoStrings: bare.join('') };
}

/* --------------------------------------------------------------- the analyzers */

type Imported = { spec: string; clause: string; typeOnly: boolean };

/**
 * Static and dynamic import specifiers, with `import type` / `export type` marked so
 * they can be dropped.
 *
 * Type-only imports are the second overcounting trap: a test that imports an
 * element's PROP TYPE compiles against the element without executing a line of it.
 * Inline `{ type Foo }` specifiers are handled where it matters — a clause mixing a
 * value and an inline type import is a value import, which is the correct verdict.
 */
export function importsOf(source: string): Imported[] {
  const out: Imported[] = [];
  const statics = /(?:^|[\s;}])(?:import|export)\s+(type\s+)?(?:[^'"()]*?\s*from\s*)?['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = statics.exec(source))) out.push({ spec: m[2], clause: m[0], typeOnly: !!m[1] });
  // `await import('./badge')` — how a lazily registered element arrives in a test,
  // and how element-registry.test.ts drives its late-definition case.
  const dynamic = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynamic.exec(source))) out.push({ spec: m[1], clause: m[0], typeOnly: false });
  return out;
}

/** Resolve a RELATIVE specifier to a real file. Package specifiers resolve to null. */
export function resolveModule(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Every module a file imports for its VALUE, resolved to absolute paths. */
function valueModules(file: string, source: string): Set<string> {
  const out = new Set<string>();
  for (const imp of importsOf(source)) {
    if (imp.typeOnly) continue;
    const resolved = resolveModule(file, imp.spec);
    if (resolved) out.add(resolved);
  }
  return out;
}

/**
 * Does this source CONSTRUCT the tag?
 *
 * `document.createElement('kai-x')` (with or without a type argument) or JSX/markup
 * `<kai-x>`. Deliberately NOT: the bare string, `querySelector`, `innerHTML` text, or
 * a mention in a comment. The trailing delimiter is load-bearing — without it
 * `<kai-pane-group>` would be credited as coverage of `kai-pane`, and both are on the
 * uncovered list, so that bug would have hidden a real gap behind a real gap.
 */
export function constructsTag(source: string, tag: string): boolean {
  return constructsIn(stripNonCode(source), tag);
}

/**
 * The same check over ALREADY-stripped source. Split out purely for cost: the scan
 * asks 79 questions of every one of ~300 files, and stripping inside the predicate
 * re-stripped each file 79 times — measurably, 2.3s of the run against a 5000ms
 * per-test budget. Stripping once per file puts it back under a second.
 *
 * The two shapes read DIFFERENT views, which is the whole of the string-literal fix:
 * `createElement('kai-x')` needs string contents, JSX cannot legally be inside a
 * string and so reads the view where strings are blanked.
 */
function constructsIn(stripped: StrippedSource, tag: string): boolean {
  const t = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`createElement\\s*(?:<[^>]*>)?\\s*\\(\\s*['"\`]${t}['"\`]`).test(stripped.code)
    || new RegExp(`<${t}[\\s/>]`).test(stripped.codeNoStrings);
}

/* ------------------------------------------------------- tag -> facade -> Solid */

const TAGS: string[] = Object.keys(manifest.tags).sort();

/** The facade module the manifest itself maps this tag to. */
function facadeOf(tag: string): string | null {
  const base = (manifest.tags as Record<string, string>)[tag];
  for (const ext of ['.tsx', '.ts']) {
    const p = join(ELEMENTS, base + ext);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * The Solid modules a facade RENDERS — parsed from the facade, never listed here.
 *
 * A facade imports plenty it does not render: `./define`, `./slots`, sibling facades,
 * `../primitives/*` hooks. Crediting all of those would make the guard vacuous in the
 * dangerous direction, since a test of one shared helper would mark a dozen elements
 * covered. So the rule is narrow: a value import from `../ui/` or `../components/`
 * — the two layers CLAUDE.md names as the Solid UI source of truth — at least one of
 * whose bindings appears as a JSX ELEMENT in the facade. Measured over the tree, the
 * highest fan-in any such module has is 3 (`../ui/resizable`, `../ui/kbd`, each
 * shared by an element and its own sub-elements), so no shared helper is smuggling
 * coverage in.
 *
 * Two facades yield nothing under this rule and both were checked by hand rather than
 * papered over with a fallback: `kai-prompt-input` renders a SIBLING (`./default-input`)
 * and has full construction coverage anyway, and `kai-icon` renders through a
 * `renderIcon()` call rather than JSX — no test imports `../ui/icon` today, so a
 * fallback would change no verdict, and unexercised machinery is worse than a
 * documented edge. `kai-icon` is on the exempt list below and says so.
 */
function solidModulesOf(tag: string): Set<string> {
  const facade = facadeOf(tag);
  const out = new Set<string>();
  if (!facade) return out;
  const source = readFileSync(facade, 'utf8');
  for (const imp of importsOf(source)) {
    if (imp.typeOnly || !/^\.\.\/(components|ui)\//.test(imp.spec)) continue;
    const bindings = [...imp.clause.matchAll(/([A-Za-z_$][\w$]*)/g)].map((x) => x[1]);
    const rendered = bindings.some((b) => /^[A-Z]/.test(b) && new RegExp(`<${b}[\\s/>]`).test(source));
    if (!rendered) continue;
    const resolved = resolveModule(facade, imp.spec);
    if (resolved) out.add(resolved);
  }
  return out;
}

type Verdict = { covered: boolean; by: string[] };

function scan(): Map<string, Verdict> {
  const files = testFiles().map((file) => {
    const source = readFileSync(file, 'utf8');
    return { file, stripped: stripNonCode(source), modules: valueModules(file, source) };
  });
  const verdicts = new Map<string, Verdict>();
  for (const tag of TAGS) {
    const facade = facadeOf(tag);
    const solid = solidModulesOf(tag);
    const by: string[] = [];
    for (const f of files) {
      const rel = f.file.slice(PKG.length + 1);
      if (facade && f.modules.has(facade)) by.push(`${rel} (imports the facade)`);
      else if (constructsIn(f.stripped, tag)) by.push(`${rel} (constructs <${tag}>)`);
      else if ([...solid].some((m) => f.modules.has(m))) by.push(`${rel} (tests the Solid component)`);
    }
    verdicts.set(tag, { covered: by.length > 0, by });
  }
  return verdicts;
}

/* ------------------------------------------------------------------ the waivers */

/**
 * THE PUNCH LIST. Every entry is an element with no automated exercise at all — not a
 * decision that it should stay that way.
 *
 * `kind` is checked against a separate scan of the stories, so the "what is missing"
 * half of each reason cannot quietly go stale:
 *   • `story-only`   — a `*.stories.tsx` renders the tag, so it is smoke-rendered and
 *                      axe-checked by the storybook project, but nothing asserts its
 *                      behaviour, its props, or its events.
 *   • `nothing`      — no test AND no element story. Entirely unexercised.
 *
 * The bar here is deliberately the LOWEST one: "any test touches it at all". Clearing
 * it is not the same as being well tested, and a tag leaving this list should mean a
 * real behavioural test arrived, not that someone imported the module.
 */
const EXEMPT: Record<string, { kind: 'story-only' | 'nothing'; reason: string }> = {
  // ---- story-only: rendered somewhere, asserted nowhere.
  'kai-avatar': {
    kind: 'story-only',
    reason: 'rendered by seven showcase stories; no test asserts fallback initials, image failure, or size. Grep hits on "avatar" in the thread/message suites are a DIFFERENT component.',
  },
  'kai-empty': {
    kind: 'story-only',
    reason: 'story-only (chat-slots); no behavioural test. It read as covered until this analyzer learned to strip comments — its only test-file hits are a `<kai-empty>` in a doc comment in slot-registry-coverage.test.ts and a registry fixture string in slots.test.ts.',
  },
  'kai-icon': {
    kind: 'story-only',
    reason: 'story-only; no behavioural test. Also the one facade that renders through renderIcon() rather than JSX, so a future ../ui/icon unit test would NOT clear this entry on its own — it needs a test that mounts the element.',
  },
  'kai-image': {
    kind: 'story-only',
    reason: 'story-only (perplexity-pro); no behavioural test of loading, alt text, or the failure state.',
  },
  'kai-notice': {
    kind: 'story-only',
    reason: 'story-only across five showcases; no behavioural test of tone, the icon/action slots, or dismissal.',
  },
  'kai-scroll-area': {
    kind: 'story-only',
    reason: 'story-only (primitives); no behavioural test of scroll state, the shadow parts, or overflow.',
  },
  'kai-separator': {
    kind: 'story-only',
    reason: 'story-only across seven showcases; no behavioural test of orientation or its ARIA role.',
  },

  // ---- nothing: no test, no element story.
  'kai-pane': {
    kind: 'nothing',
    reason: 'no test, no element story; the only hits are slots.test.ts registry fixtures. Sizing and collapse are unexercised.',
  },
  'kai-pane-group': {
    kind: 'nothing',
    reason: 'no test, no element story; the only hits are slots.test.ts registry fixtures. Distribution across panes is unexercised.',
  },
  'kai-prompt-dock': {
    kind: 'nothing',
    reason: 'no test, no element story. It has registered slots and parts (PROMPT_DOCK_SLOTS) that nothing renders or asserts.',
  },
  'kai-response-stream': {
    kind: 'nothing',
    reason: 'no test, no element story — the streaming mode prop has no coverage at all, which is the worst place in this list for a gap given the kit streams by default.',
  },
  'kai-scope-picker': {
    kind: 'nothing',
    reason: 'no test, no element story. It appears in tests/react/optional-props as the STRING beside a React wrapper it never mounts, which is exactly the false positive this guard exists to reject.',
  },
  'kai-segmented': {
    kind: 'nothing',
    reason: 'no test, no element story; slots.test.ts fixtures and a react prop-table string are the only hits. Selection, keyboard traversal and the change event are unexercised.',
  },
  'kai-setting-item': {
    kind: 'nothing',
    reason: 'no test, no element story; only a slots.test.ts fixture. Nothing asserts the label/control association it exists to provide.',
  },
  'kai-settings-group': {
    kind: 'nothing',
    reason: 'no test, no element story; only a slots.test.ts fixture. Its documented children contract (kai-setting-item rows) is unenforced.',
  },
  'kai-text-shimmer': {
    kind: 'nothing',
    reason: 'no test, no element story, no mention in any test file. Entirely unexercised.',
  },
  'kai-thinking-bar': {
    kind: 'nothing',
    reason: 'no test, no element story, no mention in any test file. Entirely unexercised, despite being a reasoning-surface element.',
  },
};

/* ------------------------------------------------------------------- the tests */

describe('element coverage', () => {
  it('the scan is not vacuous', () => {
    // A wrong manifest path yields zero tags and every assertion below passes while
    // checking nothing; a wrong corpus glob yields zero test files and everything
    // looks uncovered. Both are pinned here rather than diagnosed later.
    expect(TAGS.length).toBeGreaterThan(70);
    expect(TAGS).toContain('kai-chat');

    const files = testFiles();
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.endsWith('chat-element.test.tsx'))).toBe(true);

    // Every manifest tag resolves to a real facade module — the mapping this guard
    // reads coverage through. If it stops resolving, coverage would read as absent
    // for reasons that have nothing to do with tests.
    const unresolved = TAGS.filter((t) => !facadeOf(t));
    expect(unresolved, 'manifest tags with no facade module on disk').toEqual([]);
  });

  it('the Solid-component derivation really derives something', () => {
    // Rule (b) silently returning empty sets would not fail anything — it would just
    // make the exempt list longer, which reads like a coverage problem rather than an
    // analyzer problem. Pin both a positive and the known negative.
    const withSolid = TAGS.filter((t) => solidModulesOf(t).size > 0);
    expect(withSolid.length).toBeGreaterThan(60);
    expect([...solidModulesOf('kai-dialog')]).toEqual([join(PKG, 'src/ui/dialog.tsx')]);
    // kai-icon renders via renderIcon(), not JSX — the documented edge above.
    expect([...solidModulesOf('kai-icon')]).toEqual([]);
  });

  it('rejects tag mentions that are not construction — THE TEETH', () => {
    // Every shape below appears in the tree today and every one of them would make a
    // grep report an untested element as tested.
    const noise = `
      // <kai-dialog> traps Tab, this must not.
      const table = [['kai-scope-picker', () => <ScopePicker />]];
      expect(defined).toContain('kai-conversations');
      const src = \`const dialog = document.querySelector('kai-dialog'); dialog?.show();\`;
      host.innerHTML = "text mentioning kai-segmented";
    `;
    for (const tag of ['kai-dialog', 'kai-scope-picker', 'kai-conversations', 'kai-segmented']) {
      expect(constructsTag(noise, tag), `${tag} must not count as constructed`).toBe(false);
    }
    // The delimiter case: a longer tag must not be credited to its prefix.
    expect(constructsTag(`const el = document.createElement('kai-pane-group');`, 'kai-pane')).toBe(false);
    // The comment case, in both syntaxes. This one was a real bug in THIS analyzer,
    // not a hypothetical: before comments were stripped it credited the line above.
    expect(constructsTag(`/* renders <kai-image> in the story */`, 'kai-image')).toBe(false);
    expect(constructsTag(`// document.createElement('kai-notice')`, 'kai-notice')).toBe(false);
    // ...and the stripper must not eat code after a URL, which is what a naive
    // "everything after //" rule does.
    expect(constructsTag(`const doc = 'https://ui.kitn.ai'; el = document.createElement('kai-notice');`, 'kai-notice')).toBe(true);
    // A type-only import is not coverage.
    expect(importsOf(`import type { DockProps } from '../../src/elements/dock';`)[0].typeOnly).toBe(true);
  });

  it('rejects tags inside REGEX LITERALS — the hole that hid kai-tool', () => {
    // NOT hypothetical, and not a near miss: this analyzer reported `kai-tool` — a
    // core agentic element rendering model-controlled arguments — as COVERED, on the
    // strength of `src/agent-tooling/mcp/scaffold.test.ts` asserting that the
    // scaffolder does NOT emit the tag:
    //
    //     expect(text).not.toMatch(/<kai-tool\s*>/);
    //
    // A tag inside a regex literal in a NEGATIVE assertion, credited as construction.
    // So the one element in the manifest with the worst consequence for going
    // untested never even reached the punch list, and the guard's own headline claim
    // — "the analyzer never trusts a tag's TEXT" — was false for a whole syntax.
    // It is the same class as the comment bug that `stripNonCode` was written for:
    // a place where the tag is TEXT rather than code.
    // The first line is the real one, copied from scaffold.test.ts verbatim.
    for (const tag of ['kai-tool', 'kai-reasoning']) {
      expect(constructsTag(`expect(text).not.toMatch(/<${tag}><\\/${tag}>/);`, tag), `${tag} in a regex arg`).toBe(false);
      expect(constructsTag(`const re = /<${tag}><\\/${tag}>/g;`, tag), `${tag} in an assigned regex`).toBe(false);
      expect(constructsTag(`if (!/<${tag}[\\s/>]/.test(src)) fail();`, tag), `${tag} in a negated regex`).toBe(false);
      expect(constructsTag(`const shapes = [/<${tag}>/, /x/];`, tag), `${tag} in a regex inside an array`).toBe(false);
    }

    // …and the stripper must not eat DIVISION, which is the thing a naive
    // "blank from / to /" rule destroys. Both halves matter: the construction after
    // the division still has to be seen.
    expect(
      constructsTag(`const half = width / 2; const el = document.createElement('kai-pane');`, 'kai-pane'),
      'a division must not swallow the code after it',
    ).toBe(true);
    expect(
      constructsTag(`const r = (a / b) / c; render(() => <kai-chat />);`, 'kai-chat'),
      'chained division must not swallow the JSX after it',
    ).toBe(true);
    // A URL in a string is a `:` followed by `//`, which is a comment opener and can
    // never begin a regex literal. It survived comment stripping for the same reason;
    // it has to survive this too.
    expect(
      constructsTag(`const doc = 'https://ui.kitn.ai'; el = document.createElement('kai-notice');`, 'kai-notice'),
      'a URL must not start a phantom regex',
    ).toBe(true);
    // A path string is not a regex either, even though it is full of slashes.
    expect(
      constructsTag(`const p = join(PKG, '/src/elements'); el = document.createElement('kai-badge');`, 'kai-badge'),
      'a path literal must not start a phantom regex',
    ).toBe(true);
  });

  it('rejects a tag inside a STRING that is not a createElement call — the second half', () => {
    // Blanking regex literals was not enough, and finding out why is the useful part.
    // With the regex hole closed, `kai-tool` was STILL credited — by the TEST NAME two
    // lines above the regex in the same file:
    //
    //     it('SCAF-9: agentic (html) does NOT emit bare <kai-tool> or <kai-reasoning> siblings', …)
    //
    // Prose in a string literal, and the JSX pattern `<kai-x[\s/>]` matches it happily
    // because this analyzer deliberately KEEPS string contents — it has to, since
    // `createElement('kai-x')` IS a string literal. So the two construction shapes want
    // opposite treatments, and the fix is to stop asking one question of one text:
    // `createElement` is matched with strings KEPT, JSX with string contents BLANKED.
    // `reflected-boolean-coverage.test.ts` splits its own scans the same way and for
    // the same reason.
    //
    // Note what this does NOT rely on: nothing here inspects whether the string is a
    // test name, an argument to `it`, or anything else about its context. JSX is code
    // and can never be inside a string; that is the whole rule.
    expect(constructsTag(
      `it('SCAF-9: agentic (html) does NOT emit bare <kai-tool> or <kai-reasoning> siblings', run);`,
      'kai-tool',
    ), 'a tag in a test NAME is not construction').toBe(false);
    expect(constructsTag(`const doc = "renders a <kai-dialog> over the page";`, 'kai-dialog')).toBe(false);
    expect(constructsTag('const tpl = `<kai-chat messages={m}></kai-chat>`;', 'kai-chat'),
      'a template literal is emitted TEXT, not this tree\'s JSX').toBe(false);
    expect(constructsTag(`host.innerHTML = '<kai-segmented></kai-segmented>';`, 'kai-segmented')).toBe(false);

    // THE COMPLEMENT, and it is the one that makes the split delicate: the primary
    // construction shape lives inside a string and must survive.
    expect(constructsTag(`const el = document.createElement('kai-dock') as Dock;`, 'kai-dock')).toBe(true);
    expect(constructsTag(`document.createElement<HTMLElement>("kai-pane")`, 'kai-pane')).toBe(true);
    expect(constructsTag('document.createElement(`kai-badge`)', 'kai-badge')).toBe(true);
    // …and real JSX, which is code and therefore untouched by string blanking.
    expect(constructsTag(`render(() => <kai-chat messages={m} />);`, 'kai-chat')).toBe(true);
  });

  it('accepts real construction', () => {
    // The complement. Rejecting everything would also make the noise test pass.
    expect(constructsTag(`const el = document.createElement('kai-dock') as Dock;`, 'kai-dock')).toBe(true);
    expect(constructsTag(`render(() => <kai-chat messages={m} />);`, 'kai-chat')).toBe(true);
    expect(constructsTag(`document.createElement<HTMLElement>('kai-pane')`, 'kai-pane')).toBe(true);
    expect(importsOf(`import '../../src/elements/badge';`)[0].typeOnly).toBe(false);
    expect(importsOf(`await import('./badge');`)[0].spec).toBe('./badge');
  });

  it('every manifest element is exercised by a test, or is a named exemption', () => {
    const verdicts = scan();
    const uncovered = TAGS.filter((t) => !verdicts.get(t)!.covered && !(t in EXEMPT));

    expect(
      uncovered,
      'These kai-* elements have no test that constructs them, imports their facade, '
      + 'or tests the Solid component they render. Fix it either way: add a test under '
      + 'tests/elements/ that mounts the element (document.createElement(tag) or JSX), '
      + 'or add the tag to EXEMPT in this file with a `kind` and a reason saying what '
      + 'is missing — the exempt map is a punch list, not an allowlist.',
    ).toEqual([]);
  });

  it('no exemption outlives the gap it records', () => {
    // A waiver that survives its own fix is a lie that reads as diligence, and on a
    // punch list it is worse: it hides the progress. If an element gets covered, its
    // entry must go.
    const verdicts = scan();
    const stale = Object.keys(EXEMPT)
      .filter((t) => verdicts.get(t)?.covered)
      .map((t) => `${t} — now covered by ${verdicts.get(t)!.by[0]}`);
    expect(stale, 'stale exemptions — delete these entries, the gap is closed').toEqual([]);

    const unknown = Object.keys(EXEMPT).filter((t) => !TAGS.includes(t));
    expect(unknown, 'exemptions for tags that are not in the manifest').toEqual([]);
  });

  it('each exemption says what is missing, and the `kind` is true', () => {
    // Strip each story ONCE, then ask `constructsIn` per tag — the same
    // strip-once-per-file split the main scan uses, and for the same measured
    // reason: `constructsTag` re-runs `stripNonCode` on every call, so asking it
    // per story × per exemption re-stripped the whole story corpus 17 times.
    // That was 1975ms of this test locally, and at CI speed it blew vitest's
    // strict 5000ms default twice on this branch (runs 32318854828, 32324835418).
    const storyFiles = walk(join(PKG, 'src')).filter((p) => /\.stories\.tsx?$/.test(p));
    const stories = storyFiles.map((f) => stripNonCode(readFileSync(f, 'utf8')));

    const wrong: string[] = [];
    for (const [tag, { kind, reason }] of Object.entries(EXEMPT)) {
      expect(reason.length, `${tag}'s exemption needs a real reason`).toBeGreaterThan(60);
      const hasStory = stories.some((s) => constructsIn(s, tag));
      if (hasStory && kind !== 'story-only') wrong.push(`${tag}: marked "${kind}" but a story renders it`);
      if (!hasStory && kind !== 'nothing') wrong.push(`${tag}: marked "${kind}" but no story renders it`);
    }
    expect(wrong, 'exemption kinds no longer match the stories — update the kind').toEqual([]);
  });
});
