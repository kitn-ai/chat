// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * GUARD: what a light-DOM SolidJS consumer's Tailwind build produces from
 * `@kitn.ai/ui/solid.css`.
 *
 * Two style paths ship. The `kai-*` elements adopt `compiled.css` into every
 * shadow root, and that sheet is complete. The Solid entries (`.` / `./solid`)
 * ship class-name strings and NO CSS: the consumer compiles those strings with
 * THEIR Tailwind, `@source`-pointed at the kit. Until solid.css existed the
 * consumer imported theme.css, which is tokens only, so four things existed
 * solely in the element sheet's build and never reached that path: the
 * `.kai-radio` / `.kai-checkbox` / `.kai-range` / `.kai-focus-inset` component
 * rules, the token-driven base rules, tw-animate-css (every overlay animation)
 * and the typography plugin (`proseClass()` emits prose-sm / prose-lg). Each
 * compiled to nothing, silently: the app built, and the controls rendered as OS
 * chrome with no animation. Nothing in CI rendered that path.
 *
 * This runs the pinned Tailwind (`@tailwindcss/node`, the same compiler the
 * `@tailwindcss/vite` plugin wraps) over solid.css exactly the way a consumer's
 * stylesheet does, with the candidates the oxide scanner extracts from the
 * SHIPPED source, and asserts the rules exist in the output. The class lists
 * are derived, not typed: the `.kai-*` classes are the intersection of what
 * the shipped JS references and what the element sheet defines, so a new
 * component rule added to kit-base.css joins the check on its own.
 *
 * The control block compiles theme.css alone and asserts it FAILS the same
 * checks. That is the guard proving it can fail: the assertions below went red
 * against theme.css before solid.css was pointed at them, and the control keeps
 * that distinction pinned.
 */
const PKG = join(__dirname, '..', '..');

/** Shipped source: dist/ when built, else the Solid source tree it is built from. */
function shippedSource(): { label: string; files: string[] } {
  const dist = join(PKG, 'dist');
  const walk = (dir: string, ext: RegExp, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, ext, out);
      else if (ext.test(name)) out.push(p);
    }
    return out;
  };
  if (existsSync(join(dist, 'index.js')) && existsSync(join(dist, 'solid.js'))) {
    return { label: 'dist/index.js + dist/solid.js', files: [join(dist, 'index.js'), join(dist, 'solid.js')] };
  }
  return {
    label: 'src/components + src/ui (dist absent)',
    files: [...walk(join(PKG, 'src/components'), /\.tsx?$/), ...walk(join(PKG, 'src/ui'), /\.tsx?$/)].filter(
      (f) => !/\.(test|stories)\.tsx?$/.test(f),
    ),
  };
}

/** Class candidates the oxide scanner finds in the shipped source, as a consumer's @source would. */
function candidatesOf(files: string[]): Set<string> {
  const scanner = new Scanner({ sources: [] });
  const found = scanner.scanFiles(
    files.map((file) => ({ content: readFileSync(file, 'utf8'), extension: file.split('.').pop() ?? 'js' })),
  );
  return new Set(found);
}

async function compileConsumerSheet(entry: string, candidates: Iterable<string>): Promise<string> {
  const css = `@import "tailwindcss";\n@import "./${entry}";\n`;
  const compiler = await compile(css, { base: PKG, onDependency: () => {} });
  return compiler.build([...candidates]);
}

/** Every `.kai-*` selector the element sheet defines, read off compiled.css. */
function elementSheetKaiClasses(): Set<string> {
  const compiled = readFileSync(join(PKG, 'src/elements/compiled.css'), 'utf8');
  return new Set([...compiled.matchAll(/\.(kai-[a-z0-9-]+)/g)].map((m) => m[1]));
}

const hasRule = (css: string, cls: string): boolean =>
  new RegExp(`\\.${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9-])`).test(css);

// The three utility families the assignment names, and the reason each is here.
const ANIMATION_CLASSES = ['animate-in', 'fade-in-0', 'zoom-in-95']; // tw-animate-css
const PROSE_CLASSES = ['prose-sm', 'prose-lg']; // @tailwindcss/typography, via proseClass()

let source: ReturnType<typeof shippedSource>;
let candidates: Set<string>;
let kaiClasses: string[];

beforeAll(() => {
  source = shippedSource();
  candidates = candidatesOf(source.files);
  const defined = elementSheetKaiClasses();
  kaiClasses = [...candidates].filter((c) => /^kai-[a-z0-9-]+$/.test(c) && defined.has(c)).sort();
});

describe('solid.css compiles the styles the Solid path would otherwise lose', () => {
  it('the derived inputs are non-empty, so nothing below passes vacuously', () => {
    expect(candidates.size, source.label).toBeGreaterThan(100);
    // The four component classes the element sheet defines must all be referenced
    // by shipped source; if one stops being, the derivation below shrinks silently.
    expect(kaiClasses, source.label).toEqual(
      expect.arrayContaining(['kai-checkbox', 'kai-focus-inset', 'kai-radio', 'kai-range']),
    );
    for (const cls of [...ANIMATION_CLASSES, ...PROSE_CLASSES]) {
      expect(candidates.has(cls), `${cls} is no longer referenced by ${source.label}`).toBe(true);
    }
  });

  it('every .kai-* class the shipped source uses and the element sheet defines has a rule', async () => {
    const out = await compileConsumerSheet('solid.css', candidates);
    const missing = kaiClasses.filter((cls) => !hasRule(out, cls));
    expect(missing, `no rule in the solid.css build (${source.label})`).toEqual([]);
  });

  it('tw-animate-css utilities produce rules', async () => {
    const out = await compileConsumerSheet('solid.css', ANIMATION_CLASSES);
    const missing = ANIMATION_CLASSES.filter((cls) => !hasRule(out, cls));
    expect(missing).toEqual([]);
  });

  it('typography prose size modifiers produce rules', async () => {
    const out = await compileConsumerSheet('solid.css', PROSE_CLASSES);
    const missing = PROSE_CLASSES.filter((cls) => !hasRule(out, cls));
    expect(missing).toEqual([]);
  });

  it('carries the token-driven base rules the element sheet has', async () => {
    const out = await compileConsumerSheet('solid.css', []);
    expect(out).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-ring\)/);
    expect(out).toMatch(/::selection\s*\{[^}]*var\(--color-selection\)/);
    expect(out).toMatch(/\*::-webkit-scrollbar-thumb\s*\{[^}]*var\(--color-scrollbar-thumb\)/);
  });
});

describe('control: theme.css alone does NOT satisfy the contract (the guard can fail)', () => {
  it('lacks the component rules, the animation utilities and the prose modifiers', async () => {
    const out = await compileConsumerSheet('theme.css', [...candidates, ...ANIMATION_CLASSES, ...PROSE_CLASSES]);
    // theme.css defines a few `.kai-*` classes of its own (.kai-elevation,
    // .kai-scrollbar-thin); the ones that live in kit-base.css are the ones the
    // old contract dropped, so those are what must be absent here.
    const base = readFileSync(join(PKG, 'kit-base.css'), 'utf8');
    const baseOnly = kaiClasses.filter((cls) => hasRule(base, cls));
    expect(baseOnly).toEqual(expect.arrayContaining(['kai-checkbox', 'kai-focus-inset', 'kai-radio', 'kai-range']));
    expect(baseOnly.filter((cls) => hasRule(out, cls))).toEqual([]);
    expect(ANIMATION_CLASSES.filter((cls) => hasRule(out, cls))).toEqual([]);
    expect(PROSE_CLASSES.filter((cls) => hasRule(out, cls))).toEqual([]);
    // The global `*::-webkit-scrollbar-thumb` rule; theme.css's opt-in
    // `.kai-scrollbar-thin::-webkit-scrollbar-thumb` is a different selector.
    expect(out).not.toMatch(/\*::-webkit-scrollbar-thumb/);
    expect(out).not.toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-ring\)/);
  });
});
