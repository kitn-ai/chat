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

  it('does not mistake app data for a browser tab', () => {
    // A bare `title:` field in a component is app data. This assertion predates
    // the JS half below and is kept EXACTLY as it was: it is the control that
    // proves reading JavaScript did not turn every card heading into a red.
    expect(documentTitles('src/cards.tsx', "const c = { title: 'Centering a div' };")).toEqual([]);
    expect(documentTitles('index.html', html('x'))).toEqual(['x']);
  });
});

/**
 * The JS half — the class #216 left open.
 *
 * `titleProblems` read HTML and nothing else, so a title declared in JavaScript
 * was invisible to it. That was survivable while both SSR starters were
 * `planned`; TanStack Start then went `ready` with its title in a `head()` meta
 * array, covered by a patch-match plus one bespoke assertion in generate.test.ts
 * — the STRING was held, the CLASS was not. Next.js declares titles the same way
 * and is the next row in the queue.
 *
 * Every rejection below is a title the `REPO_INTERNAL` prose row cannot see, so
 * nothing here can pass by accident on the older rule: watched by planting each
 * into a real template and running the build, which stopped on the title message
 * rather than the repo-internals one.
 */
describe('the title guard, on titles declared in JavaScript', () => {
  const nextMetadata = (title: string) =>
    `import type { Metadata } from 'next';\nexport const metadata = {\n  title: '${title}',\n  description: 'x',\n};\n`;

  const tanstackHead = (title: string) =>
    `export const Route = createRootRoute({\n  head: () => ({\n    meta: [\n      { charSet: 'utf-8' },\n      { title: '${title}' },\n    ],\n  }),\n});\n`;

  it('reads the two shapes the SSR starters actually use', () => {
    expect(documentTitles('app/layout.tsx', nextMetadata('kai-chat playground'))).toEqual([
      'kai-chat playground',
    ]);
    expect(documentTitles('src/routes/__root.tsx', tanstackHead('AI/UI showcase'))).toEqual([
      'AI/UI showcase',
    ]);
  });

  it('rejects a JS-declared title that is not the project name', () => {
    for (const [file, source] of [
      ['app/layout.tsx', nextMetadata('kai-chat playground')],
      ['src/routes/__root.tsx', tanstackHead('AI/UI showcase')],
      // Next's other documented entry point, and its object form.
      ['app/page.tsx', "export async function generateMetadata() { return { title: 'kitn demo' }; }"],
      ['app/layout.tsx', "export const metadata = { title: { default: 'kitn demo' } };"],
      ['app/layout.tsx', "export const metadata = { title: 'x' } satisfies Metadata;"],
      // Framework-independent, and the one shape that needs no anchor.
      ['src/main.ts', "document.title = 'kitn cat showcase';"],
    ] as const) {
      expect(titleProblems(file, source), source).toHaveLength(1);
      // THE CONTROL FOR THE CONTROL: none of these is reachable by the older,
      // name-anchored prose rule, so each one genuinely needed this parse.
      expect(KIT_TITLE_PATTERN.test(source), source).toBe(false);
    }
  });

  it('accepts a JS-declared title the patch machinery produced', () => {
    expect(titleProblems('src/routes/__root.tsx', tanstackHead(PROBE_NAME))).toEqual([]);
    expect(titleProblems('app/layout.tsx', nextMetadata(PROBE_NAME))).toEqual([]);
  });

  it('quotes the offending title the way the file spells it', () => {
    // The message has to be greppable in the file it names, and a `.tsx` file
    // contains no `<title>` element to point at.
    const [problem] = titleProblems('app/layout.tsx', nextMetadata('kai-chat playground'));
    expect(problem.detail).toBe("title: 'kai-chat playground'");
    expect(titleProblems('index.html', html('kai-chat playground'))[0].detail).toBe(
      '<title>kai-chat playground</title>',
    );
  });

  /**
   * THE REASON THIS IS A PARSE. The two SSR starters carry far more `title:`
   * fields than document titles, and a regex that reached the real ones would
   * report every one of them; the note this replaced named exactly that as the
   * reason to leave the gap open.
   *
   * The sources below are LITERALS, deliberately — the shapes matter, not which
   * file happens to hold one this month. The first was lifted from the Next
   * starter's `InteractiveIsland.tsx` before that starter became a composed chat
   * app and the file went away; it stays because a card heading in app data is
   * still the false positive this rule has to not report.
   */
  it('leaves every non-title `title` in the tree alone', () => {
    for (const [file, source] of [
      // A card heading in app data.
      ['app/CardData.tsx', "const TASKS = [{ id: 1, title: 'Wire up streaming responses' }];"],
      // Conversation names, and a `title` that is a TYPE rather than a value.
      ['src/chat-data.ts', "export interface C { title: string }\nexport const C1 = [{ id: 'c1', title: 'Server rendering' }];"],
      // A JSX attribute is not an object property at all.
      ['src/components/HydrationBadge.tsx', "export const B = () => <span title={'hydrated'}>ok</span>;"],
      // A `meta` object that is not an array of descriptors.
      ['src/config.ts', "export const config = { meta: { title: 'not a descriptor array' } };"],
      // Next's `template` is a pattern, never literal tab text.
      ['app/layout.tsx', "export const metadata = { title: { template: '%s | kitn' } };"],
      // A non-exported `metadata` is a local, not Next's contract.
      ['src/util.ts', "const metadata = { title: 'kitn internal' };\nexport const x = 1;"],
    ] as const) {
      expect(documentTitles(file, source), source).toEqual([]);
    }
  });

  it('yields nothing for a file that is not a script', () => {
    for (const file of ['styles.css', 'package.json', '.npmrc', 'logo.svg']) {
      expect(documentTitles(file, "{ title: 'x' }"), file).toEqual([]);
    }
  });

  /**
   * The live half, read off the tree rather than from a literal.
   *
   * VACUITY GUARD FIRST: these two files are the whole reason the JS half
   * exists, and an assertion loop over an empty list is this repo's most
   * expensive recurring defect. If a starter is restructured so its title moves,
   * this fails loudly instead of passing having read nothing.
   */
  it('sees the real title in each SSR starter, unpatched', async () => {
    const found: [string, string[]][] = [];
    for (const rel of ['nextjs/app/layout.tsx', 'tanstack-start/src/routes/__root.tsx']) {
      const source = await readFile(path.join(STARTERS, rel), 'utf8');
      // The REAL file, not a reconstruction: each carries a module's worth of
      // imports, JSX and prose around the one line that matters, which is the
      // thing a literal in this file could never prove it survives.
      found.push([rel, documentTitles(rel, source)]);
      expect(titleProblems(rel, source), rel).toHaveLength(1);
    }

    expect(
      found.map(([file, titles]) => [file, titles.length]),
      'an SSR starter no longer declares its title where this looked',
    ).toEqual([
      ['nextjs/app/layout.tsx', 1],
      ['tanstack-start/src/routes/__root.tsx', 1],
    ]);
    // Each is the kit's own example title today, which is what makes the
    // rejection above meaningful rather than incidental.
    for (const [where, [title]] of found) expect(title, where).toContain('@kitn.ai/ui');
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
