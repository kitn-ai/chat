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

/**
 * The real `CONSTRUCT_SCHEMA_URL` from the workspace `@kitn.ai/ui/construct`,
 * substituted here rather than imported at runtime — importing that module
 * pulls all of `zod` into the CLI bundle (`dist/construct.js` keeps zod
 * external but is one file with a top-level schema-building side effect that
 * esbuild cannot tree-shake past), which `src/build-guards.ts`'s
 * `bundleGraphProblem` bans outright. `scripts/build.mjs` reads the real
 * constant in its own node process (a devDependency-only import, never
 * bundled) and substitutes it as a string literal, the same way
 * `__KIT_RANGE__` above is derived once and handed over finished. Also
 * defined for `vitest` (see `vitest.config.ts`'s `define`), so
 * `src/wizard.ts` — which, unlike `index.ts`, IS imported directly by tests —
 * resolves it there too.
 */
declare const __CONSTRUCT_SCHEMA_URL__: string;
