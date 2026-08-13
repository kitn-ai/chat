/**
 * What the smoke run has to invoke to have actually checked a project.
 *
 * These read the REAL `examples/starters/*` package.json files rather than
 * restating their scripts, because the thing under test is a claim about those
 * starters: that six of them typecheck inside their own build and TanStack Start
 * does not. A hardcoded copy of the scripts would keep passing after a starter
 * changed its build, which is the failure this is here to prevent.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildTypechecks, scriptsToRun } from '../src/starter-scripts';

const STARTERS = path.resolve(__dirname, '../../../examples/starters');

const starterScripts = (name: string): Record<string, string | undefined> => {
  const pkg = path.join(STARTERS, name, 'package.json');
  return JSON.parse(readFileSync(pkg, 'utf8')).scripts ?? {};
};

const starterNames = readdirSync(STARTERS).filter((n) =>
  existsSync(path.join(STARTERS, n, 'package.json')),
);

describe('which scripts prove an emitted project compiles', () => {
  it('found the starters to check (a zero-length sweep is not a pass)', () => {
    expect(starterNames.length).toBeGreaterThanOrEqual(8);
  });

  /**
   * The whole point. `vite build` transpiles TypeScript with esbuild, which
   * strips types without checking them, so smoke's `npm run build` said nothing
   * about whether a TanStack project compiles.
   */
  it('runs typecheck after build for tanstack-start, whose build never typechecks', () => {
    const scripts = starterScripts('tanstack-start');
    expect(scripts.build).toBe('vite build');
    expect(buildTypechecks(scripts.build!)).toBe(false);
    expect(scriptsToRun(scripts)).toEqual(['build', 'typecheck']);
  });

  it('builds only, for the starters whose build already typechecks', () => {
    // react chains tsc, next build typechecks on its own — two different shapes
    // of "already covered", so neither is a lucky single case.
    expect(scriptsToRun(starterScripts('react'))).toEqual(['build']);
    expect(scriptsToRun(starterScripts('nextjs'))).toEqual(['build']);
  });

  it('leaves no starter unchecked, and never repeats a typecheck', () => {
    for (const name of starterNames) {
      const scripts = starterScripts(name);
      const toRun = scriptsToRun(scripts);
      expect(toRun[0], `${name} must build first`).toBe('build');
      expect(
        toRun.includes('typecheck'),
        `${name}: build is \`${scripts.build}\``,
      ).toBe(!buildTypechecks(scripts.build!));
    }
  });

  it('typechecks after building, never before (routeTree.gen.ts is built)', () => {
    expect(scriptsToRun(starterScripts('tanstack-start'))).toEqual(['build', 'typecheck']);
  });
});

describe('refusing what it cannot check', () => {
  it('throws on a project with no build script', () => {
    expect(() => scriptsToRun({})).toThrow(/no `build` script/);
  });

  it('throws when the build skips types and nothing else checks them', () => {
    expect(() => scriptsToRun({ build: 'vite build' })).toThrow(/checked by nobody/);
  });

  /**
   * Negative control. If `buildTypechecks` matched anything at all, the rule
   * above would return `['build']` for everything and the tanstack case would
   * silently stop being covered.
   */
  it('does not treat a bare bundler as a typechecker', () => {
    expect(buildTypechecks('vite build')).toBe(false);
    expect(buildTypechecks('rollup -c')).toBe(false);
    expect(buildTypechecks('tsc -b && vite build')).toBe(true);
  });
});
