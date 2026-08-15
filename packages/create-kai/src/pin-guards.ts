/**
 * Is the `@kitn.ai/ui` range this CLI bakes still one a user can install?
 *
 * THE INCIDENT. `create-kai@0.1.2` shipped `DEFAULT_KIT_RANGE = '^0.24.0'`,
 * derived from the workspace kit at build time. `@kitn.ai/ui@0.24.0` was later
 * deprecated for a critical XSS, fixed in `0.25.0`. A caret on a `0.x` version
 * cannot cross a minor, so `^0.24.0` resolves to `0.24.0` and can NEVER reach
 * `0.25.0`: for as long as `0.1.2` was `latest`, `npm create kai@latest`
 * scaffolded a project pinned to a vulnerable kit with no upgrade path inside
 * its own range. Nothing in the repo noticed, because nothing in the repo was
 * looking at the registry.
 *
 * THE BUG IS NOT THE `^0.24.0`, WHICH WAS CORRECT WHEN IT WAS BUILT. The
 * templates in that tarball were copied from the 0.24.0 tree and checked against
 * it by `test/kit-contract.test.ts`; pinning them to 0.24.0 is exactly right.
 * The bug is that `packages/ui` and `packages/create-kai` are INDEPENDENT
 * release-please packages, so a kit release does not republish the CLI. Every
 * kit minor therefore strands whatever `create-kai` is on the registry, and the
 * pin it carries decays from "correct" to "unreachable" without a single file
 * changing. It happened to coincide with a security release, which is the only
 * reason anyone saw it. The next one will be silent.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THE OBVIOUS GUARD IS NOT HERE: IT CANNOT FAIL.
 *
 * The tempting check is "fail the build if the derived range cannot resolve to
 * the kit version in the same tree". It is worthless — it is a tautology. The
 * range IS `` `^${kitVersion}` ``, and a caret range always includes the version
 * it was built from, for every version that exists. There is no state of this
 * repository, past or future, in which that check fires. It would sit in CI
 * printing a green line forever and would not have caught this incident on the
 * day it shipped or on any day after.
 *
 * That is worth writing down rather than quietly not doing, because the check
 * READS like coverage of exactly this bug, and a reviewer skimming a green log
 * would reasonably believe the pin was being watched.
 *
 * The invariant that can actually be violated compares the pin against the
 * REGISTRY, not against the tree. That needs the network, which is why these
 * rules take already-fetched facts and `scripts/verify-pin.mjs` does the I/O —
 * and why the check is NOT wired into `npm run build`. A build that fails on a
 * plane is a build people learn to skip, and `build` runs inside
 * `prepublishOnly` where a registry blip would break a release that is otherwise
 * fine. It runs where the network is already a hard dependency: the release
 * workflow, which publishes to npm in the same job.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY NOT A WIDER RANGE — the fix that looks like it removes the problem.
 *
 * `>=0.25.0 <1.0.0` crosses minors, so the pin would never strand. It is the
 * wrong answer, and not marginally.
 *
 * Pre-1.0 this kit ships BREAKING changes in minors — `CLAUDE.md` states it
 * (`feat!`/breaking = a minor bump) and the history shows it. So a range that
 * crosses minors is a promise the kit does not keep: a user scaffolding today
 * would install whatever minor is latest whenever they next run `npm install`,
 * against templates written for an older one, and the failure lands as type
 * errors or a blank screen in THEIR project.
 *
 * It also directly contradicts `test/kit-contract.test.ts`, whose whole job is
 * to check the templates' imports against ONE specific kit. Widening the range
 * would make a green run there mean nothing about what the user actually
 * resolves. The narrow pin is not the defect; it is the thing keeping the
 * emitted project honest. The defect is that nothing re-cuts the pin when the
 * kit moves.
 *
 * The right shape of fix is therefore: keep the caret, and make a stranded pin
 * IMPOSSIBLE TO SHIP QUIETLY. These rules are the loud half.
 */

import { derivePin } from './kit-pin';

/**
 * What the registry says, gathered by `scripts/verify-pin.mjs`.
 *
 * Deliberately post-resolution: `resolved` is what npm ITSELF said the range
 * picks, not something computed here. Reimplementing caret semantics would put
 * a second, worse semver in the tree and grade the pin against it rather than
 * against the resolver the user's `npm install` will run. When the kit reaches
 * 1.0 the caret's meaning changes, and this stays correct without being touched.
 */
export interface RegistryFacts {
  /** The version `pin` resolves to on the registry, or null if nothing does. */
  resolved: string | null;
  /** The deprecation message on `resolved`, or null when it carries none. */
  deprecation: string | null;
  /** The kit's current `latest` dist-tag. */
  latest: string;
}

/** Where a pin came from, so a failure names the artefact a reader must fix. */
export interface PinSubject {
  /** e.g. `create-kai@0.1.2 (published)` or `this working tree`. */
  label: string;
  /** The range itself, e.g. `^0.24.0`. */
  pin: string;
}

/**
 * The pin resolves to nothing on the registry.
 *
 * The live case is publishing `create-kai` BEFORE the kit version it was built
 * against — an emitted project would then fail `npm install` on the user's very
 * first command. The release workflow's publish order exists to prevent that;
 * this is what would notice if the order were ever broken.
 */
export function unresolvablePinProblem(
  subject: PinSubject,
  facts: RegistryFacts,
): string | null {
  if (facts.resolved !== null) return null;
  return (
    `${subject.label} pins @kitn.ai/ui@${subject.pin}, which resolves to NOTHING on the registry.\n` +
    `  The registry's latest is ${facts.latest}.\n` +
    '  A project scaffolded from this CLI would fail `npm install` on the first command its\n' +
    '  user runs. If a release is in flight, @kitn.ai/ui must publish before create-kai.'
  );
}

/**
 * The pin resolves to a DEPRECATED version.
 *
 * This is the security-shaped failure and it is reported first among the
 * resolvable ones, because "you are handing users a version its own author has
 * withdrawn" outranks "your pin is behind". npm prints deprecations on install,
 * but into the middle of a scaffold's own install output, where nobody reads it.
 */
export function deprecatedPinProblem(
  subject: PinSubject,
  facts: RegistryFacts,
): string | null {
  if (facts.resolved === null || facts.deprecation === null) return null;
  return (
    `${subject.label} pins @kitn.ai/ui@${subject.pin}, which resolves to ${facts.resolved} — ` +
    'and that version is DEPRECATED.\n' +
    `  npm says: ${facts.deprecation}\n` +
    `  The registry's latest is ${facts.latest}.\n` +
    '  Every project scaffolded from this CLI installs the deprecated version. Cut a\n' +
    '  create-kai release built against a kit the pin can actually reach.'
  );
}

/**
 * The pin resolves, but not to the kit's `latest`.
 *
 * THE ONE THAT CATCHES THE SILENT CASE. A pre-1.0 caret cannot cross a minor,
 * so the moment the kit publishes a new minor this becomes true of whatever
 * `create-kai` is on the registry — with no deprecation involved and nothing
 * else anywhere to notice. That is the invisible recurrence the incident above
 * only made visible by coinciding with a security release.
 *
 * Equality against `latest` rather than an ordering comparison, and it is the
 * stronger test in both directions: a pin resolving BEHIND latest is the strand,
 * and a pin resolving to something that is not latest at all (a stale dist-tag,
 * a version published out of order) is equally not what a user should be handed.
 * Neither needs semver arithmetic to state.
 */
export function strandedPinProblem(
  subject: PinSubject,
  facts: RegistryFacts,
): string | null {
  if (facts.resolved === null || facts.resolved === facts.latest) return null;
  return (
    `${subject.label} pins @kitn.ai/ui@${subject.pin}, which resolves to ${facts.resolved}, ` +
    `but the kit's latest is ${facts.latest}.\n` +
    '  Pre-1.0 a caret cannot cross a minor, so this pin can never reach the current kit —\n' +
    '  a user who scaffolds today gets a version behind and no upgrade path inside their\n' +
    '  own range. Cut a create-kai release so the pin is rebuilt against the current kit.\n' +
    '  Do NOT widen the range to cross minors: the kit ships breaking changes in minors\n' +
    '  pre-1.0, and the templates are verified against exactly one kit.'
  );
}

/**
 * Every rule against one pin, most serious first, first hit wins.
 *
 * One problem rather than a list: they are not independent findings but three
 * readings of the same pin, and the fix for all three is the same release.
 */
export function pinProblem(subject: PinSubject, facts: RegistryFacts): string | null {
  return (
    unresolvablePinProblem(subject, facts) ??
    deprecatedPinProblem(subject, facts) ??
    strandedPinProblem(subject, facts)
  );
}

/**
 * The pin baked into a BUILT `create-kai` bundle.
 *
 * Reads the artefact rather than the source, because the artefact is the thing
 * that shipped: this is pointed at `dist/index.js` unpacked from the tarball npm
 * is currently serving, which is the only place the published pin exists. The
 * repo's own source says what the NEXT build will bake, which is a different and
 * much less interesting question.
 *
 * Two shapes are accepted because esbuild's `define` substitution is an
 * implementation detail that has no promise attached to it:
 *
 *   · `` DEFAULT_KIT_RANGE = `^${"0.24.0"}` `` — what a non-minified `define`
 *     build emits today, and what `create-kai@0.1.2` on the registry contains.
 *   · `DEFAULT_KIT_RANGE = "^0.24.0"` — what constant folding or a minifier
 *     would leave behind.
 *
 * Returns null when it recognises NEITHER, and every caller must treat that as a
 * failure rather than as "no problem found". A silent null here would turn this
 * whole guard off the first time the bundler's output shape moved, which is
 * precisely the failure mode the guard exists to prevent.
 */
export function extractPinnedRange(bundle: string): string | null {
  const templated = /DEFAULT_KIT_RANGE\s*=\s*`\^\$\{\s*"([^"]+)"\s*\}`/.exec(bundle);
  if (templated) return derivePin(templated[1]);

  const folded = /DEFAULT_KIT_RANGE\s*=\s*["'`](\^[^"'`]+)["'`]/.exec(bundle);
  if (folded) return folded[1];

  return null;
}

/**
 * The pin in the BUILT BUNDLE disagrees with the kit in this tree.
 *
 * OFFLINE, AND NOT THE TAUTOLOGY. The check that cannot fail is the SOURCE-level
 * one: `derivePin(kitVersion)` against `kitVersion`, which is true by
 * construction for every version that exists. This is the ARTEFACT-level
 * question, and the two are different because they are separated by time. The
 * range is frozen into `dist/index.js` at build time; `packages/ui/package.json`
 * keeps moving afterwards. Nothing rebuilds the bundle when it does.
 *
 * So this fires whenever `dist/` was built against a different kit than the one
 * in the tree — which is exactly the artefact that must never be published,
 * because its pin is stale on the day it ships rather than months later.
 *
 * THE LIVE ROUTE TO IT IS THE BUILD CACHE. `CLAUDE.md` records that an NX cache
 * hit "looks exactly like a successful one" while restoring artefacts rather
 * than regenerating them. CI builds `create-kai` and publishes it in different
 * jobs; a restored `dist/index.js` from before a kit bump carries the old pin
 * and every downstream check still passes, because every other check reads the
 * templates or the tarball's file list and none of them look at this string.
 *
 * It also covers the plain human version: bumping the kit, then packing
 * `create-kai` without rebuilding.
 *
 * Takes the version rather than reading it, so `test/pin-guards.test.ts` can
 * drive both sides.
 */
export function stalePinProblem(
  builtPin: string,
  kitVersion: string,
  where = 'dist/index.js',
): string | null {
  const expected = derivePin(kitVersion);
  if (builtPin === expected) return null;
  return (
    `${where} pins @kitn.ai/ui@${builtPin}, but the kit in this tree is ${kitVersion}, ` +
    `which derives ${expected}.\n` +
    '  The bundle was built against a different kit than the one beside it, so publishing it\n' +
    '  would ship a pin that is stale on day one. Rebuild: `npm run build` in\n' +
    '  packages/create-kai. If the build appeared to succeed without doing this, suspect a\n' +
    '  restored build cache — a cache hit and a real build print the same thing.'
  );
}

/** Message for the case above, so the script does not author rule text. */
export function unreadablePinProblem(label: string): string {
  return (
    `could not find DEFAULT_KIT_RANGE in ${label}.\n` +
    '  The bundle exists but this guard cannot read the pin out of it, so it is checking\n' +
    '  NOTHING. Treat that as a failure, never as a pass: if the bundler output shape or\n' +
    '  the constant name changed, teach `extractPinnedRange` the new shape.'
  );
}
