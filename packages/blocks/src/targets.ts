/**
 * INSTALL ROOTS -- ONE table (spec 2026-09-02 section 3.4), read by the form
 * renderers, by `create-kai add` (PR D) and by the /blocks page (PR C).
 *
 * THE RULING THIS FILE ENFORCES: the path the site DISPLAYS is the path the
 * CLI WRITES, byte for byte. A file tree on a page that does not match where
 * the command puts the file is a lie the reader finds out about after
 * running it.
 *
 * `components/` because every project already has one. No `ui/` or `kai/`
 * namespace: a block is the consumer's code, not a copied primitive, and a
 * namespace directory implies an upstream that owns it.
 *
 * No `node:path` here (this package declares no ambient types on purpose):
 * these are posix paths joined by hand, which is what a project-relative
 * path in a manifest is.
 */
export const INSTALL_ROOTS = {
  react: 'src/components',
  vue: 'src/components',
  solid: 'src/components',
  svelte: 'src/lib/components',
  angular: 'src/app/components',
  html: 'blocks',
} as const;

export type TargetFramework = keyof typeof INSTALL_ROOTS;

export function isTargetFramework(id: string): id is TargetFramework {
  return Object.prototype.hasOwnProperty.call(INSTALL_ROOTS, id);
}

/** Where this block's files land in a consumer project of this framework. */
export function installRoot(framework: TargetFramework, blockId: string): string {
  return `${INSTALL_ROOTS[framework]}/${blockId}`;
}

/** The project-relative target of one emitted file. */
export function fileTarget(framework: TargetFramework, blockId: string, fileName: string): string {
  return `${installRoot(framework, blockId)}/${fileName}`;
}
