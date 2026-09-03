// Shared derivation of the directories that hold `.stories.tsx` files.
//
// DERIVED, never listed. `.storybook/main.ts`'s `stories:` array is the record
// of where a story may live, and this reads the roots straight off it -- the
// same read-don't-copy rule `lint-catalog-drift.mjs`'s `storyExtensions()`
// applies to the extensions, which parses the same array for the same reason.
//
// A story CAN live outside `src/`: while a dev-tool app under `apps/` shipped
// one, that glob was in the array too, and every script that walks the tree
// for story files silently stopped seeing it. A hard-listed root is how that
// happened, so there is no list here to fall behind the globs. Add a glob and
// every walker picks its root up on the next run.
//
// A root may be absent on a partial checkout, so callers get back only the
// ones that are really there. Parsing NO globs is a hard failure rather than
// an empty list: every caller walks what this returns, and an empty walk reads
// as a pass.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The `stories:` globs, read off `.storybook/main.ts`.
 *
 * A regex over the array literal, not a TS parse: this module is imported by
 * vitest tests as well as by scripts, and the shape being read is a config
 * array of string literals, which is the one shape a regex reads as well as a
 * parser. `storyExtensions()` uses the TypeScript AST because it runs inside a
 * script that already loads it.
 *
 * @param {string} pkgRoot absolute path to packages/ui
 * @returns {string[]}
 */
export function storyGlobs(pkgRoot) {
  const main = join(pkgRoot, '.storybook', 'main.ts');
  if (!existsSync(main)) throw new Error(`story-roots: no ${main} to read the \`stories:\` globs from`);
  const array = /stories\s*:\s*\[([^\]]*)\]/.exec(readFileSync(main, 'utf8'));
  if (!array) throw new Error(`story-roots: no \`stories:\` array found in ${main}`);
  const globs = [...array[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
  if (globs.length === 0) throw new Error(`story-roots: the \`stories:\` array in ${main} is empty`);
  return globs;
}

/**
 * @param {string} pkgRoot absolute path to packages/ui
 * @returns {string[]} existing story-root directories under pkgRoot
 */
export function storyRoots(pkgRoot) {
  const roots = new Set();
  for (const glob of storyGlobs(pkgRoot)) {
    if (!glob.includes('.stories.')) continue; // the .mdx globs are docs pages, not stories
    const first = glob.replace(/^(\.\.\/)+/, '').split('/')[0];
    if (first && first !== '*' && first !== '**') roots.add(join(pkgRoot, first));
  }
  if (roots.size === 0) throw new Error('story-roots: no `*.stories.*` glob in .storybook/main.ts, so nothing would be walked');
  return [...roots].filter(existsSync);
}
