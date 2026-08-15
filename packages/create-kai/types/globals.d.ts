/**
 * Build-time constants, substituted by esbuild's `define` in scripts/build.mjs.
 *
 * Declared rather than imported from a generated module so `tsc --noEmit` works
 * on a clean checkout, before anything has been built.
 */

/**
 * The `@kitn.ai/ui` RANGE an emitted project pins, e.g. `^0.25.0`.
 *
 * Already derived — `scripts/build.mjs` runs the workspace kit's version through
 * `derivePin` in `src/kit-pin.ts` and substitutes the result. The CLI is handed
 * a finished range rather than a version to build one from, so the pin exists in
 * the published bundle as a plain string literal; `scripts/verify-pin.mjs` reads
 * it back out of the packed tarball to check it against the registry.
 */
declare const __KIT_RANGE__: string;

/**
 * The exact `@kitn.ai/ui` version `__KIT_RANGE__` was derived from, e.g.
 * `0.25.0`. Written into every emitted `kai.json` as `kitBuiltAgainst`; see the
 * field's docblock in `src/kai-json.ts` for why both are recorded.
 */
declare const __KIT_VERSION__: string;

/** This CLI's own version, from its package.json. */
declare const __CLI_VERSION__: string;
