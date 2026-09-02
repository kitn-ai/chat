// Build-time guard for the coarse register-all bundle (dist/kai.es.js, the
// `@kitn.ai/ui/elements` entry).
//
// dist/kai.es.js is a small facade; the ~650KB of `customElements.define` calls
// live in a SEPARATELY HASHED chunk it loads with a dynamic import (currently
// dist/register-impl-<hash>.js). Two independent things have to hold for a
// consumer to get any elements at all:
//
//   1. OUR build must keep the reference. (Rollup strips register-impl to an
//      empty module unless the register-all build (KAI_BUILD=register,
//      config/vite/elements.ts) sets `treeshake: false` for this entry.)
//   2. The CONSUMER's bundler must keep the chunk's side effects. It decides
//      that from package.json `sideEffects`. A hashed chunk not covered by one
//      of those globs is "side-effect free", so an aggressive bundler (Vite 8 /
//      Rolldown, verified) shakes 650KB down to a ~1.5KB stub with zero element
//      registrations. Consumers get a blank page and a silent console:
//      customElements.whenDefined('kai-chat') never resolves.
//
// (2) is what shipped broken in 0.19.0 — the old version of this script only
// checked (1), which is why it passed the whole time. Both are checked now.
// The end-to-end proof (pack -> real consumer app -> real bundler) lives in
// scripts/verify-consumer-sideeffects.mjs and runs in CI.
//
// THIS SCRIPT GATES EVERY PUBLISH — `prepublishOnly` runs `build`, and `build`
// runs this — so "it passed" has to mean something. Its own history is the
// argument: it was green through the release that shipped defect (2), because
// a check that does not look is indistinguishable from a check that looks and
// finds nothing. So the detection is exercised against synthesized trees:
//
//   node packages/ui/scripts/verify-elements-bundle.mjs                      # the real dist/
//   node packages/ui/scripts/verify-elements-bundle.mjs --self-test          # prove it still detects
//   node packages/ui/scripts/verify-elements-bundle.mjs --package-root <dir> # any tree, e.g. a planted defect
//
// `--self-test` builds throwaway package roots under the OS temp dir (never the
// real dist/), plants one defect in each, and requires the right message on each
// one and silence on the clean one. Both defects are planted SEPARATELY as well
// as together, because "fires on something" is not the same as "fires on this".
//
// A ZERO-CHUNK RUN IS A HARD FAILURE. If kai.es.js dynamically imports nothing
// carrying element registrations, that is this script reading the wrong thing —
// or a bundle that genuinely registers nothing — and either way it is not a pass.
import { readFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join, posix } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Anchored to THIS FILE, not the cwd. `npm run build` sets the cwd to the package
// while CLAUDE.md tells everyone to run from the repo root; the sibling guards have
// both misdiagnosed themselves that way.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};
const PKG_ROOT = resolve(argOf('--package-root') ?? join(SCRIPT_DIR, '..'));
const SELF_TEST = argv.includes('--self-test');

const BUNDLE = 'dist/kai.es.js';
const NEEDLE = 'register-impl';

// A chunk carrying this many kai-* tag literals is a registration chunk: its
// side effects are load-bearing and it MUST be covered by `sideEffects`.
const REGISTRATION_TAG_FLOOR = 5;

/** Bundler `sideEffects` globs (webpack / esbuild / vite / rolldown all agree on
 *  this subset): `**` spans path segments, `*` stays inside one, everything else
 *  is literal. Patterns are relative to the package root. */
const globToRegExp = (glob) => {
  const pattern = glob.replace(/^\.\//, '');
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        i++;
        if (pattern[i + 1] === '/') i++;
        out += '(?:.*/)?';
      } else {
        out += '[^/]*';
      }
    } else if ('\\^$.|?+()[]{}'.includes(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`);
};

/**
 * Everything wrong with ONE package tree, as a list of messages. A pure
 * function of the tree so `--self-test` can drive it over fixtures; the process
 * exits are all in the caller.
 *
 * Returns `{ problems, summary }`. `problems` empty is the pass.
 */
function checkTree(root) {
  const problems = [];

  let code;
  try {
    code = readFileSync(join(root, BUNDLE), 'utf8');
  } catch {
    // Nothing else in this file is answerable without the bundle.
    return { problems: [`${BUNDLE} not found — run the lib build first.`] };
  }

  // --- (1) our build kept the reference to the registration chunk ---
  if (!code.includes(NEEDLE)) {
    problems.push(
      `${BUNDLE} does NOT reference "${NEEDLE}".\n` +
        `  The register-all bundle is missing element registration — it was likely\n` +
        `  tree-shaken away. Consumers of @kitn.ai/ui/elements would get nothing\n` +
        `  registered. See src/elements/register.ts (keep elementsReady exported) and\n` +
        `  config/vite/elements.ts under KAI_BUILD=register\n` +
        `  (build.rollupOptions.treeshake: false for this entry).`,
    );
  }

  // --- (2) every registration chunk kai.es.js pulls in must be sideEffects-covered ---

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  } catch {
    problems.push(`package.json under ${root} could not be read — cannot check "sideEffects" coverage.`);
    return { problems };
  }
  const sideEffects = pkg.sideEffects;
  if (!Array.isArray(sideEffects)) {
    problems.push('package.json "sideEffects" is not an array — this guard assumes the glob-list form.');
    return { problems };
  }

  const matchers = sideEffects.map(globToRegExp);
  const isCovered = (relPath) => matchers.some((re) => re.test(relPath));

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(root, 'src/elements/element-manifest.json'), 'utf8'));
  } catch {
    problems.push('src/elements/element-manifest.json could not be read — no tag list, so no chunk could be classified.');
    return { problems };
  }
  const TAGS = Object.keys(manifest.tags ?? {});
  if (TAGS.length === 0) {
    problems.push('src/elements/element-manifest.json lists no tags.');
    return { problems };
  }

  // Every relative dynamic import kai.es.js makes. The registration chunk is one
  // of them; the rest are the lazily loaded Shiki grammars (zero kai-* tags).
  const specifiers = [...code.matchAll(/import\(\s*["'](\.\/[^"']+\.js)["']\s*\)/g)].map((m) => m[1]);

  const registrationChunks = [];
  for (const spec of specifiers) {
    const rel = posix.join('dist', spec.replace(/^\.\//, ''));
    if (!existsSync(join(root, rel))) {
      problems.push(`${BUNDLE} imports ${spec}, but ${rel} was not emitted.`);
      continue;
    }
    const chunk = readFileSync(join(root, rel), 'utf8');
    const hits = TAGS.filter((tag) => chunk.includes(tag)).length;
    if (hits >= REGISTRATION_TAG_FLOOR) registrationChunks.push({ rel, hits });
  }

  if (registrationChunks.length === 0) {
    // The vacuity case. Reported LAST of the structural ones so a stripped
    // reference reads as the stripped reference, but it is fatal on its own:
    // a run that classified no chunk has checked nothing about `sideEffects`.
    problems.push(
      `${BUNDLE} loads no chunk carrying element registrations.\n` +
        `  Every chunk it dynamically imports has fewer than ${REGISTRATION_TAG_FLOOR} kai-* tags,\n` +
        `  so nothing in this bundle can define a custom element.`,
    );
    return { problems };
  }

  const uncovered = registrationChunks.filter((c) => !isCovered(c.rel));
  if (uncovered.length > 0) {
    problems.push(
      `registration chunk(s) NOT covered by package.json "sideEffects":\n` +
        uncovered.map((c) => `    ${c.rel}  (${c.hits} kai-* tags)`).join('\n') +
        `\n\n  Current sideEffects:\n` +
        sideEffects.map((s) => `    ${s}`).join('\n') +
        `\n\n  A consumer's bundler treats an uncovered chunk as side-effect free and\n` +
        `  shakes the customElements registrations out of it. <kai-chat> never upgrades,\n` +
        `  the page renders blank, and the console stays silent. Add a glob to\n` +
        `  package.json "sideEffects" that matches the chunk(s) above (the hash moves\n` +
        `  every build, so match on the stem: "./dist/<name>-*.js").`,
    );
  }

  return {
    problems,
    summary:
      `${BUNDLE} references ${NEEDLE}; ` +
      `${registrationChunks.length} registration chunk(s) covered by "sideEffects" ` +
      `(${registrationChunks.map((c) => c.rel).join(', ')})`,
  };
}

// ---------------------------------------------------------------------------
// self-test: synthesize package roots, plant one defect each, and require the
// right message. Without this, a green run is unfalsifiable — which is exactly
// the state this script was in for the release that shipped defect (2).
// ---------------------------------------------------------------------------
const FIXTURE_TAGS = ['kai-chat', 'kai-message', 'kai-thread', 'kai-prompt-input', 'kai-markdown', 'kai-toast'];
const FIXTURE_SIDE_EFFECTS = ['**/*.css', './dist/kai.es.js', './dist/register-impl-*.js', './dist/elements/*.js'];

/** A chunk body that looks like a registration chunk to the classifier. */
const registrationChunkBody = (tags = FIXTURE_TAGS) =>
  tags.map((t) => `customElements.define(${JSON.stringify(t)}, C);`).join('\n');

/** The healthy tree, with `over` merged on top (a `null` value deletes a file). */
const fixtureFiles = (over = {}) => ({
  'package.json': JSON.stringify({ name: '@kitn.ai/ui', sideEffects: FIXTURE_SIDE_EFFECTS }),
  'src/elements/element-manifest.json': JSON.stringify({
    tags: Object.fromEntries(FIXTURE_TAGS.map((t) => [t, { module: `src/elements/${t}.ts` }])),
  }),
  'dist/kai.es.js': `export const elementsReady = import("./register-impl-abc123.js");\n`,
  'dist/register-impl-abc123.js': registrationChunkBody(),
  ...over,
});

function writeFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'verify-elements-bundle-selftest-'));
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

const SELF_TEST_CASES = [
  {
    name: 'a healthy tree draws no findings at all',
    files: fixtureFiles(),
    expect: [],
  },
  {
    name: 'DEFECT (1) ALONE: the register-impl specifier is stripped from kai.es.js',
    // The chunk is still imported, still classified, still covered — only the
    // NAME the needle looks for is gone. Proves (1) fires on its own.
    files: fixtureFiles({
      'dist/kai.es.js': `export const elementsReady = import("./elements-registry-abc123.js");\n`,
      'dist/register-impl-abc123.js': null,
      'dist/elements-registry-abc123.js': registrationChunkBody(),
      'package.json': JSON.stringify({
        name: '@kitn.ai/ui',
        sideEffects: [...FIXTURE_SIDE_EFFECTS, './dist/elements-registry-*.js'],
      }),
    }),
    expect: ['does NOT reference'],
    reject: ['NOT covered by package.json'],
  },
  {
    name: 'DEFECT (2) ALONE: the registration chunk is matched by no sideEffects glob (the 0.19.0 ship)',
    files: fixtureFiles({
      'package.json': JSON.stringify({
        name: '@kitn.ai/ui',
        sideEffects: ['**/*.css', './dist/kai.es.js', './dist/elements/*.js'],
      }),
    }),
    expect: ['NOT covered by package.json', 'dist/register-impl-abc123.js'],
    reject: ['does NOT reference'],
  },
  {
    name: 'both defects at once are both reported',
    files: fixtureFiles({
      'dist/kai.es.js': `export const elementsReady = import("./elements-registry-abc123.js");\n`,
      'dist/register-impl-abc123.js': null,
      'dist/elements-registry-abc123.js': registrationChunkBody(),
      'package.json': JSON.stringify({
        name: '@kitn.ai/ui',
        sideEffects: ['**/*.css', './dist/kai.es.js', './dist/elements/*.js'],
      }),
    }),
    expect: ['does NOT reference', 'NOT covered by package.json'],
  },
  {
    name: 'VACUITY: no imported chunk carries registrations',
    files: fixtureFiles({ 'dist/register-impl-abc123.js': 'export const nothing = 1;\n' }),
    expect: ['loads no chunk carrying element registrations'],
  },
  {
    name: 'VACUITY: a chunk under the tag floor is not a registration chunk',
    files: fixtureFiles({
      'dist/register-impl-abc123.js': registrationChunkBody(FIXTURE_TAGS.slice(0, REGISTRATION_TAG_FLOOR - 1)),
    }),
    expect: ['loads no chunk carrying element registrations'],
  },
  {
    name: 'an imported chunk that was never emitted',
    files: fixtureFiles({ 'dist/register-impl-abc123.js': null }),
    expect: ['was not emitted'],
  },
  {
    name: 'sideEffects in the boolean form this guard cannot read',
    files: fixtureFiles({ 'package.json': JSON.stringify({ name: '@kitn.ai/ui', sideEffects: false }) }),
    expect: ['"sideEffects" is not an array'],
  },
  {
    name: 'an element manifest with no tags',
    files: fixtureFiles({ 'src/elements/element-manifest.json': JSON.stringify({ tags: {} }) }),
    expect: ['lists no tags'],
  },
  {
    name: 'no dist/kai.es.js at all',
    files: fixtureFiles({ 'dist/kai.es.js': null }),
    expect: ['not found'],
  },
  {
    name: 'a `**` glob still covers the chunk (no false positive on a broader list)',
    files: fixtureFiles({
      'package.json': JSON.stringify({ name: '@kitn.ai/ui', sideEffects: ['**/*.css', './dist/**/*.js'] }),
    }),
    expect: [],
  },
];

if (SELF_TEST) {
  let failed = 0;
  for (const c of SELF_TEST_CASES) {
    const { problems } = checkTree(writeFixture(c.files));
    const joined = problems.join('\n');
    const missingExpected = c.expect.filter((s) => !joined.includes(s));
    const wrongfullyPresent = (c.reject ?? []).filter((s) => joined.includes(s));
    const cleanMismatch = c.expect.length === 0 && problems.length > 0;
    const ok = missingExpected.length === 0 && wrongfullyPresent.length === 0 && !cleanMismatch;
    if (!ok) failed++;
    const got = problems.length === 0 ? 'clean' : `${problems.length} finding(s)`;
    console.log(
      `${ok ? '✓' : '✗'} ${c.name} (expected ${c.expect.length === 0 ? 'clean' : c.expect.map((s) => `"${s}"`).join(' + ')}, got ${got})`,
    );
    if (missingExpected.length > 0) console.log(`    missing: ${missingExpected.map((s) => `"${s}"`).join(', ')}`);
    if (wrongfullyPresent.length > 0) console.log(`    fired for the wrong reason: ${wrongfullyPresent.map((s) => `"${s}"`).join(', ')}`);
    if (cleanMismatch) console.log(`    unexpected: ${joined.split('\n')[0]}`);
  }
  if (failed > 0) {
    console.error(`\n✗ verify-elements-bundle self-test: ${failed}/${SELF_TEST_CASES.length} case(s) failed.`);
    process.exit(1);
  }
  console.log(
    `\n✓ verify-elements-bundle self-test: ${SELF_TEST_CASES.length}/${SELF_TEST_CASES.length} cases behave as specified.`,
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// the real run
// ---------------------------------------------------------------------------
const { problems, summary } = checkTree(PKG_ROOT);

if (problems.length > 0) {
  for (const p of problems) console.error(`✗ verify-elements-bundle: ${p}`);
  process.exit(1);
}

console.log(`✓ verify-elements-bundle — ${summary}`);
