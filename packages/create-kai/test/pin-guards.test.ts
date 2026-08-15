/**
 * The registry pin rules, exercised directly.
 *
 * The facts in these cases are not invented. They are what npm actually
 * returned for `@kitn.ai/ui` on the day `create-kai@0.1.2` was found pinning a
 * deprecated kit:
 *
 *     npm view '@kitn.ai/ui@^0.24.0' version   -> 0.24.0
 *     npm view '@kitn.ai/ui' version           -> 0.25.0
 *     npm view '@kitn.ai/ui@0.24.0' deprecated -> Security fix — please upgrade …
 *
 * So the central case below is the incident replayed against the rule, and the
 * control beside it is the same rule accepting the pin the fixed build emits.
 * `scripts/verify-pin.mjs` is I/O only; everything that decides is here, which
 * is what makes each rejection watchable without a network.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { derivePin } from '../src/kit-pin';
import {
  deprecatedPinProblem,
  extractPinnedRange,
  pinProblem,
  stalePinProblem,
  strandedPinProblem,
  unreadablePinProblem,
  unresolvablePinProblem,
} from '../src/pin-guards';
import type { RegistryFacts } from '../src/pin-guards';

const SUBJECT = { label: 'the PUBLISHED create-kai@0.1.2', pin: '^0.24.0' };

/** The registry as it stood when the stranded pin was found. */
const STRANDED: RegistryFacts = {
  resolved: '0.24.0',
  deprecation: 'Security fix — please upgrade to @kitn.ai/ui@0.25.0 or later.',
  latest: '0.25.0',
};

/** What a build against the current kit produces. */
const HEALTHY: RegistryFacts = {
  resolved: '0.25.0',
  deprecation: null,
  latest: '0.25.0',
};

describe('derivePin', () => {
  it('is a caret on the kit version', () => {
    expect(derivePin('0.25.0')).toBe('^0.25.0');
  });

  /**
   * The tautology, stated as a test so nobody re-derives it as a "guard".
   *
   * A build-time check that the derived range can resolve to the kit version in
   * the same tree cannot fail: the range is built FROM that version and a caret
   * always includes its own base. This asserts the shape that makes it
   * vacuous, so the reason the real check talks to the registry stays attached
   * to the code rather than living only in a docblock.
   */
  it('always embeds the exact version it was derived from — which is why a same-tree check is vacuous', () => {
    for (const version of ['0.16.0', '0.24.0', '0.25.0', '1.0.0']) {
      expect(derivePin(version)).toBe(`^${version}`);
      expect(derivePin(version).endsWith(version)).toBe(true);
    }
  });
});

describe('stalePinProblem — the offline half, and NOT the tautology', () => {
  /**
   * The distinction this rule turns on, made concrete.
   *
   * SOURCE level: `derivePin(v)` against `v` is true for every `v`, so a check
   * there can never fail — see the `derivePin` case above.
   * ARTEFACT level: the pin was frozen into `dist/index.js` at build time and
   * the kit in the tree has moved since. That can absolutely be false, and this
   * is the pin `create-kai@0.1.2` shipped.
   */
  it('fires on a bundle built against an older kit', () => {
    const problem = stalePinProblem('^0.24.0', '0.25.0');
    expect(problem).not.toBeNull();
    expect(problem).toContain('^0.24.0');
    expect(problem).toContain('0.25.0');
    // The cache is the live route to this state, so the message has to name it.
    expect(problem).toContain('build cache');
  });

  it('fires on a bundle built against a NEWER kit than the tree', () => {
    expect(stalePinProblem('^0.26.0', '0.25.0')).not.toBeNull();
  });

  it('is silent when the bundle matches the kit beside it', () => {
    expect(stalePinProblem('^0.25.0', '0.25.0')).toBeNull();
  });

  /**
   * The tautology check, run as a loop: for ANY kit version, a bundle built
   * from that same version is accepted. If this rule ever rejected one of
   * these it would be rejecting a correct build.
   */
  it('accepts every version paired with its own derived pin', () => {
    for (const version of ['0.16.0', '0.24.0', '0.25.0', '1.2.3']) {
      expect(stalePinProblem(derivePin(version), version)).toBeNull();
    }
  });
});

describe('unresolvablePinProblem', () => {
  it('fires when the range matches nothing on the registry', () => {
    const problem = unresolvablePinProblem(
      { label: 'this working tree (kit 0.26.0)', pin: '^0.26.0' },
      { resolved: null, deprecation: null, latest: '0.25.0' },
    );
    expect(problem).not.toBeNull();
    expect(problem).toContain('resolves to NOTHING');
    // It has to name the publish-order fix, because that is the live cause.
    expect(problem).toContain('@kitn.ai/ui must publish before create-kai');
  });

  it('is silent when the range resolves', () => {
    expect(unresolvablePinProblem(SUBJECT, STRANDED)).toBeNull();
    expect(unresolvablePinProblem(SUBJECT, HEALTHY)).toBeNull();
  });
});

describe('deprecatedPinProblem', () => {
  it('fires on the pin create-kai@0.1.2 actually shipped', () => {
    const problem = deprecatedPinProblem(SUBJECT, STRANDED);
    expect(problem).not.toBeNull();
    expect(problem).toContain('DEPRECATED');
    // npm's own words are quoted rather than paraphrased — the reader needs to
    // know it is a security withdrawal, and only npm can say so.
    expect(problem).toContain('Security fix');
    expect(problem).toContain('0.24.0');
  });

  it('is silent when the resolved version carries no deprecation', () => {
    expect(deprecatedPinProblem(SUBJECT, HEALTHY)).toBeNull();
  });

  it('is silent when nothing resolved — that is the other rule\'s finding', () => {
    expect(
      deprecatedPinProblem(SUBJECT, { resolved: null, deprecation: null, latest: '0.25.0' }),
    ).toBeNull();
  });
});

describe('strandedPinProblem', () => {
  /**
   * THE SILENT RECURRENCE. No deprecation anywhere in these facts — this is the
   * shape every future kit minor produces, and the shape nothing in the repo
   * could see before this rule existed.
   */
  it('fires when a pre-1.0 caret cannot reach the current kit, with no deprecation involved', () => {
    const problem = strandedPinProblem(
      { label: 'the PUBLISHED create-kai@0.1.3', pin: '^0.25.0' },
      { resolved: '0.25.0', deprecation: null, latest: '0.26.0' },
    );
    expect(problem).not.toBeNull();
    expect(problem).toContain('cannot cross a minor');
    // The rejected fix is named at the point of failure, because widening the
    // range is the first thing a reader reaches for here.
    expect(problem).toContain('Do NOT widen the range');
  });

  it('fires on the incident facts too', () => {
    expect(strandedPinProblem(SUBJECT, STRANDED)).not.toBeNull();
  });

  it('is silent when the pin resolves to latest', () => {
    expect(strandedPinProblem(SUBJECT, HEALTHY)).toBeNull();
  });
});

describe('pinProblem', () => {
  it('reports the deprecation ahead of the strand — both are true, one is urgent', () => {
    const problem = pinProblem(SUBJECT, STRANDED);
    expect(problem).toContain('DEPRECATED');
  });

  it('reports an unresolvable pin ahead of everything else', () => {
    const problem = pinProblem(SUBJECT, {
      resolved: null,
      deprecation: null,
      latest: '0.25.0',
    });
    expect(problem).toContain('resolves to NOTHING');
  });

  /**
   * The control. Without this the suite above would pass just as happily
   * against a rule that returns a string unconditionally.
   */
  it('accepts a pin that resolves to a healthy latest', () => {
    expect(pinProblem({ label: 'this working tree', pin: '^0.25.0' }, HEALTHY)).toBeNull();
  });
});

describe('extractPinnedRange', () => {
  /**
   * The literal bytes from `create-kai@0.1.2`'s published `dist/index.js`,
   * copied off the unpacked tarball rather than written from memory. This is
   * what esbuild's `define` substitution leaves behind un-minified.
   */
  it('reads the shape the published tarball actually carries', () => {
    expect(extractPinnedRange('var DEFAULT_KIT_RANGE = `^${"0.24.0"}`;')).toBe('^0.24.0');
  });

  it('reads a constant-folded or minified pin', () => {
    expect(extractPinnedRange('var DEFAULT_KIT_RANGE="^0.25.0";')).toBe('^0.25.0');
    expect(extractPinnedRange("const DEFAULT_KIT_RANGE = '^0.25.0'")).toBe('^0.25.0');
  });

  it('finds the pin inside a whole bundle, not just an isolated line', () => {
    const bundle = [
      'var HELP = `create-kai`;',
      'var DEFAULT_KIT_RANGE = `^${"0.24.0"}`;',
      'function main() { return DEFAULT_KIT_RANGE; }',
    ].join('\n');
    expect(extractPinnedRange(bundle)).toBe('^0.24.0');
  });

  /**
   * Returning null is the case that must never be read as "no problem found".
   * A bundler output change would otherwise turn the whole guard off silently,
   * which is the exact failure class it was written against.
   */
  it('returns null when it recognises nothing, and the caller has a message for that', () => {
    expect(extractPinnedRange('var SOMETHING_ELSE = "^0.25.0";')).toBeNull();
    expect(unreadablePinProblem('create-kai@9.9.9')).toContain('checking\n  NOTHING');
  });

  /**
   * THE ONE THAT KEEPS THE OTHERS HONEST: the reader is pointed at the bundle
   * THIS BUILD JUST PRODUCED, not at a fixture of one.
   *
   * Every case above is a string written in this file, so all of them would go
   * on passing after a bundler change silently moved the shape of the real
   * artefact — and `verify-pin.mjs` would then fail at RELEASE time, on a cut
   * tag, which is the worst moment to discover it. This is also not
   * hypothetical: substituting `__KIT_VERSION__` and deriving the caret in the
   * CLI left `dist/index.js` carrying `` `^${"0.24.0"}` ``, and routing that
   * through a helper turned it into `derivePin("0.25.0")` — two different
   * expressions for one constant, neither of them a string. That is why the
   * build now substitutes the finished range.
   *
   * Needs `npm run build` first, like the other suites that read `dist/`. CI
   * runs the build before the tests, so skipping locally cannot hide a failure
   * from the gate.
   */
  it('reads the pin out of the freshly built dist/index.js', () => {
    const bundle = path.resolve(__dirname, '../dist/index.js');
    if (!existsSync(bundle)) {
      throw new Error(
        `${bundle} does not exist — run \`npm run build\` in packages/create-kai first. ` +
          'This case exists to prove the guard can read a REAL bundle, so skipping it ' +
          'when the bundle is absent would defeat its whole purpose.',
      );
    }
    const kitVersion = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../ui/package.json'), 'utf8'),
    ).version;

    expect(extractPinnedRange(readFileSync(bundle, 'utf8'))).toBe(derivePin(kitVersion));
  });
});
