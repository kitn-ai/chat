/**
 * Build-time constants, substituted by esbuild's `define` in scripts/build.mjs.
 *
 * Declared rather than imported from a generated module so `tsc --noEmit` works
 * on a clean checkout, before anything has been built.
 */

/** The `@kitn.ai/ui` version in the workspace this CLI was built against. */
declare const __KIT_VERSION__: string;

/** This CLI's own version, from its package.json. */
declare const __CLI_VERSION__: string;
