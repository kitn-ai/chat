/**
 * The dotfiles npm refuses to put in a tarball, and the name they travel under.
 *
 * npm's packer drops a handful of names from every published package whatever
 * the `files` field says. Two of them are files a scaffolded project NEEDS, so a
 * template carrying one under its real name loses it at publish time — and only
 * at publish time. The working tree has it, `npm run build` copies it, every
 * test that reads `dist/templates` sees it, and the published package does not.
 *
 * WHAT THAT COST, because this list exists as a consequence rather than as
 * foresight. `_gitignore` was here from the start (it is create-vite's own
 * workaround); `.npmrc` was not, and `create-kai@0.1.0` shipped with `nextjs`
 * and `tanstack-start` templates that had no `.npmrc` in the tarball while the
 * bundled CLI still had a patch row that opens one. Both frameworks died on
 *
 *     Scaffolding failed
 *     ENOENT: no such file or directory, open '.../myapp/.npmrc'
 *
 * two of the eight frameworks the CLI advertises, on the first command a user
 * runs. The mechanism was already understood and already solved one file over.
 *
 * SO IT IS A LIST AND NOT A PAIR OF CONSTANTS. The `.gitignore` handling was
 * written as two named strings, which is the shape that makes the next file a
 * COPY of the mechanism rather than a row in it — and a copy is what did not get
 * written. Everything that touches the rename reads this list:
 * `scripts/build.mjs` renames each present one on the way into a template,
 * `generate()` renames them back on the way out, and `scripts/verify-pack.mjs`
 * fails the pack if a literal one survives into a built template.
 *
 * ADDING A ROW IS THE WHOLE OF ADDING A FILE. If a starter grows another name
 * npm strips — `.npmignore` is the obvious next one — put it here and the three
 * call sites follow. Nothing else needs to know.
 *
 * NO IMPORTS, deliberately. `generate.ts` is bundled into the CLI that every
 * `npx create-kai` downloads and `scripts/build.mjs` loads modules through
 * esbuild one at a time, so the one thing both ends of the rename share has to
 * be reachable without dragging the catalog or the TypeScript-parsing guards in
 * behind it.
 */

/**
 * The name a starter carries its ignore file under, and the one an emitted
 * project gets back.
 *
 * Re-exported from `src/build-guards.ts`, where `gitignoreProblem` uses it to
 * refuse a starter that has no ignore file at all — a separate requirement from
 * the rename, and the reason this one name is also spelled out on its own.
 */
export const GITIGNORE_SOURCE_NAME = '.gitignore';

/**
 * Every dotfile that must travel under an underscored name.
 *
 * `.gitignore` is required of every starter (`gitignoreProblem`); `.npmrc` is
 * optional and only the two standalone starters carry one. The rename is
 * therefore best-effort per file — present, rename it; absent, nothing to do —
 * and the "must exist" half stays where it belongs, as its own rule.
 */
export const STRIPPED_DOTFILES: readonly string[] = [GITIGNORE_SOURCE_NAME, '.npmrc'];

/**
 * The name `dotfile` travels under inside a template.
 *
 * Derived rather than tabulated, so a row above cannot be added with its
 * counterpart spelled wrong. The leading `.` is what npm strips on, so replacing
 * exactly that character is the whole transformation — `_gitignore`, `_npmrc`.
 */
export function travellingName(dotfile: string): string {
  return `_${dotfile.slice(1)}`;
}
