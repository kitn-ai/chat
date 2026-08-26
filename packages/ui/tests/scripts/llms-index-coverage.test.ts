/**
 * GUARD — llms.txt still points into EVERY major section of llms-full.txt.
 *
 * llms.txt is the compact orientation file (llmstxt.org convention); llms-full.txt
 * is the big one. The whole point of the split is that an agent reads the small
 * file and NAVIGATES into the full one, instead of ingesting ~300 KB wholesale.
 * That only works while the small file actually mentions each big section — and
 * that coverage rotted silently: the runbook and the streaming recipe existed
 * only in llms-full.txt with no pointer from llms.txt, so nothing reading the
 * index knew they were there.
 *
 * DERIVED, NOT TYPED. The section list comes from `FULL_ONLY_SECTIONS` in
 * scripts/gen-llms.mjs — the same structure `generate()` composes llms-full.txt
 * from AND derives llms.txt's Docs pointers from. A hand-listed copy of the
 * sections here would rot exactly the way the pointers did. The completeness
 * check below is what makes a NEW section auto-fire: a `## ` heading added to
 * llms-full.txt outside the registered structure fails this test until it is
 * registered (which also gives it a pointer).
 *
 * Reads the COMMITTED artifacts, so it needs no build.
 *
 * Watched failing: with the "Streaming recipe" pointer stripped from llms.txt,
 * the mention assertion goes red naming that section; with a rogue `## Foo`
 * heading appended to llms-full.txt, the completeness assertion goes red.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line import/no-relative-packages
import { FULL_ONLY_SECTIONS, topLevelHeadings } from '../../scripts/gen-llms.mjs';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const llmsTxt = readFileSync(resolve(pkgRoot, 'llms.txt'), 'utf-8');
const llmsFull = readFileSync(resolve(pkgRoot, 'llms-full.txt'), 'utf-8');

type Section = { key: string; pointer: (count: number) => string; render: (ctx: unknown) => string };
const sections = FULL_ONLY_SECTIONS as Section[];

describe('llms.txt indexes every major section of llms-full.txt', () => {
  it('the generator registers at least the sections known today', () => {
    // Floor, not a list: shrinking the structure to dodge the checks below is
    // itself a failure. The KEYS are asserted structurally by the other tests.
    expect(sections.length).toBeGreaterThanOrEqual(4);
    for (const s of sections) {
      expect(typeof s.key, 'every registered section carries a heading key').toBe('string');
      expect(typeof s.pointer, 'every registered section derives an llms.txt pointer').toBe(
        'function',
      );
    }
  });

  it('every registered section exists as a top-level heading in llms-full.txt', () => {
    const headings = topLevelHeadings(llmsFull) as string[];
    for (const s of sections) {
      const matches = headings.filter((h) => h.includes(s.key));
      expect(
        matches.length,
        `section key "${s.key}" matches ${matches.length} top-level headings in llms-full.txt ` +
          `(expected exactly 1). Either the artifact is stale (regenerate: npm run build:api ` +
          `in packages/ui) or the key drifted from the heading it names.`,
      ).toBe(1);
    }
  });

  it('llms.txt mentions every registered section, so a reader can navigate to it', () => {
    for (const s of sections) {
      expect(
        llmsTxt.includes(s.key),
        `llms.txt never mentions "${s.key}", a major section that exists only in ` +
          `llms-full.txt. An agent reading the compact index cannot know it is there. ` +
          `The pointer is DERIVED from FULL_ONLY_SECTIONS in scripts/gen-llms.mjs — ` +
          `never hand-edit llms.txt; fix the generator and run npm run build:api.`,
      ).toBe(true);
    }
  });

  it("each section's derived pointer line itself carries the key it points at", () => {
    // The pointer text is what lands in llms.txt's Docs section. If it stops
    // containing the key, the mention test above could only pass by accident.
    for (const s of sections) {
      expect(
        s.pointer(84).includes(s.key),
        `the derived pointer for "${s.key}" does not contain the key, so it does not ` +
          `actually point at that section's heading.`,
      ).toBe(true);
    }
  });

  it('COMPLETENESS: every top-level heading of llms-full.txt is shared with llms.txt or registered', () => {
    // This is the assertion that makes a NEW section auto-fire. llms-full.txt is
    // the shared orientation body (whose headings appear in llms.txt verbatim)
    // plus the full-only sections. A heading that is neither is a section nobody
    // indexed.
    const indexHeadings = new Set(topLevelHeadings(llmsTxt) as string[]);
    const orphans = (topLevelHeadings(llmsFull) as string[]).filter(
      (h) => !indexHeadings.has(h) && !sections.some((s) => h.includes(s.key)),
    );
    expect(
      orphans,
      `llms-full.txt has top-level section(s) that llms.txt neither shares nor points ` +
        `at: ${orphans.map((h) => `"${h}"`).join(', ')}. Register each in ` +
        `FULL_ONLY_SECTIONS in scripts/gen-llms.mjs (which also derives its llms.txt ` +
        `pointer), then regenerate with npm run build:api.`,
    ).toEqual([]);
  });

  it('heading extraction ignores fenced code, so a `##` inside a snippet cannot satisfy anything', () => {
    const md = '## Real\n\n```bash\n## not a heading\n```\n\n## Also real\n';
    expect(topLevelHeadings(md)).toEqual(['## Real', '## Also real']);
  });
});
