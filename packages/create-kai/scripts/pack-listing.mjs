/**
 * Read the file listing out of `npm pack --dry-run --json`, on every npm this
 * repo runs.
 *
 * THE DEFECT THIS EXISTS FOR, because it took down a release that was already
 * half-published. Merging the release PR published `@kitn.ai/ui@0.24.0`, then
 * ran `create-kai`'s `prepublishOnly` -> `npm run verify:pack` and died:
 *
 *     verify-pack.mjs:80
 *     const files = JSON.parse(raw)[0].files.map((f) => f.path);
 *                                     ^
 *     TypeError: Cannot read properties of undefined (reading 'files')
 *
 * `create-kai@0.1.1` never reached the registry, so the broken `0.1.0` — which
 * cannot scaffold `nextjs` or `tanstack-start` at all — stayed the published
 * version, and the guard that was written to catch exactly that class of defect
 * is what blocked its own fix from shipping.
 *
 * NPM 12 CHANGED THE TOP-LEVEL CONTAINER. Measured here, not reasoned about, by
 * running the same command in the same package against three npms:
 *
 *   npm 10.9.8  [ { id, name, ..., files: [{path,size,mode}], entryCount } ]
 *   npm 11.19.0 [ { ...same... } ]
 *   npm 12.0.2  { "create-kai": { ...same entry, byte for byte... } }
 *
 * An ARRAY became an OBJECT KEYED BY PACKAGE NAME. The entry inside is
 * unchanged — the 178 paths come out identical from all three once the
 * container is normalised — so `[0]` is `undefined` under npm 12 and nothing
 * before the `.files` access can tell.
 *
 * IT IS NOT STDOUT POLLUTION, which was the other candidate and is worth ruling
 * out in writing because the run log is full of `npm warn Unknown user config
 * "always-auth"`. Reproduced with a userconfig planting that exact key: the
 * warning goes to STDERR (152 bytes) and stdout stays pure JSON, byte-identical
 * to the run without it. The parse never failed; the container did.
 *
 * WHY EVERY LOCAL AND CI RUN WAS GREEN. `verify:pack` is exercised in
 * .github/workflows/test.yml under node 22's bundled npm — 10.9.8, the array
 * shape. The only thing that has ever run npm 12.0.2 is the release job, which
 * installs it for OIDC trusted publishing. So the one npm the guard had to work
 * under was the one npm it was never run under, and publish time was the first
 * execution. That skew is closed at both ends: the parser is graded against
 * committed captures of both shapes in test/pack-listing.test.ts, so no npm
 * version is load-bearing for correctness, and the test job now runs
 * `verify:pack` a second time under the release-pinned npm, so the end-to-end
 * path is exercised under the npm that publishes.
 *
 * THIS MODULE IS PURE. The spawning lives in verify-pack.mjs, so the fixtures
 * can grade the parse without an npm on the box at all.
 */

/** The two container shapes observed, as they appear in the failure messages. */
const SHAPES = {
  /** npm <= 11: a bare array of pack results. */
  array: 'array (npm <= 11)',
  /** npm >= 12: an object keyed by package name. */
  keyed: 'object keyed by package name (npm >= 12)',
};

/** How a value should be described in an error a human has to act on. */
function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return `an object with ${keys.length} key(s): ${keys.slice(0, 8).join(', ')}`;
  }
  return `a ${typeof value}`;
}

/**
 * A failure that names the npm version, because that is the one fact that
 * turns "this crashed" into "this npm changed its output".
 *
 * NEVER a fallback. Returning an empty listing on an unrecognised shape would
 * hand the rules downstream a tarball that appears to contain nothing, and they
 * would faithfully report `dist/index.js is missing from the tarball` — sending
 * whoever reads it after a build problem that does not exist. Worse, a future
 * shape that happens to yield a SHORT list would let some rules pass and turn
 * this back into a check that proves nothing, which is the failure mode the
 * whole file is downstream of.
 */
function unrecognised(npmVersion, detail) {
  return new Error(
    `npm pack --dry-run --json returned a shape this script does not recognise.\n` +
      `  npm version: ${npmVersion}\n` +
      `  problem:     ${detail}\n` +
      `  known:       ${SHAPES.array}\n` +
      `               ${SHAPES.keyed}\n` +
      `  npm 12 moved the top level from an array to an object keyed by package name.\n` +
      `  If a later npm has moved it again, teach scripts/pack-listing.mjs the new\n` +
      `  shape and add a captured fixture for it under test/fixtures/.`,
  );
}

/**
 * @param {string} raw   stdout of `npm pack --dry-run --json`
 * @param {{ npmVersion: string }} options
 * @returns {{ paths: string[], shape: keyof typeof SHAPES }}
 */
export function readPackListing(raw, { npmVersion }) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // Kept distinct from the shape failure: this is the one that WOULD mean
    // something reached stdout that is not JSON, and the excerpt is what tells
    // you which. Ruled out for the `always-auth` warnings above, but a future
    // npm printing progress on stdout would land exactly here.
    throw unrecognised(
      npmVersion,
      `stdout is not JSON (${err.message}). First 200 bytes: ${JSON.stringify(raw.slice(0, 200))}`,
    );
  }

  /** @type {keyof typeof SHAPES} */
  let shape;
  let entries;
  if (Array.isArray(parsed)) {
    shape = 'array';
    entries = parsed;
  } else if (parsed !== null && typeof parsed === 'object') {
    shape = 'keyed';
    entries = Object.values(parsed);
  } else {
    throw unrecognised(npmVersion, `the top level is ${describe(parsed)}, not an array or object`);
  }

  // Exactly one, because this script packs exactly one package. More than one
  // would mean a workspace flag leaked into the invocation and the rules below
  // would silently be grading whichever package sorted first.
  if (entries.length !== 1) {
    throw unrecognised(
      npmVersion,
      `expected exactly one packed package, got ${entries.length}` +
        (shape === 'keyed' ? ` (${Object.keys(parsed).join(', ')})` : ''),
    );
  }

  const entry = entries[0];
  if (entry === null || typeof entry !== 'object' || !Array.isArray(entry.files)) {
    throw unrecognised(
      npmVersion,
      `the packed package is ${describe(entry)}, with no \`files\` array on it`,
    );
  }

  const paths = entry.files.map((file) => file?.path);
  const bad = paths.findIndex((p) => typeof p !== 'string');
  if (bad !== -1) {
    throw unrecognised(
      npmVersion,
      `files[${bad}] has no string \`path\` (got ${describe(entry.files[bad])})`,
    );
  }

  return { paths, shape };
}

export { SHAPES };
