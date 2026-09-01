// Shared derivation of the directories that hold `.stories.tsx` files.
//
// `.storybook/main.ts`'s `stories:` glob is the authority (see
// lint-catalog-drift.mjs's `storyExtensions()` for the same read-don't-copy
// rule applied to extensions): it indexes both `../src/**/*.stories.@(ts|tsx)`
// and `../apps/**/*.stories.@(ts|tsx)` since the apps-out-of-src move put
// `apps/gallery/GalleryPage.stories.tsx` outside `src/`. Every script that
// walks the tree looking for story files needs both roots or it silently
// stops seeing that file — this is what a `src`-only walk got wrong.
//
// `apps` may not exist on a tree that predates the move (or a partial
// checkout), so callers get back only the roots that are actually present.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @param {string} pkgRoot absolute path to packages/ui
 * @returns {string[]} existing story-root directories under pkgRoot
 */
export function storyRoots(pkgRoot) {
  return [join(pkgRoot, 'src'), join(pkgRoot, 'apps')].filter(existsSync);
}
