/**
 * The publish shape: whether a tarball can be produced without a build.
 *
 * THE DEFECT THIS EXISTS FOR, reproduced before it was fixed: `files: ["dist"]`
 * and `bin: {create-kai: "./dist/index.js"}` both point into a directory that is
 * gitignored, and nothing in the manifest built it. So on a fresh checkout
 * `npm pack` emitted a two-file tarball — README.md and package.json — and
 * EXITED 0. npm does not check that a `bin` target exists, so the failure has no
 * output at all: `npm publish` succeeds, and the first person to learn about it
 * is a user running `npx create-kai` against a CLI with no code in it.
 *
 * `packages/ui` was only ever safe from this because it carries
 * `prepublishOnly: "npm run build"`, which is the same fix by hand.
 *
 * WHAT THIS GRADES, and why it is not an assertion that a string is present. A
 * literal `expect(scripts.prepublishOnly).toBe('npm run build && npm run
 * verify:pack')` would be satisfied by the string and blind to every way the
 * contract behind it can rot: the hook renamed to one npm does not run before
 * packing, the `build` script renamed under it, the whole chain moved behind an
 * intermediate script. So the rule below derives the requirement instead — if a
 * shipped path cannot exist in a checkout, some hook npm runs before it packs
 * has to produce it — and grades the manifest against it.
 *
 * KNOWN LIMIT, since the neighbouring gate's is stated and this one should be
 * too: this proves a build RUNS before packing. It does not prove the build is
 * correct, that the bin executes, or that the CLI scaffolds a working app.
 * `scripts/verify-pack.mjs` covers the next layer out (the packed tarball really
 * has `dist/index.js`, non-empty templates, and a `_gitignore` rather than a
 * stripped `.gitignore`) and is the second half of the hook this file requires.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PKG_ROOT = path.resolve(__dirname, '..');
const WORKFLOW = path.resolve(PKG_ROOT, '../../.github/workflows/test.yml');

type Manifest = {
  bin?: string | Record<string, string>;
  files?: string[];
  scripts?: Record<string, string>;
};

const live = JSON.parse(readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')) as Manifest;

/**
 * The hooks npm runs BEFORE it produces a publish tarball, in npm's order.
 *
 * The membership of this list is the whole rule, so the near-misses are worth
 * naming: `prepublish` has not run on publish since npm 5 (it runs on install),
 * and `postpublish` runs after the tarball is already on the registry. Either
 * one reads correct in a diff and builds nothing.
 */
const PREPACK_HOOKS = ['prepublishOnly', 'prepack', 'prepare'] as const;

/** Everything the manifest promises to ship, normalised to a comparable path. */
function shippedPaths(manifest: Manifest): string[] {
  const bin = manifest.bin;
  const binTargets = typeof bin === 'string' ? [bin] : Object.values(bin ?? {});
  return [...(manifest.files ?? []), ...binTargets].map((p) => p.replace(/^\.\//, ''));
}

/**
 * Every script a command reaches, following `npm run` / `pnpm run` through
 * intermediate scripts so a chain moved behind one name still counts.
 *
 * Returns what it reached and what it could not: a hook naming a script this
 * package no longer has is the rename case, and npm would only report it at
 * publish time.
 */
function invokedScripts(
  manifest: Manifest,
  command: string,
): { reached: Set<string>; missing: Set<string> } {
  const scripts = manifest.scripts ?? {};
  const reached = new Set<string>();
  const missing = new Set<string>();
  const queue = [command];

  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const match of current.matchAll(/\b(?:npm|pnpm)\s+run(?:-script)?\s+([^\s&|;]+)/g)) {
      const name = match[1]!;
      if (reached.has(name) || missing.has(name)) continue;
      if (!(name in scripts)) {
        missing.add(name);
        continue;
      }
      reached.add(name);
      queue.push(scripts[name]!);
    }
  }
  return { reached, missing };
}

/**
 * THE RULE. A manifest that ships a path no checkout can contain must build it
 * from a hook npm runs before packing.
 *
 * `isIgnored` is injected rather than shelled out to, so the tests below can
 * state both halves of the premise — including the case where it does not hold.
 */
function publishBuildProblem(
  manifest: Manifest,
  isIgnored: (relative: string) => boolean,
  requiredScript: string,
): string | null {
  const ignored = shippedPaths(manifest).filter(isIgnored);
  // Nothing shipped is generated, so a checkout already contains the tarball's
  // contents and no hook is needed. Scoping this matters: a rule that demanded
  // a build hook of every package would be noise in the one place it fires.
  if (ignored.length === 0) return null;

  const present = PREPACK_HOOKS.filter((hook) => manifest.scripts?.[hook]);
  if (present.length === 0) {
    return (
      `create-kai publish: ships ${ignored.join(', ')}, which is gitignored, but declares none of ` +
      `${PREPACK_HOOKS.join(', ')} — npm packs whatever is on disk and exits 0, so a fresh ` +
      `checkout publishes a tarball with no ${requiredScript} output in it and no error anywhere`
    );
  }

  for (const hook of present) {
    const { missing } = invokedScripts(manifest, manifest.scripts![hook]!);
    if (missing.size > 0) {
      return (
        `create-kai publish: ${hook} runs \`npm run ${[...missing].join('`, `npm run ')}\`, which ` +
        `this package has no script for — the hook fails at publish time, or was left behind by a ` +
        `rename`
      );
    }
  }

  const builds = present.some(
    (hook) => invokedScripts(manifest, manifest.scripts![hook]!).reached.has(requiredScript),
  );
  if (!builds) {
    return (
      `create-kai publish: ${present.join(', ')} never reaches \`${requiredScript}\`, so nothing ` +
      `produces ${ignored.join(', ')} before npm packs it`
    );
  }

  return null;
}

/** Mirrors `test/build-guards.test.ts`: a null here is a rule that stopped rejecting. */
function expectRejected(problem: string | null, ...fragments: string[]): void {
  expect(problem, 'the rule returned null: it accepted a defect it exists to reject').not.toBeNull();
  for (const fragment of fragments) expect(problem).toContain(fragment);
}

/** git is the authority on what a checkout contains; `.gitignore` alone is not. */
function gitIgnores(relative: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', relative], { cwd: PKG_ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('the publish-build hook', () => {
  it('rejects the tree exactly as it shipped: a gitignored bin target, no hook', () => {
    // Derived from the LIVE manifest with the hook lifted back out, rather than
    // a fixture — a hand-written manifest would keep agreeing with itself after
    // this package's `files`/`bin` moved, which is the drift being guarded.
    const { prepublishOnly: _removed, ...scripts } = live.scripts ?? {};
    expectRejected(
      publishBuildProblem({ ...live, scripts }, gitIgnores, 'build'),
      'dist/index.js',
      'gitignored',
      'exits 0',
    );
  });

  it('rejects the hook renamed to one npm does not run before packing', () => {
    // Both near-misses, because both read correct in a diff. This is the
    // "renamed again" half of the regression: the script survives, the name
    // stops being a hook, and every local signal stays green.
    const { prepublishOnly: hook, ...rest } = live.scripts ?? {};
    // Without this the mutants below are `{prepublish: undefined}` the moment
    // the live hook goes missing, and each one would still be "rejected" —
    // for the absence of the hook rather than for its name. Green for the
    // wrong reason is the failure mode this file exists to avoid.
    expect(typeof hook, 'no live prepublishOnly to rename: the mutants are vacuous').toBe('string');

    for (const name of ['prepublish', 'postpublish', 'publish:prepare']) {
      expectRejected(
        publishBuildProblem({ ...live, scripts: { ...rest, [name]: hook! } }, gitIgnores, 'build'),
        'declares none of',
        'prepublishOnly',
      );
    }
  });

  it('rejects a hook that verifies the tarball but never builds one', () => {
    // The half-fix: `verify:pack` alone is the check without the thing it
    // checks. It would fail at publish rather than pass, but it fails saying
    // the tarball is wrong instead of saying nothing built it.
    expectRejected(
      publishBuildProblem(
        { ...live, scripts: { ...live.scripts, prepublishOnly: 'npm run verify:pack' } },
        gitIgnores,
        'build',
      ),
      'never reaches `build`',
    );
  });

  it('rejects a hook left pointing at a script that has been renamed under it', () => {
    // `build` -> `compile`, hook untouched. npm reports this only when someone
    // runs `npm publish`, which is the one moment nobody wants a surprise.
    const { build, ...rest } = live.scripts ?? {};
    expect(typeof build, 'no live build script to rename: the mutant is vacuous').toBe('string');
    expectRejected(
      publishBuildProblem({ ...live, scripts: { ...rest, compile: build! } }, gitIgnores, 'build'),
      'has no script for',
      'npm run build',
    );
  });

  it('follows the chain through an intermediate script', () => {
    // THE OVER-NARROWNESS CONTROL. A rule that only read the hook's own text
    // would reject this refactor, and the next author would delete the rule
    // rather than the refactor.
    expect(
      publishBuildProblem(
        {
          ...live,
          scripts: {
            ...live.scripts,
            prepublishOnly: 'npm run release:prepare',
            'release:prepare': 'npm run build && npm run verify:pack',
          },
        },
        gitIgnores,
        'build',
      ),
    ).toBeNull();
  });

  it('says nothing about a package whose shipped files are tracked', () => {
    // THE OVER-BREADTH CONTROL. The hazard is a shipped path that cannot exist
    // in a checkout; a package that commits what it ships has no such path, and
    // a rule that fired there would be ceremony.
    const { prepublishOnly: _removed, ...scripts } = live.scripts ?? {};
    expect(publishBuildProblem({ ...live, scripts }, () => false, 'build')).toBeNull();
  });

  it('holds the live manifest', () => {
    // THE CONTROL, and the live check at once.
    expect(publishBuildProblem(live, gitIgnores, 'build')).toBeNull();
  });

  it('rests on a premise that is still true: what this ships is generated', () => {
    // VACUITY GUARD. Every assertion above is scoped by `ignored.length > 0`;
    // if `dist/` were ever committed, the rule would return null everywhere and
    // this file would pass while grading nothing.
    const ignored = shippedPaths(live).filter(gitIgnores);
    expect(ignored, 'nothing this package ships is gitignored — the rule above is now vacuous')
      .not.toEqual([]);
    expect(ignored).toContain('dist/index.js');
  });

  it('runs the tarball verifier from the same hook, not only the build', () => {
    // A build alone can still produce an unshippable tarball: `files: ["dist"]`
    // carrying no `dist/templates`, or a template whose `.gitignore` npm
    // stripped on the way in. `scripts/verify-pack.mjs` is what reads the packed
    // result, so the hook has to reach it too.
    const hook = live.scripts?.prepublishOnly;
    expect(typeof hook, 'no prepublishOnly at all — see the rule above').toBe('string');

    const { reached, missing } = invokedScripts(live, hook!);
    expect(missing).toEqual(new Set());
    expect([...reached].sort()).toEqual(['build', 'verify:pack']);
  });
});

/**
 * And the same rot check one layer out: CI has to keep running the verifier.
 *
 * `verify:pack` existed in this package for some time while being invoked from
 * nowhere automatic — so both failure modes it was written for were unguarded on
 * the merge path, and the hook above was going to be the first thing to ever run
 * it. A check that runs nowhere is the shape of the bug it guards against; this
 * is the same wiring assertion `tests/agent-tooling/emitted-project-wiring.test.ts`
 * makes for the emitted project.
 */
describe('the CI wiring for the tarball verifier', () => {
  /** Every command the workflow runs, flattened — step names are not commands. */
  function runCommands(workflow: string): string[] {
    return [...workflow.matchAll(/^\s*(?:- )?run: (?:\|[-+]?\s*\n)?([\s\S]*?)(?=\n\s*(?:- |[a-z-]+:))/gm)]
      .map((m) => m[1]!.trim())
      .filter(Boolean);
  }

  const invokesVerifyPack = (commands: string[]) =>
    commands.filter((c) => c.includes('create-kai') && c.includes('verify:pack'));

  it('runs create-kai verify:pack somewhere in the workflow', () => {
    expect(invokesVerifyPack(runCommands(readFileSync(WORKFLOW, 'utf8')))).not.toEqual([]);
  });

  it('would notice if that step were deleted', () => {
    // THE CONTROL FOR THE CHECK ITSELF. The matcher above returns [] both when
    // the step is gone and when the parse is broken, so watch it find the step
    // and then lose it against a workflow with the step removed.
    const workflow = readFileSync(WORKFLOW, 'utf8');
    const commands = runCommands(workflow);
    // Vacuity: a parse that found nothing at all would "pass" the removal case.
    expect(commands.length, 'parsed no run: commands — the matcher is broken').toBeGreaterThan(10);

    const found = invokesVerifyPack(commands);
    // Counted rather than assumed to be one: the workflow runs verify:pack twice
    // on purpose (see the npm-pin block below), and hardcoding `- 1` here would
    // have to be edited by hand every time that changes — which is how a control
    // gets "fixed" into passing.
    expect(found.length).toBeGreaterThan(0);

    const without = commands.filter((c) => !(c.includes('create-kai') && c.includes('verify:pack')));
    expect(without.length).toBe(commands.length - found.length);
    expect(invokesVerifyPack(without)).toEqual([]);
  });
});

/**
 * THE SKEW THAT LET AN NPM CHANGE TAKE DOWN A RELEASE.
 *
 * `verify:pack` runs in the test job under node 22's bundled npm (10.9.8) and in
 * `prepublishOnly` under the npm the RELEASE job installs for OIDC trusted
 * publishing. Those were different majors and nothing said so. npm 12 moved the
 * top level of `npm pack --json` from an array to an object keyed by package
 * name, so the guard threw `TypeError: Cannot read properties of undefined
 * (reading 'files')` the first time it ever ran under npm 12 — which was at
 * publish time, on a cut tag, after @kitn.ai/ui@0.24.0 had already gone out.
 *
 * The fix has three parts, and this is the third: the parser handles both shapes
 * (scripts/pack-listing.mjs), the test job now runs `verify:pack` a second time
 * under the pinned npm (.github/workflows/test.yml), and THIS keeps those two
 * workflows naming the same version. Without it the pin can be bumped in the
 * release workflow alone and the extra CI step goes back to exercising an npm
 * nobody publishes with, silently — the failure mode, one level up, is identical
 * to the one it is guarding.
 */
describe('the npm the release job pins is the npm CI exercises', () => {
  const RELEASE_WORKFLOW = path.resolve(PKG_ROOT, '../../.github/workflows/release-please.yml');

  /** The exact version the release job installs globally before publishing. */
  const releasePin = (yaml: string): string[] =>
    [...yaml.matchAll(/npm install -g npm@(\d+\.\d+\.\d+)/g)].map((m) => m[1]!);

  /** The versions the test job installs to re-run verify:pack under. */
  const testJobPins = (yaml: string): string[] =>
    runCommandsIn(yaml)
      .filter((c) => c.includes('VERIFY_PACK_NPM'))
      .flatMap((c) => [...c.matchAll(/npm@(\d+\.\d+\.\d+)/g)].map((m) => m[1]!));

  /** Same flattening as above; duplicated locally so the blocks stay independent. */
  function runCommandsIn(workflow: string): string[] {
    return [
      ...workflow.matchAll(/^\s*(?:- )?run: (?:\|[-+]?\s*\n)?([\s\S]*?)(?=\n\s*(?:- |[a-z-]+:))/gm),
    ]
      .map((m) => m[1]!.trim())
      .filter(Boolean);
  }

  it('finds an exact pin in the release workflow', () => {
    // VACUITY CONTROL. Every assertion below compares two extractions; if either
    // regex stopped matching, the comparison would be [] === [] and pass.
    expect(releasePin(readFileSync(RELEASE_WORKFLOW, 'utf8'))).toHaveLength(1);
  });

  it('finds the test job running verify:pack under an explicitly installed npm', () => {
    const pins = testJobPins(readFileSync(WORKFLOW, 'utf8'));
    expect(pins, 'no VERIFY_PACK_NPM step in test.yml — the guard runs on one npm again').toHaveLength(
      1,
    );
  });

  it('and they are the same version', () => {
    const [release] = releasePin(readFileSync(RELEASE_WORKFLOW, 'utf8'));
    const [test] = testJobPins(readFileSync(WORKFLOW, 'utf8'));
    expect(test, `test.yml exercises npm ${test}, but the release publishes on npm ${release}`).toBe(
      release,
    );
  });

  it('would notice a drift', () => {
    // THE CONTROL FOR THE COMPARISON. Bump the release pin in a copy of the YAML
    // and require the equality to break — otherwise "they are the same version"
    // is satisfied by two extractions that are both undefined.
    const drifted = readFileSync(RELEASE_WORKFLOW, 'utf8').replace(
      /npm install -g npm@\d+\.\d+\.\d+/,
      'npm install -g npm@13.4.5',
    );
    expect(releasePin(drifted)).toEqual(['13.4.5']);
    expect(testJobPins(readFileSync(WORKFLOW, 'utf8'))[0]).not.toBe('13.4.5');
  });
});
