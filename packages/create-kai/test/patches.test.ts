/**
 * The patch primitives, and specifically the `multiple` opt-in.
 *
 * `multiple` widens a guard that exists for a reason, so what is asserted here
 * is the SHAPE of the hole: every occurrence changes when a patch opts in, only
 * the first is eligible when it does not, and a replace-all that replaces
 * nothing is fatal rather than a silent no-op.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { PATCHES, applyPatch, countMatches, patchRegExp } from '../src/patches';
import type { Patch } from '../src/patches';

const STARTERS = path.resolve(__dirname, '../../../examples/starters');

const patch = (over: Partial<Patch> = {}): Patch => ({
  file: 'x.json',
  find: /NAME/,
  replace: (name) => name,
  why: 'test',
  ...over,
});

describe('applyPatch', () => {
  it('rewrites every occurrence when a patch opts into multiple', () => {
    const source = 'a NAME b NAME c NAME';
    expect(applyPatch(patch({ multiple: true }), source, 'my-app')).toBe(
      'a my-app b my-app c my-app',
    );
  });

  it('rewrites only the first when it does not', () => {
    // The reason the build refuses this case rather than allowing it: the
    // result is a half-patched file, which is worse than either outcome.
    expect(applyPatch(patch(), 'a NAME b NAME', 'my-app')).toBe('a my-app b NAME');
  });

  it('throws when a multiple patch matches nothing, rather than replacing nothing', () => {
    // A global replace over a source with no match returns the source unchanged
    // and reports success. That is the vacuous pass this throw exists to stop.
    expect(() => applyPatch(patch({ multiple: true }), 'nothing here', 'my-app')).toThrow(
      /no longer matches its template/,
    );
  });

  it('throws when an ordinary patch matches nothing', () => {
    expect(() => applyPatch(patch(), 'nothing here', 'my-app')).toThrow(
      /no longer matches its template/,
    );
  });

  it('does not carry lastIndex between calls on a global find', () => {
    // A `g` regex hoisted into the table would be stateful: the second scaffold
    // in a process would start searching where the first stopped and throw
    // "no longer matches" on a file that plainly does. patchRegExp rebuilds it.
    const p = patch({ find: /NAME/g, multiple: true });
    for (let i = 0; i < 3; i++) {
      expect(applyPatch(p, 'NAME and NAME', 'my-app')).toBe('my-app and my-app');
    }
  });

  it('builds valid flags even when the table already carries g', () => {
    // `new RegExp(source, flags + 'g')` — what the build did — throws
    // "Invalid flags" here.
    expect(() => patchRegExp(patch({ find: /NAME/gi, multiple: true }))).not.toThrow();
    expect(patchRegExp(patch({ find: /NAME/gi, multiple: true })).flags).toBe('gi');
    expect(patchRegExp(patch({ find: /NAME/i })).flags).toBe('i');
  });
});

describe('countMatches', () => {
  it('counts every occurrence regardless of the opt-in', () => {
    expect(countMatches(patch(), 'NAME NAME NAME')).toBe(3);
    expect(countMatches(patch({ multiple: true }), 'NAME NAME NAME')).toBe(3);
    expect(countMatches(patch(), 'none')).toBe(0);
  });
});

describe('the angular.json rename', () => {
  const angularJson = PATCHES.angular.find((p) => p.file === 'angular.json')!;

  it('is the only patch in the whole table that opts into multiple', () => {
    // The opt-in should stay rare. If a second patch needs it, that is worth
    // noticing rather than absorbing.
    const opted = Object.entries(PATCHES).flatMap(([dir, list]) =>
      list.filter((p) => p.multiple).map((p) => `${dir}/${p.file}`),
    );
    expect(opted).toEqual(['angular/angular.json']);
  });

  it('renames all four sites the Angular builder reads', async () => {
    const source = await readFile(path.join(STARTERS, 'angular/angular.json'), 'utf8');
    // Four, and the count is Angular's, not ours — which is the argument for
    // `multiple` over four context-pinned patches.
    expect(countMatches(angularJson, source)).toBe(4);

    const patched = applyPatch(angularJson, source, 'my-app');
    expect(patched).not.toContain('ui-example-angular');

    const json = JSON.parse(patched);
    expect(Object.keys(json.projects)).toEqual(['my-app']);
    // The defect in one line: without this the user's `ng build` wrote into
    // dist/ui-example-angular.
    expect(json.projects['my-app'].architect.build.options.outputPath).toBe('dist/my-app');
    expect(json.projects['my-app'].architect.serve.configurations).toMatchObject({
      production: { buildTarget: 'my-app:build:production' },
      development: { buildTarget: 'my-app:build:development' },
    });
  });
});
