/**
 * The build's template guards, exercised directly.
 *
 * These rules used to live inside `scripts/build.mjs`, which runs `main()` on
 * import and so could not be tested at all — the only way to see a rule fire was
 * to run the whole build and read stderr. That is how the title rule shipped
 * unable to match the one title it was pointed at.
 *
 * So the point of this file is not coverage. It is that each rule is watched
 * REJECTING a real string taken from the tree, next to a control showing the
 * rule that preceded it accepting the same string.
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PROBE_NAME,
  REPO_INTERNAL,
  documentTitles,
  repoInternalProblems,
  titleProblems,
} from '../src/template-guards';

const STARTERS = path.resolve(__dirname, '../../../examples/starters');

/** The `@kitn.ai/ui`-anchored row, the one #195 broadened. */
const KIT_TITLE_PATTERN = REPO_INTERNAL.find((r) => r.pattern.source.includes('kitn'))!.pattern;

const html = (title: string) =>
  `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <title>${title}</title>\n  </head>\n  <body><div id="root"></div></body>\n</html>\n`;

describe('the title guard', () => {
  /**
   * THE SPECIMEN THIS TEST WAS BUILT ON, now historical.
   *
   * The Solid starter titled itself exactly this until it became a `ready` chat
   * app: an ELEMENT name (`kai-chat`) standing in for a product that had since
   * been renamed to `@kitn.ai/ui`. Two independent drifts in one string, and the
   * result contains no `@kitn.ai/ui` at all — which is what made it the perfect
   * demonstration that a name-anchored blacklist cannot be the rule.
   *
   * It USED to be read live out of `examples/starters/solid/index.html`, on the
   * reasoning that a copy in this file would keep passing after someone edited
   * the starter. That reasoning was right and its premise is now gone: the
   * starter was fixed, so there is no longer a specimen in the tree to read, and
   * a test pinned to one file's current contents would have to be rewritten
   * every time that file is legitimately corrected. What survives the starter is
   * the RULE, so the string is a literal here and the live tree is covered by
   * the sweep below instead — which asserts over EVERY starter rather than the
   * one that happened to be broken.
   */
  const HISTORICAL_SOLID_TITLE = 'kai-chat — SolidJS Primitives Example';

  it('rejects a self-description the name-anchored pattern cannot see', () => {
    const source = html(HISTORICAL_SOLID_TITLE);
    const [title] = documentTitles('index.html', source);
    expect(title).toBe(HISTORICAL_SOLID_TITLE);

    // THE CONTROL. #195 anchored on `@kitn.ai/ui` plus whitespace. This title
    // names the kit by an element name under a product name that has since been
    // renamed, so it contains no `@kitn.ai/ui` at all and the pattern is blind
    // to it — while matching both of the shapes it was fitted to.
    expect(KIT_TITLE_PATTERN.test(title)).toBe(false);
    expect(KIT_TITLE_PATTERN.test('@kitn.ai/ui React example')).toBe(true);
    expect(KIT_TITLE_PATTERN.test('@kitn.ai/ui — Next.js App Router example')).toBe(true);

    const problems = titleProblems('index.html', source);
    expect(problems).toHaveLength(1);
    expect(problems[0].detail).toContain(HISTORICAL_SOLID_TITLE);
  });

  /**
   * The live half, over the whole tree rather than one file.
   *
   * Every starter's UNPATCHED title must be rejected. That is the invariant the
   * build actually depends on — `emittedContentProblem` applies each template's
   * patches and then requires the result to equal the project name, so a starter
   * whose raw title already satisfied the rule would be one whose patch does
   * nothing and nobody would learn.
   *
   * VACUITY GUARD: finding no HTML titles at all would make this pass having
   * asserted nothing, which is this repo's most expensive recurring defect. The
   * count is asserted first.
   */
  it('rejects every starter’s own title, before its patch runs', async () => {
    const titles: [string, string][] = [];
    for (const dir of await readdir(STARTERS)) {
      for (const rel of ['index.html', 'src/index.html']) {
        const file = path.join(STARTERS, dir, rel);
        if (!existsSync(file)) continue;
        for (const title of documentTitles('index.html', await readFile(file, 'utf8'))) {
          titles.push([`${dir}/${rel}`, title]);
        }
      }
    }

    expect(titles.length, 'no starter titles found — this asserted nothing').toBeGreaterThanOrEqual(6);
    for (const [where, title] of titles) {
      expect(titleProblems('index.html', html(title)), `${where}: ${title}`).toHaveLength(1);
    }
  });

  it('accepts a title the patch machinery actually produced, and nothing else', () => {
    expect(titleProblems('index.html', html(PROBE_NAME))).toEqual([]);
    // Not "contains the name" — a title that merely mentions it still describes
    // the wrong project.
    expect(titleProblems('index.html', html(`${PROBE_NAME} — kitn demo`))).toHaveLength(1);
  });

  it('rejects self-descriptions in spellings no pattern lists', () => {
    // The reason this is a whitelist. None of these contain `@kitn.ai/ui`, none
    // share a vocabulary with each other, and a blacklist would have to grow a
    // row for each. The rule needs no rows.
    for (const title of [
      'kai-chat — SolidJS Primitives Example',
      'AI/UI playground',
      '@kitn.ai/chat starter',
      'kitn cat showcase',
      'Vite + Svelte + TS',
      '',
    ]) {
      expect(titleProblems('index.html', html(title)), title).toHaveLength(1);
    }
  });

  it('does not mistake an inline SVG’s accessible name for a document title', () => {
    // `<title>` is a real SVG element — it is how an inline icon gets its
    // accessible name, and "Moon" is the user's app content. Scoping to <head>
    // is what keeps this from becoming a false red the first time a starter
    // inlines an icon.
    const source = html(PROBE_NAME).replace(
      '<div id="root"></div>',
      '<svg viewBox="0 0 24 24"><title>Moon</title><path d="M0 0" /></svg>',
    );
    expect(source).toContain('<title>Moon</title>');
    expect(titleProblems('index.html', source)).toEqual([]);
  });

  it('only reads HTML documents', () => {
    // A `title:` field in a component is app data, not a browser tab.
    expect(documentTitles('src/cards.tsx', "const c = { title: 'Centering a div' };")).toEqual([]);
    expect(documentTitles('index.html', html('x'))).toEqual(['x']);
  });

  it('is live on every ready starter’s title, not just the one it was written for', async () => {
    // Each of these is REJECTED before its patch runs. Without that, a rule
    // could pass on all five by never looking at them.
    for (const [starter, file] of [
      ['react', 'index.html'],
      ['vue', 'index.html'],
      ['svelte', 'index.html'],
      ['vanilla', 'index.html'],
      ['angular', 'src/index.html'],
    ] as const) {
      const source = await readFile(path.join(STARTERS, starter, file), 'utf8');
      expect(titleProblems(file, source), starter).toHaveLength(1);
    }
  });
});

describe('the repo-internals guard', () => {
  it('catches each instruction a user cannot follow', () => {
    const cases = [
      ['"@kitn.ai/ui": "workspace:*"', 'vite.config.ts'],
      ['run `nx build ui` first', 'vite.config.ts'],
      ['pnpm --filter @kitn.ai/ui-example-vue dev', 'vite.config.ts'],
      ['"@kitn.ai/ui": "file:../../../packages/ui"', 'package-lock.json'],
      ['<title>@kitn.ai/ui Vue example</title>', 'index.html'],
    ] as const;
    for (const [source, file] of cases) {
      expect(repoInternalProblems(file, source), source).not.toHaveLength(0);
    }
  });

  it('exempts package.json, which rewritePackageJson replaces wholesale', () => {
    expect(repoInternalProblems('package.json', '"@kitn.ai/ui": "workspace:*"')).toEqual([]);
    expect(repoInternalProblems('vite.config.ts', '"@kitn.ai/ui": "workspace:*"')).toHaveLength(1);
  });

  it('still lets through the three strings the space anchor was chosen to spare', () => {
    // Each is a real string in the tree and each would be a false red without
    // the character noted on the pattern: a backtick, a hyphen, a slash.
    for (const source of [
      '// `@kitn.ai/ui` is linked into this example via a workspace link',
      '"name": "@kitn.ai/ui-example-nextjs"',
      "import { Chat } from '@kitn.ai/ui/react'; // see the example above",
    ]) {
      expect(KIT_TITLE_PATTERN.test(source), source).toBe(false);
    }
  });
});
