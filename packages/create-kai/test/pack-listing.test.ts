/**
 * GUARD — the packed-listing parse works on every npm, and no npm version is
 * load-bearing for proving it.
 *
 * THE FAILURE. `create-kai@0.1.1`'s publish died in `prepublishOnly` with
 * `TypeError: Cannot read properties of undefined (reading 'files')`, leaving the
 * broken `0.1.0` on the registry. npm 12 moved the top level of `npm pack --json`
 * from an array to an object keyed by package name; `JSON.parse(raw)[0]` is
 * `undefined` under it. Full measurement in scripts/pack-listing.mjs.
 *
 * WHY FIXTURES AND NOT A SPAWN. test/verify-pack.test.ts shells out to whatever
 * npm is on PATH, which is the right thing for grading the RULES but is exactly
 * how this defect hid: on npm 10 that file is green whether or not the parse can
 * read npm 12, and on npm 12 it would have been uniformly red without saying
 * why. The two fixtures below are captured verbatim from real runs of
 * `npm pack --dry-run --json` in this package — every key, every nesting level
 * and the top-level container are npm's, with only the `files` array truncated
 * to five representative entries. So this file grades both shapes on a box that
 * has neither npm installed, which is what makes the parse version-independent
 * rather than merely fixed-for-now.
 *
 * The fixtures are SHAPE fixtures. They do not need updating when the templates
 * change; their entryCount and sizes are a snapshot and nothing asserts them.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// @ts-expect-error -- a .mjs build script with no type declarations, imported
// here on purpose: the thing under test must be the file the release runs.
import { readPackListing } from '../scripts/pack-listing.mjs';

const FIXTURES = path.join(__dirname, 'fixtures');
const raw = (file: string) => readFileSync(path.join(FIXTURES, file), 'utf8');

/** Captured from `npm pack --dry-run --json` at these exact versions. */
const NPM_10 = raw('npm-pack-json-10.9.8.json');
const NPM_12 = raw('npm-pack-json-12.0.2.json');

/** What both captures describe, in packed order. */
const EXPECTED = [
  'package.json',
  'dist/index.js',
  'dist/templates/nextjs/package.json',
  'dist/templates/nextjs/_npmrc',
  'dist/templates/nextjs/_gitignore',
];

describe('reading the packed listing across npm majors', () => {
  it('reads the npm 10 array shape', () => {
    const { paths, shape } = readPackListing(NPM_10, { npmVersion: '10.9.8' });
    expect(shape).toBe('array');
    expect(paths).toEqual(EXPECTED);
  });

  it('reads the npm 12 keyed-object shape — the one that broke the release', () => {
    const { paths, shape } = readPackListing(NPM_12, { npmVersion: '12.0.2' });
    expect(shape).toBe('keyed');
    expect(paths).toEqual(EXPECTED);
  });

  it('gets the SAME paths out of both, which is the whole claim', () => {
    // The container changed; the entry inside did not. If a future npm changes
    // the entry too, this is what notices rather than the shape assertions above.
    expect(readPackListing(NPM_12, { npmVersion: '12.0.2' }).paths).toEqual(
      readPackListing(NPM_10, { npmVersion: '10.9.8' }).paths,
    );
  });

  it('reproduces the original TypeError on the npm 12 fixture', () => {
    // THE DEFECT, PINNED. Every assertion above is satisfied by a parser that
    // was never broken in the first place; this is what proves the npm 12
    // fixture really is the shape that failed, and that the old one-liner really
    // does fail on it. Delete the fix and this is the test that stays green
    // while the two above go red — together they are the before/after.
    const old = () => (JSON.parse(NPM_12) as { files: unknown }[])[0]!.files;
    expect(old).toThrow(/Cannot read properties of undefined \(reading 'files'\)/);

    // And the same one-liner is fine on npm 10, which is why CI never saw it.
    expect(() => (JSON.parse(NPM_10) as { files: unknown }[])[0]!.files).not.toThrow();
  });
});

describe('an unrecognised shape fails loudly, naming the npm version', () => {
  // A silent fallback here is the failure mode this repo keeps hitting: an empty
  // listing would make the rules downstream report `dist/index.js is missing
  // from the tarball` and send a reader after a build problem that is not there.

  it('rejects a top level that is neither array nor object', () => {
    expect(() => readPackListing('"a string"', { npmVersion: '13.0.0' })).toThrow(
      /does not recognise[\s\S]*npm version: 13\.0\.0[\s\S]*not an array or object/,
    );
  });

  it('rejects stdout that is not JSON at all, and shows what it got', () => {
    // The pollution hypothesis, kept reachable. It is NOT what broke the release
    // — npm's warnings go to stderr, measured — but a future npm printing
    // progress on stdout lands here, and the excerpt is what would say so.
    expect(() =>
      readPackListing('npm notice packing...\n{"create-kai":{}}', { npmVersion: '13.0.0' }),
    ).toThrow(/stdout is not JSON[\s\S]*npm notice packing/);
  });

  it('rejects a listing with no files array rather than treating it as empty', () => {
    expect(() => readPackListing('[{"name":"create-kai"}]', { npmVersion: '13.0.0' })).toThrow(
      /no `files` array/,
    );
  });

  it('rejects more than one packed package instead of grading the first', () => {
    expect(() =>
      readPackListing('{"a":{"files":[]},"b":{"files":[]}}', { npmVersion: '13.0.0' }),
    ).toThrow(/expected exactly one packed package, got 2 \(a, b\)/);
  });

  it('rejects an empty container', () => {
    expect(() => readPackListing('[]', { npmVersion: '13.0.0' })).toThrow(
      /expected exactly one packed package, got 0/,
    );
  });

  it('rejects a files entry with no string path', () => {
    expect(() =>
      readPackListing('[{"files":[{"path":"ok"},{"size":1}]}]', { npmVersion: '13.0.0' }),
    ).toThrow(/files\[1\] has no string `path`/);
  });

  it('names the npm version in every one of those, since that is the actionable fact', () => {
    // Grouped deliberately: the version is what turns "this crashed" into "this
    // npm changed its output", and it is the first thing missing from a report
    // that sends someone debugging the wrong layer.
    const badInputs = ['"str"', 'not json', '[{"name":"x"}]', '{"a":{"files":[]},"b":{"files":[]}}'];
    for (const input of badInputs) {
      expect(() => readPackListing(input, { npmVersion: '99.1.2' })).toThrow(/npm version: 99\.1\.2/);
    }
  });
});
