import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `theme.css` is Tailwind v4 SOURCE that consumers `@import` into their OWN
 * Tailwind build, so anything it declares at global scope -- `@keyframes`, a
 * bare class -- lands in the consumer's global namespace next to theirs (and
 * `dist/theme.tokens.css` hoists the keyframes to top level for the <link> path).
 * The kit's own globals therefore carry a `kai-` prefix so they cannot clash by
 * name. `.chat-markdown` is the one deliberate exception: a public class the
 * docs name, so renaming it is a breaking change (documented in theming.mdx).
 *
 * The other half of the coupling is the references: a keyframe is used by name
 * from `animate-[<name>_...]` arbitrary values and from `animate-<name>`
 * utilities generated off `--animate-<name>` theme variables, none of which the
 * compiler resolves -- a misspelt or renamed keyframe compiles to an animation
 * that silently never runs. Read the names where they live and assert every
 * reference in `src/` points at one.
 */
const PKG = join(__dirname, '..', '..');
/** Comments stripped: the header narrates the prefix rule in prose that mentions `@keyframes`. */
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const theme = stripComments(readFileSync(join(PKG, 'theme.css'), 'utf8'));

const keyframes = [...theme.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
const animateVars = [...theme.matchAll(/--animate-([a-zA-Z0-9_-]+)\s*:\s*([a-zA-Z0-9_-]+)/g)].map((m) => ({
  utility: m[1],
  keyframe: m[2],
}));
const globalClasses = [...new Set([...theme.matchAll(/^\.([a-zA-Z0-9_-]+)/gm)].map((m) => m[1]))];

/** Keyframes tw-animate-css ships and the kit may reference through its `animate-*` utilities. */
const TW_ANIMATE_KEYFRAMES = new Set(['enter', 'exit', 'accordion-down', 'accordion-up', 'caret-blink']);
/** Tailwind's own stock `animate-*` utilities (from its default theme). */
const TAILWIND_STOCK = new Set(['spin', 'ping', 'pulse', 'bounce', 'none']);
/** Not utilities: `animate-when-not-visible` is a `kai-audio-visualizer` attribute name. */
const NOT_A_UTILITY = new Set(['when-not-visible']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(name) && !/compiled\.css$/.test(name)) out.push(p);
  }
  return out;
}
const sources = walk(join(PKG, 'src')).map((p) => ({ path: p, text: readFileSync(p, 'utf8') }));

describe('theme.css globals are kai-prefixed', () => {
  it('finds the keyframes (anti-vacuity floor)', () => {
    expect(keyframes.length).toBeGreaterThanOrEqual(10);
  });

  it('every @keyframes name starts with kai-', () => {
    const unprefixed = keyframes.filter((k) => !k.startsWith('kai-'));
    expect(unprefixed).toEqual([]);
  });

  it('every global class is kai- prefixed, except the public .chat-markdown and the .dark scope', () => {
    const allowed = new Set(['chat-markdown', 'dark']);
    const unprefixed = globalClasses.filter((c) => !c.startsWith('kai-') && !allowed.has(c));
    expect(unprefixed).toEqual([]);
  });

  it('keyframe names are unique', () => {
    expect(new Set(keyframes).size).toBe(keyframes.length);
  });
});

describe('every animation reference in src/ resolves to a declared keyframe', () => {
  const declared = new Set([...keyframes, ...TW_ANIMATE_KEYFRAMES]);
  const utilities = new Set([...animateVars.map((v) => v.utility), ...TAILWIND_STOCK, 'in', 'out', 'accordion-down', 'accordion-up', 'caret-blink']);

  it('sees references at all (anti-vacuity floor)', () => {
    const arbitrary = sources.flatMap((s) => [...s.text.matchAll(/animate-\[([a-zA-Z0-9_-]+?)_/g)].map((m) => m[1]));
    expect(arbitrary.length).toBeGreaterThanOrEqual(10);
  });

  it('animate-[<name>_...] arbitrary values name a declared keyframe', () => {
    const bad: string[] = [];
    for (const s of sources) {
      for (const m of s.text.matchAll(/animate-\[([a-zA-Z0-9_-]+?)_/g)) {
        if (!declared.has(m[1])) bad.push(`${s.path.slice(PKG.length + 1)}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('--animate-* theme variables point at a declared keyframe', () => {
    const bad = animateVars.filter((v) => !declared.has(v.keyframe));
    expect(bad).toEqual([]);
  });

  it('animate-<name> utilities name a --animate-<name> variable, a tw-animate-css one, or a stock Tailwind one', () => {
    const bad: string[] = [];
    for (const s of sources) {
      // `animate-` followed by a plain name (not `[`), stopping at the class boundary
      for (const m of s.text.matchAll(/(?:^|[\s'"`:])animate-([a-zA-Z0-9-]+)(?=[\s'"`]|$)/gm)) {
        if (!utilities.has(m[1]) && !NOT_A_UTILITY.has(m[1])) bad.push(`${s.path.slice(PKG.length + 1)}: animate-${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the kit never spells the tw-animate-css collapsible utilities, whose keyframes read a Radix variable the kit does not set', () => {
    // The kit's Collapsible (src/ui/collapsible.tsx) animates with a
    // grid-template-rows transition and sets no content-height variable at all;
    // tw-animate-css's `animate-collapsible-*` keyframes read
    // `--radix-collapsible-content-height`, so in the kit they animate to nothing.
    // theme.css used to shadow those keyframes BY NAME with `--kb-*` copies that
    // were equally dead (no data-state on the class-bearing div), which is the
    // global-namespace collision this file exists to prevent.
    const bad = sources
      .filter((s) => /animate-collapsible-(down|up)/.test(s.text))
      .map((s) => s.path.slice(PKG.length + 1));
    expect(bad).toEqual([]);
  });
});

describe('dist/theme.tokens.css carries the same globals (when built)', () => {
  const distPath = join(PKG, 'dist/theme.tokens.css');
  let dist: string | null = null;
  try {
    dist = stripComments(readFileSync(distPath, 'utf8'));
  } catch {
    dist = null;
  }

  it.skipIf(dist === null)('hoists every keyframe under its kai- name and no unprefixed one', () => {
    const hoisted = [...dist!.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
    expect(hoisted.sort()).toEqual([...keyframes].sort());
  });

  it.skipIf(dist === null)('ships .kai-scrollbar-thin and not .scrollbar-thin', () => {
    expect(dist).toContain('.kai-scrollbar-thin');
    expect(dist).not.toMatch(/(?<![a-z-])\.scrollbar-thin/);
  });
});
