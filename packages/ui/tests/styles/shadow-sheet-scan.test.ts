// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { __unstable__loadDesignSystem } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * GUARD: the shipped shadow sheet is compiled from an EXPLICIT `@source` list.
 *
 * `src/elements/styles.css` imports Tailwind with `source(none)` and names the
 * directories whose class strings ship in dist/. That is what keeps story-only,
 * test-only and scaffold-template classes (257 of them, ~2 KB gzip) out of every
 * consumer's shadow root. The cost of an explicit list is that a new directory
 * under src/ that starts shipping class strings, or a file the excludes catch
 * by accident, compiles to a component whose classes are silently missing from
 * `compiled.css`: the JS ships the class, the sheet has no rule, the element
 * renders unstyled in exactly one spot, and nothing in the build notices.
 *
 * So this derives the truth from the other side. The oxide scanner (the same
 * extractor Tailwind runs over `@source` paths) is pointed at the shipped
 * SOURCE, selected by the OPPOSITE rule to the one styles.css uses: everything
 * under src/ except the directories that are known not to ship class strings
 * for rendering (test-utils and the docs stories) and the test/story files.
 * styles.css lists what IS shipped; this
 * lists what is NOT, so a new directory that starts shipping class strings is
 * scanned here and missed there, and that is the failure. Every candidate the
 * design system can generate a rule for must then have its selector in
 * `compiled.css`. The sheet is read, not recompiled: `compiled.css` is the
 * artifact `src/elements/css.ts` injects into every shadow root, so it is the
 * thing that ships and the thing that has to be right.
 *
 * WHY NOT dist/. It was tried first. dist/index.js bundles tailwind-merge, whose
 * default config enumerates the entire utility vocabulary as string literals
 * (`antialiased`, `backdrop-sepia`, `table-column-group`, 63 generable names in
 * all), so scanning the bundle reports every one of them as "used and missing".
 * A waiver derived from tailwind-merge's config would also hide a real drop of
 * any class in that vocabulary. The source tree has no such noise.
 *
 * Vacuity guards: the candidate count has a floor, the generable set has a
 * floor, and a control asserts a class that exists only in a story
 * (`from-fuchsia-500`) is ABSENT, so the assertion cannot pass on a sheet that
 * simply contains everything.
 */
const PKG = join(__dirname, '..', '..');
const SRC = join(PKG, 'src');
const ELEMENTS = join(SRC, 'elements');

/** Directories under src/ whose class strings are NOT rendered in a shadow root. */
const NOT_SHIPPED_DIRS = new Set([
  'test-utils',
  'stories', // docs-only stories
]);

function shippedSource(): { label: string; files: string[] } {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name) && !name.endsWith('.d.ts')) files.push(p);
    }
  };
  for (const name of readdirSync(SRC)) {
    const p = join(SRC, name);
    if (statSync(p).isDirectory()) {
      if (!NOT_SHIPPED_DIRS.has(name)) walk(p);
    } else if (/\.tsx?$/.test(name)) files.push(p);
  }
  return { label: `src/** minus {${[...NOT_SHIPPED_DIRS].join(',')}} and *.test/*.stories`, files };
}

/**
 * Tokens the scanner lifts out of shipped source that are NOT class names, but
 * happen to spell a utility Tailwind can generate. Each names where it comes
 * from; the last test fails if a waived token disappears from the source.
 */
const NOT_A_CLASS: Record<string, string> = {};

let source: ReturnType<typeof shippedSource>;
let candidates: string[];
let generable: Map<string, string>; // candidate -> first selector Tailwind emits
let compiled: string;

beforeAll(async () => {
  source = shippedSource();
  const scanner = new Scanner({ sources: [] });
  candidates = scanner.scanFiles(
    source.files.map((file) => ({ content: readFileSync(file, 'utf8'), extension: file.split('.').pop() ?? 'js' })),
  );
  // The same theme, plugin and animation imports styles.css compiles with, so
  // `text-body`, `animate-in` and `prose-sm` resolve exactly as they do there.
  // `source(none)` because the design system is only asked to judge candidates.
  const design = await __unstable__loadDesignSystem(
    [
      '@import "tailwindcss" source(none);',
      '@import "tw-animate-css";',
      '@import "../../theme.css";',
      '@plugin "@tailwindcss/typography";',
    ].join('\n'),
    { base: ELEMENTS },
  );
  generable = new Map();
  const css = design.candidatesToCss(candidates);
  candidates.forEach((candidate, i) => {
    const rule = css[i];
    if (!rule || candidate in NOT_A_CLASS) return;
    const selector = /(\.(?:\\.|[^\s{,])+)/.exec(rule)?.[1];
    if (selector) generable.set(candidate, selector);
  });
  compiled = readFileSync(join(ELEMENTS, 'compiled.css'), 'utf8');
});

describe('compiled.css carries a rule for every utility the shipped source references', () => {
  it('the derived inputs are non-empty, so nothing below passes vacuously', () => {
    expect(candidates.length, source.label).toBeGreaterThan(1000);
    expect(generable.size, source.label).toBeGreaterThan(500);
    console.info(`shadow-sheet-scan: ${candidates.length} candidates, ${generable.size} generable, from ${source.label}`);
    // Utilities only: `.kai-radio` and friends are plain component rules in
    // kit-base.css, present whatever the scan finds, so they prove nothing here.
    for (const cls of ['animate-in', 'prose-sm', 'transition-colors', 'text-body']) {
      expect(generable.has(cls), `${cls} should be a generable candidate in ${source.label}`).toBe(true);
    }
  });

  it('every generable candidate has its selector in compiled.css', () => {
    const missing = [...generable].filter(([, selector]) => !compiled.includes(selector)).map(([c]) => c);
    expect(
      missing,
      `classes the shipped source (${source.label}) uses that src/elements/styles.css did not compile; ` +
        'add the directory to its @source list or the token to NOT_A_CLASS with its source',
    ).toEqual([]);
  });

  it('control: a story-only class is absent, so the sheet is not simply everything', () => {
    expect(candidates).not.toContain('from-fuchsia-500');
    expect(compiled).not.toContain('.from-fuchsia-500');
  });

  it('every NOT_A_CLASS waiver still appears in the shipped source, so the list cannot rot', () => {
    const set = new Set(candidates);
    const stale = Object.keys(NOT_A_CLASS).filter((token) => !set.has(token));
    expect(stale, `waivers for tokens the shipped source no longer contains (${source.label})`).toEqual([]);
  });
});
