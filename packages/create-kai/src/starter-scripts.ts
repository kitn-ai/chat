/**
 * Which of an emitted project's own npm scripts the smoke run has to invoke to
 * actually check it.
 *
 * `scripts/smoke.mjs` ran `npm run build` and called that a pass. For six of the
 * eight starters that is the whole story, because their `build` chains a
 * typechecker before the bundler (`tsc -b && vite build`, `vue-tsc -b && ...`,
 * `svelte-check && ...`) or is one (`ng build` AOT-checks, `next build`
 * typechecks unless told not to).
 *
 * TANSTACK START IS THE EXCEPTION, and it is the reason this file exists. Its
 * `build` is a bare `vite build`, and Vite transpiles TypeScript with esbuild —
 * which strips types without checking them. So a TanStack project with a type
 * error bundles perfectly and smoke prints a green tick. That is the whole class
 * of failure smoke exists to catch: the published kit predating the parts[]
 * migration was found by `tsc` inside a starter's build, not by the bundler.
 *
 * `packages/ui/scripts/verify-starters.mjs` already knows this and runs the
 * starter's `typecheck` script separately when its build does not reach a
 * checker. Smoke did not, so the two disagreed about what "builds clean" meant.
 * This is that rule, in one place, with tests on it.
 *
 * ORDER MATTERS: build first, then typecheck. TanStack's `tsc --noEmit` reads
 * `src/routeTree.gen.ts`, which the Start plugin GENERATES during the build. Run
 * the typecheck first and it fails on a missing module that is about to exist.
 */

/**
 * Binaries whose presence in a `build` script means that build already
 * typechecks, so running `typecheck` after it would just repeat the work.
 *
 * Kept in step with the identical list in
 * `packages/ui/scripts/verify-starters.mjs`. Two copies is one more than ideal,
 * but that file guards the starters in CI and this one guards the emitted
 * projects, and they are in different packages with no shared runtime.
 */
export const BUILD_TYPECHECKS: readonly RegExp[] = [
  /\btsc\b/,
  /\bvue-tsc\b/,
  /\bsvelte-check\b/,
  /\bng build\b/,
  /\bnext build\b/,
];

/** Whether this `build` script reaches a typechecker on its own. */
export function buildTypechecks(buildScript: string): boolean {
  return BUILD_TYPECHECKS.some((re) => re.test(buildScript));
}

/**
 * The scripts to run, in order, for an emitted project with these `scripts`.
 *
 * Throws rather than skipping. A project smoke cannot check is a hole in the
 * gate, and "no build script, so nothing ran, so it passed" is the exact shape
 * of vacuous green this repo keeps paying for.
 */
export function scriptsToRun(scripts: Readonly<Record<string, string | undefined>>): string[] {
  const build = scripts.build;
  if (!build) {
    throw new Error(
      'the emitted project has no `build` script, so there is nothing for the smoke run to check',
    );
  }
  if (buildTypechecks(build)) return ['build'];

  if (!scripts.typecheck) {
    throw new Error(
      `the emitted project's build (\`${build}\`) does not reach a typechecker, and it has no ` +
        '`typecheck` script to make up for it. Its types would be checked by nobody, and the ' +
        'smoke run would report a green tick over code that does not compile.',
    );
  }
  return ['build', 'typecheck'];
}
