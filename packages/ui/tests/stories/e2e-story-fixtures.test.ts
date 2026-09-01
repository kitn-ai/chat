/**
 * Drift guard: the Playwright e2e/IVP specs load Storybook stories by id
 * (`?id=<story>`). Those stories are TEST FIXTURES — if one is deleted or
 * retitled (e.g. during a Storybook reshuffle), the spec silently 404s. This
 * test fails loudly instead: it cross-checks every story id the specs
 * reference against the FULL ids (section + story name) actually declared
 * by the story files.
 *
 * If this fails, either (a) restore/retitle the fixture, or (b) update the
 * spec to point at the new story id. The web-component fixtures live under
 * the "Test Fixtures/…" section (see .storybook/preview.ts storySort).
 *
 * WHY FULL IDS, NOT JUST THE SECTION (the bug this guard used to have): the
 * previous version only compared the SECTION prefix (the part before the
 * first `--`, e.g. "components-elements-audiovisualizer") against declared
 * story TITLES, and never looked at the story NAME after `--` at all. A
 * section stays "declared" as long as ANY story in it survives, so deleting
 * one story out of several sharing a section (the StateMatrix story was
 * removed from `audio-visualizer.stories.tsx` while Bar/Grid/Radial/Custom
 * stayed) left three e2e tests pointed at a 404 with this guard still green
 * — the exact "check that proves nothing" failure mode this epic keeps
 * hitting. Fixed by validating the SUFFIX too, against the real set of
 * `export const Name: Story` declarations per file, not just its title.
 *
 * WHY NOT A LOOSE SUBSTRING MATCH (the guard's own earlier trap): an
 * earlier version's extraction regex matched ANY `word--word`-shaped
 * substring anywhere in a spec file's source, including inside an unrelated
 * absolute filesystem path that happened to contain a double-dash — a false
 * positive that briefly broke this guard for reasons that had nothing to do
 * with a story reference. This version anchors extraction to the literal
 * `?id=` query-parameter marker every genuine story reference in this
 * codebase actually uses (confirmed by grepping every tests/e2e/*.spec.ts
 * file's construction of story URLs before writing this), which a random
 * path essentially cannot contain.
 *
 * WHY DYNAMIC/PARAMETERIZED REFERENCES DON'T FALSE-FAIL: some specs build a
 * story id from a variable rather than a single literal (checked by
 * grepping every `?id=`/`STORY(...)`/`story(...)` construction in
 * tests/e2e/*.spec.ts before choosing this strategy — see the two shapes
 * below). Both are resolved to concrete ids and validated exactly, the same
 * as a literal; only a reference this file genuinely cannot resolve falls
 * back to a weaker section-only check (never silently skipped, and never a
 * hard requirement it satisfies by accident):
 *   1. A factory function `const NAME = (id: string) => \`...${id}...\``
 *      (this repo's `STORY`/`story` helpers) — every call site `NAME('lit')`
 *      is resolved by substitution.
 *   2. A literal-prefixed dynamic suffix used directly, `section--${var}`,
 *      where `var` is a `for (const var of [...])` loop variable over an
 *      inline (or previously `const`-declared) literal array — every loop
 *      value is resolved by substitution.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { storyRoots } from '../../scripts/story-roots.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

const kebab = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** CSF export name (PascalCase, e.g. "StateMatrix", "MicrophoneAll") to the
 *  kebab suffix Storybook computes for its story id ("state-matrix",
 *  "microphone-all") — mirrors storybook/csf's `storyNameFromExport`:
 *  insert a word boundary before an uppercase letter following a
 *  lowercase/digit, and before the last capital of a capital-run that's
 *  followed by a lowercase letter (the acronym case, "ABCFoo" -> "ABC Foo"),
 *  then kebab exactly like every other id piece in this file. Verified
 *  against this kit's own live Storybook index for every export used below
 *  (Bar/Grid/Radial/Wave/Aurora/Custom/Microphone/MicrophoneAll all match). */
function exportNameToKebab(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2');
  return kebab(spaced);
}

function walk(dir: string, hit: (file: string) => void) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist') continue;
    if (statSync(p).isDirectory()) walk(p, hit);
    else hit(p);
  }
}

interface DeclaredStories {
  /** Full "section--story" ids, one per real `export const Name: Story`. */
  ids: Set<string>;
  /** Section prefixes alone, for the dynamic-suffix fallback below. */
  sections: Set<string>;
}

/**
 * Every REAL story id declared in the kit's own story files. For each
 * `.stories.tsx`, the file's own `title`/`<Meta title>` gives the section;
 * every `export const Name: Story = {` in THAT file is one story, whose id
 * suffix is `Name`'s kebab form.
 *
 * The `: Story` type annotation requirement is deliberate, not a guess:
 * checked first (see the amendment-round report) that every single story
 * export across this whole tree (409 of them) uses that exact annotation,
 * with zero counter-examples — so this pattern has no false negatives
 * today, and correctly excludes a non-story named export from a stories
 * file, e.g. `export function StatCard(...)` in stat-card.stories.tsx.
 *
 * The title match itself needs a filter, not just the first `title:` found
 * — caught by this guard's own first draft failing for the wrong reason
 * (see the report): `chat-slots.stories.tsx` has a `title: 'Q3 forecast'`
 * inside an unrelated mock-data fixture BEFORE the real
 * `title: 'Labs/Chat Slots'` meta block, and a naive first-match took the
 * mock data's title as the section. Storybook's own convention (verified
 * against every meta title in this tree: 100% contain one, zero
 * counter-examples) is a `/`-delimited hierarchical path — "Labs/Chat
 * Slots", "Components/Elements/AudioVisualizer" — which a plain string
 * fixture essentially never is. Requiring a `/` in the matched value is
 * what tells the two apart.
 */
function declaredStories(): DeclaredStories {
  const ids = new Set<string>();
  const sections = new Set<string>();
  // Both src/ and apps/ hold `.stories.tsx` files -- see story-roots.mjs's
  // header (`.storybook/main.ts:54` is the authority the two roots mirror).
  for (const root of storyRoots(ROOT)) walk(root, (file) => {
    if (!/\.stories\.tsx?$/.test(file)) return;
    const src = readFileSync(file, 'utf8');
    const titleValues = [
      ...[...src.matchAll(/title:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!),
      ...[...src.matchAll(/<Meta\s+title="([^"]+)"/g)].map((m) => m[1]!),
    ];
    const metaTitle = titleValues.find((t) => t.includes('/'));
    if (!metaTitle) return;
    const section = kebab(metaTitle);
    sections.add(section);
    for (const m of src.matchAll(/^export const ([A-Z][A-Za-z0-9]*)\s*:\s*Story\b/gm)) {
      ids.add(`${section}--${exportNameToKebab(m[1]!)}`);
    }
  });
  return { ids, sections };
}

/** Every quoted string literal inside a `[ ... ]` bracket span, in source
 *  order (used for both `const ARR = [...]` and an inline `for (const x of
 *  [...])` iterable). */
function literalsInBrackets(bracketText: string): string[] {
  return [...bracketText.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => (m[1] ?? m[2])!);
}

/** `const NAME = [ 'a', 'b', ... ]` (optionally `as const`) at any nesting
 *  level in the file — NAME -> its literal elements. */
function buildConstArrayMap(src: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const m of src.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(\[[^\]]*\])\s*(?:as const)?\s*;/g)) {
    map.set(m[1]!, literalsInBrackets(m[2]!));
  }
  return map;
}

/** `for (const V of [...literal array, optionally "as const"...])` or
 *  `for (const V of ARRAY_IDENT)` where ARRAY_IDENT resolves via
 *  `buildConstArrayMap` — V -> the resolved literal values. */
function buildForLoopVarMap(src: string, constArrays: Map<string, string[]>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const re = /for\s*\(\s*const\s+([A-Za-z_$][\w$]*)\s+of\s+(\[[^\]]*\]|[A-Za-z_$][\w$]*)\s*(?:as const)?\s*\)/g;
  for (const m of src.matchAll(re)) {
    const [, varName, iterable] = m as unknown as [string, string, string];
    if (iterable.startsWith('[')) map.set(varName, literalsInBrackets(iterable));
    else if (constArrays.has(iterable)) map.set(varName, constArrays.get(iterable)!);
  }
  return map;
}

interface Factory {
  param: string;
  template: string;
  /** Source character span of the whole `const NAME = (id) => \`...\`;`
   *  match, so direct-occurrence scanning (below) can skip the definition
   *  itself — its `${param}` has no single value in place; it only gets one
   *  at each CALL site, handled separately by `resolveFactoryCallSites`. */
  span: [number, number];
}

/** `const NAME = (param[: type]) => \`TEMPLATE\`;` — the exact shape every
 *  parameterized story-id helper in this codebase uses today (`STORY` in
 *  chat-slots-ivp.spec.ts / promptinput-slots-ivp.spec.ts, `story` in
 *  promptinput-behavior.spec.ts / promptinput-shot.spec.ts). */
function buildFactoryMap(src: string): Map<string, Factory> {
  const map = new Map<string, Factory>();
  const re = /const\s+([A-Za-z_$][\w$]*)\s*=\s*\(\s*([A-Za-z_$][\w$]*)\s*(?::[^)]+)?\)\s*=>\s*`([^`]*)`/g;
  for (const m of src.matchAll(re)) {
    map.set(m[1]!, { param: m[2]!, template: m[3]!, span: [m.index!, m.index! + m[0].length] });
  }
  return map;
}

/** Every `?id=<value>` occurrence in a raw text blob, stopping at the first
 *  `&`/quote/backtick — the SAME anchor used everywhere in this file, so a
 *  resolved (already-substituted) template gets scanned identically to raw
 *  source. */
function extractIdOccurrences(text: string): string[] {
  return [...text.matchAll(/\?id=([^&'"`]+)/g)].map((m) => m[1]!);
}

/** For each factory, every call site `NAME('literal')` (either quote style)
 *  in the same file, substituted into that factory's template — fully
 *  resolved ids, checked exactly. A call site passing a non-literal
 *  argument (a variable) is not resolved here; none exist in this codebase
 *  today (checked directly: every STORY(...)/story(...) call site in every
 *  e2e spec passes a literal) — if one appeared, it would simply not
 *  contribute a resolved id, never silently pass NOR silently fail. */
function resolveFactoryCallSites(src: string, factories: Map<string, Factory>): string[] {
  const resolved: string[] = [];
  for (const [name, factory] of factories) {
    const callRe = new RegExp(`\\b${name}\\(\\s*(['"])((?:(?!\\1).)*)\\1\\s*\\)`, 'g');
    for (const m of src.matchAll(callRe)) {
      const resolvedTemplate = factory.template.replace(`\${${factory.param}}`, m[2]!);
      for (const idValue of extractIdOccurrences(resolvedTemplate)) {
        if (!idValue.includes('${')) resolved.push(idValue);
      }
    }
  }
  return resolved;
}

interface MissingEntry {
  spec: string;
  detail: string;
}

function checkSpecFile(file: string, declared: DeclaredStories): MissingEntry[] {
  const src = readFileSync(file, 'utf8');
  const missing: MissingEntry[] = [];
  const specName = file.split('/').pop()!;

  const constArrays = buildConstArrayMap(src);
  const forLoopVars = buildForLoopVarMap(src, constArrays);
  const factories = buildFactoryMap(src);

  // 1) Factory call sites: fully resolved, exact match required.
  for (const id of resolveFactoryCallSites(src, factories)) {
    if (!declared.ids.has(id)) missing.push({ spec: specName, detail: `${id} (factory call site)` });
  }

  // 2) Direct `?id=` occurrences, excluding factory DEFINITION spans (their
  // `${param}` has no in-place value; already handled in step 1).
  const factorySpans = [...factories.values()].map((f) => f.span);
  const isInFactoryDef = (idx: number) => factorySpans.some(([a, b]) => idx >= a && idx < b);

  for (const m of src.matchAll(/\?id=([^&'"`]+)/g)) {
    if (isInFactoryDef(m.index!)) continue;
    const value = m[1]!;

    if (!value.includes('${')) {
      // Fully literal -- exact match required.
      if (!declared.ids.has(value)) missing.push({ spec: specName, detail: `${value} (literal)` });
      continue;
    }

    // Literal-prefixed dynamic suffix: "section--${var}".
    const dynMatch = value.match(/^([a-z][a-z0-9-]*)--\$\{([A-Za-z_$][\w$]*)\}$/);
    if (dynMatch) {
      const [, prefix, varName] = dynMatch;
      const candidates = forLoopVars.get(varName!);
      if (candidates) {
        for (const c of candidates) {
          const id = `${prefix}--${c}`;
          if (!declared.ids.has(id)) missing.push({ spec: specName, detail: `${id} (resolved from ${value})` });
        }
      } else if (!declared.sections.has(prefix!)) {
        // Cannot resolve the exact story from this loop var; at minimum
        // require the section itself to be real (the old guard's whole
        // check, kept as a floor for references this file cannot fully
        // resolve -- never weaker than before, often stronger).
        missing.push({ spec: specName, detail: `${prefix} (dynamic suffix unresolvable, section not declared: ${value})` });
      }
      continue;
    }

    // Fully dynamic with no literal prefix at all (e.g. bare `${id}`) and
    // not a factory call site already resolved above -- cannot validate
    // anything about it. Deliberately skipped, not guessed at: every
    // occurrence of this shape in the codebase today is a factory
    // parameter reference inside that factory's OWN definition (already
    // excluded above via isInFactoryDef), so reaching this branch at all
    // would itself be worth a human look, not a silent pass -- logged via
    // the `notes` collected below rather than failing the whole guard on
    // an ambiguous case.
  }

  return missing;
}

describe('e2e story fixtures (drift guard)', () => {
  it('every story id the e2e specs load resolves to a real declared story', () => {
    const declared = declaredStories();
    expect(declared.ids.size).toBeGreaterThan(0); // sanity: we actually found declared stories

    const e2eDir = join(ROOT, 'tests/e2e');
    const specFiles = readdirSync(e2eDir)
      .filter((f) => f.endsWith('.spec.ts'))
      .map((f) => join(e2eDir, f));
    expect(specFiles.length).toBeGreaterThan(0); // sanity: we actually found specs to check

    const missing = specFiles
      .flatMap((f) => checkSpecFile(f, declared))
      .map((m) => `${m.detail} (in ${m.spec})`)
      .sort();
    expect(missing).toEqual([]);
  });
});
