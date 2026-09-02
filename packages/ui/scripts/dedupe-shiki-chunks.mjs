// Post-build dedupe for the shiki `core-*.js` / `engine-javascript-*.js` lazy
// chunks. 8b3970ac (dedupe shared lazy chunks between dist/ and
// dist/elements/chunks/) made the elements build (KAI_BUILD=split,
// config/vite/elements.ts) write its lazy chunks to the SAME directory as the other four lib builds
// (register-all / barrel / barrel.server / solid / solid.server) so that
// Rollup's content-hash chunk naming could collide them onto one file. That
// works whenever the two builds render a shared module to byte-identical
// output — which is true for most of the shiki grammar/theme chunks 8b3970ac
// targeted, but NOT for `createHighlighterCore` (shiki's `core-*.js`) or the
// JS regex engine (`engine-javascript-*.js`): each `vite build` invocation is
// a separate Rollup process with a different whole-graph module scope (the
// register-all build's single-entry graph pulls in every element; the
// barrel/index/solid builds don't), so Rollup's cross-chunk deconfliction
// picks different local variable names for the SAME source module before
// esbuild's minifier ever runs. The minifier is deterministic given its
// input; the input differs. Two ~99.1%-similar, non-identical files ship
// instead of one — hash-collision dedupe structurally cannot reach this case.
// See docs/coupling-map.md §2 ("`dedupe:shiki`'s position in the `build`
// script") for where this step has to sit in the build chain and why.
//
// Fix: after all builds finish, find each near-duplicate family, keep the
// copy with the most importers (the barrel/index/solid builds all share one;
// only the elements build renders its own), and rewrite every OTHER copy in
// the family to a same-directory `export *` re-export shim pointing at the
// keeper. Every importer keeps importing its ORIGINAL hashed filename — nothing
// about their code changes — so this needs no importer-rewriting and cannot
// break either the dynamic-import (on-demand highlighter) or static-import
// paths. A downstream consumer bundler resolves the re-export statically and
// collapses it away entirely; an unbundled CDN/`<script type=module>` consumer
// pays one extra tiny fetch (~60 bytes) instead of downloading the
// ~60-116KB duplicate. Both files already ship from the same dist/ directory
// (package.json `files` ships all of `dist`), so this changes nothing about
// kai.es.js's CDN self-sufficiency — it was already reaching into sibling
// chunk files for the on-demand highlighter before this script runs.
//
// Families are near-duplicate, not byte-identical, so this does NOT rely on
// Rollup's hash coincidence at all (that already happened, or didn't, before
// this script runs) — it detects "same exported names, close-enough size" and
// physically collapses whatever is left. "Close-enough size" is enforced
// (see SIZE_TOLERANCE below) — it's the actual defense against a lockfile
// pinning two different shiki versions producing modules with identical
// export names but different (larger/smaller) bodies; export-name matching
// alone cannot tell that case apart from a genuine minifier-renaming
// near-duplicate. See docs/coupling-map.md §3 ("`FAMILIES`' markers <->
// shiki's exported names") for the coupling this encodes and what else moves
// if shiki's public API changes.
//
// listJsFiles only reads dist/ itself, non-recursively — it does not walk
// dist/elements/chunks/ or any other subdirectory. That's fine as long as
// the split elements build (KAI_BUILD=split, config/vite/elements.ts) keeps
// writing its lazy chunks into the shared
// dist/ root (the 8b3970ac fix this script builds on); if a future change
// reverts that and chunks fork back into a nested directory, duplicates
// would regrow there invisibly to this script. Rule 2 (the total pack-size
// ceiling in verify-pack-weight.mjs) is the backstop that would still catch
// the regrowth, just later and less precisely than this script would.
//
// RUNNING IT:
//   node scripts/dedupe-shiki-chunks.mjs                       # the real dist/
//   node scripts/dedupe-shiki-chunks.mjs --self-test            # prove it still detects
//   node scripts/dedupe-shiki-chunks.mjs --package-root <dir>   # any tree
import { readdirSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};
const PKG_ROOT = resolve(argOf('--package-root') ?? join(SCRIPT_DIR, '..'));
const SELF_TEST = argv.includes('--self-test');

// Each family: a filename regex, plus a marker string that must appear in
// every member (a positive control — if a future refactor renames the
// exports, this stops matching real shiki chunks instead of silently
// collapsing unrelated files that happen to share a filename prefix).
const FAMILIES = [
  { name: 'core', pattern: /^core-[\w-]+\.js$/, marker: 'createHighlighterCore' },
  {
    name: 'engine-javascript',
    pattern: /^engine-javascript-[\w-]+\.js$/,
    marker: 'createJavaScriptRegexEngine',
  },
];

// Max fractional size difference between a family's members before this
// script refuses to treat them as near-duplicates. Enforces the "close-
// enough size" half of the header's contract — export-name matching alone
// can't distinguish a genuine minifier-renaming near-duplicate from two
// different shiki versions that happen to export the same names.
const SIZE_TOLERANCE = 0.05;

// Exported names must match exactly for `export *` to be a safe substitute —
// this is the guard against collapsing two files that merely share a
// filename prefix but are semantically different modules.
function exportedNames(code) {
  const m = code.match(/\bexport\s*\{([^}]*)\}/);
  if (!m) return null;
  return m[1]
    .split(',')
    .map((s) => s.trim().split(/\s+as\s+/).pop().trim())
    .filter(Boolean)
    .sort();
}

function sameNames(a, b) {
  return !!a && !!b && a.length === b.length && a.every((n, i) => n === b[i]);
}

function listJsFiles(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.js'))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function importerCount(dist, files, basename) {
  let count = 0;
  for (const f of files) {
    if (f === basename) continue;
    let code;
    try {
      code = readFileSync(join(dist, f), 'utf8');
    } catch {
      continue;
    }
    if (code.includes(basename)) count++;
  }
  return count;
}

/**
 * Pure over a dist/ directory: returns { actions, problems }.
 * `actions`: [{ file, keep, reason }] — files this run rewrote to a shim.
 * `problems`: fatal issues (family present but names don't match — refuses
 * to guess, and reports rather than silently doing nothing).
 */
function planDedupe(dist) {
  const files = listJsFiles(dist);
  const actions = [];
  const problems = [];

  for (const family of FAMILIES) {
    // Sorted so keeper selection (the reduce below) is deterministic on an
    // importer-count tie — readdirSync's order is filesystem-dependent, and
    // without a stable input order a tie could pick a different "keeper" on
    // two runs over the same dist/, making the shim target nondeterministic.
    const members = files.filter((f) => family.pattern.test(f)).sort();
    if (members.length <= 1) continue; // already one copy (or none built) — nothing to do

    const withMeta = members.map((f) => {
      const code = readFileSync(join(dist, f), 'utf8');
      return {
        file: f,
        code,
        names: exportedNames(code),
        importers: importerCount(dist, files, f),
        bytes: Buffer.byteLength(code, 'utf8'),
      };
    });

    const missingMarker = withMeta.filter((m) => !m.code.includes(family.marker));
    if (missingMarker.length > 0) {
      problems.push(
        `family "${family.name}": marker "${family.marker}" not found in ` +
          `${missingMarker.map((m) => m.file).join(', ')} — filenames matched the ` +
          `pattern but the marker went stale (a shiki upgrade renamed the export?). ` +
          `Refusing to collapse: re-derive the marker before trusting this family.`,
      );
      continue;
    }

    // A `default` export can't safely ride an `export * from`: `export *`
    // re-exports every NAMED binding but never forwards `default` (per the
    // ES module spec), so if a future shiki chunk exports default on both
    // sides, the names would match, this script would collapse them, and
    // the shimmed file would silently lose its default export — breaking
    // any importer that does `import core from "./core-XXXX.js"` only in
    // the shipped tarball, at runtime, never in this repo's own build.
    // Refusing is safer than forwarding it wrong.
    const hasDefault = withMeta.filter((m) => (m.names ?? []).includes('default'));
    if (hasDefault.length > 0) {
      problems.push(
        `family "${family.name}": ${hasDefault.map((m) => m.file).join(', ')} export ` +
          `a "default" binding — \`export * from\` never forwards \`default\` (per the ES ` +
          `module spec), so collapsing would silently drop it from the shimmed file. ` +
          `Refusing to collapse: this family needs an explicit \`export { default } from\` ` +
          `shim instead, not the blind \`export *\` this script writes.`,
      );
      continue;
    }

    const keeper = withMeta.reduce((a, b) => (b.importers > a.importers ? b : a));
    const rest = withMeta.filter((m) => m.file !== keeper.file);

    const mismatched = rest.filter((m) => !sameNames(m.names, keeper.names));
    if (mismatched.length > 0) {
      problems.push(
        `family "${family.name}": exported-name mismatch between ${keeper.file} and ` +
          `${mismatched.map((m) => m.file).join(', ')} — these are not near-duplicates ` +
          `of the same module (or the export list changed shape). Refusing to collapse.`,
      );
      continue;
    }

    // Same exported names is necessary but not sufficient: two different
    // shiki versions pinned across a mixed lockfile state could export the
    // same names from meaningfully different (larger/smaller) module
    // bodies. Size proximity is the second half of the "close-enough size"
    // contract the file header documents.
    const sizeMismatched = rest.filter(
      (m) => Math.abs(m.bytes - keeper.bytes) / Math.max(m.bytes, keeper.bytes) > SIZE_TOLERANCE,
    );
    if (sizeMismatched.length > 0) {
      problems.push(
        `family "${family.name}": size mismatch between ${keeper.file} (${keeper.bytes} B) and ` +
          `${sizeMismatched.map((m) => `${m.file} (${m.bytes} B)`).join(', ')} — more than ` +
          `${(SIZE_TOLERANCE * 100).toFixed(0)}% apart, so these don't read as the same module ` +
          `minified differently (possibly two shiki versions in the lockfile). Refusing to collapse.`,
      );
      continue;
    }

    for (const m of rest) {
      actions.push({
        file: m.file,
        keep: keeper.file,
        family: family.name,
        savedBytes: m.bytes,
      });
    }
  }

  return { actions, problems };
}

function applyDedupe(dist, actions) {
  for (const a of actions) {
    writeFileSync(join(dist, a.file), `export * from "./${a.keep}";\n`);
  }
}

// ---------------------------------------------------------------------------
// self-test
// ---------------------------------------------------------------------------
function writeFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'dedupe-shiki-selftest-'));
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

const CORE_A =
  'var xn=1;function createHighlighterCore(){}export{xn as a,createHighlighterCore as createHighlighterCore};';
const CORE_B_NEARDUP =
  'var Ln=1;function createHighlighterCore(){}export{Ln as a,createHighlighterCore as createHighlighterCore};';
const CORE_MISMATCHED =
  'var q=1;function createHighlighterCore(){}export{q as a,createHighlighterCore as createHighlighterCore,q as extraExport};';
const CORE_STALE_MARKER = 'var q=1;function totallyDifferentThing(){}export{q as a};';
const ENGINE_A = 'function createJavaScriptRegexEngine(){}export{createJavaScriptRegexEngine};';
const ENGINE_B_NEARDUP = 'function createJavaScriptRegexEngine(){}export{createJavaScriptRegexEngine};';
// Same names on both sides, one exports `default` too — the case `export *`
// cannot safely forward (per the ES module spec, `export *` never re-exports
// a `default` binding).
const CORE_HAS_DEFAULT_A =
  'var xn=1;function createHighlighterCore(){}export{xn as a,createHighlighterCore as createHighlighterCore,xn as default};';
const CORE_HAS_DEFAULT_B =
  'var Ln=1;function createHighlighterCore(){}export{Ln as a,createHighlighterCore as createHighlighterCore,Ln as default};';
// Same exported names, same marker, but one body is far larger than the
// other — the SIZE_TOLERANCE guard's target case (e.g. two shiki versions
// pinned in a mixed lockfile state).
const CORE_SIZE_SMALL =
  'var xn=1;function createHighlighterCore(){}export{xn as a,createHighlighterCore as createHighlighterCore};';
const CORE_SIZE_LARGE =
  `var Ln=1;/*${'padding to push this file far outside the 5% size-tolerance window '.repeat(20)}*/function createHighlighterCore(){}export{Ln as a,createHighlighterCore as createHighlighterCore};`;

const SELF_TEST_CASES = [
  {
    name: 'single copy of a family — nothing to do',
    files: { 'dist/core-AAAA.js': CORE_A, 'dist/kai.es.js': 'import("./core-AAAA.js");' },
    expectActions: 0,
    expectProblems: 0,
  },
  {
    name: 'near-duplicate pair, one importer each side — keeps the one with MORE importers',
    files: {
      'dist/core-AAAA.js': CORE_A,
      'dist/core-BBBB.js': CORE_B_NEARDUP,
      'dist/index.js': 'import("./core-AAAA.js");',
      'dist/solid.js': 'import("./core-AAAA.js");',
      'dist/kai.es.js': 'import("./core-BBBB.js");',
    },
    expectActions: [{ file: 'core-BBBB.js', keep: 'core-AAAA.js' }],
    expectProblems: 0,
  },
  {
    name: 'engine-javascript family collapses the same way',
    files: {
      'dist/engine-javascript-AAAA.js': ENGINE_A,
      'dist/engine-javascript-BBBB.js': ENGINE_B_NEARDUP,
      'dist/index.js': 'import("./engine-javascript-AAAA.js");',
      'dist/solid.js': 'import("./engine-javascript-AAAA.js");',
      'dist/kai.es.js': 'import("./engine-javascript-BBBB.js");',
    },
    expectActions: [{ file: 'engine-javascript-BBBB.js', keep: 'engine-javascript-AAAA.js' }],
    expectProblems: 0,
  },
  {
    name: 'DEFECT GUARD: exported-name mismatch refuses to collapse',
    files: {
      'dist/core-AAAA.js': CORE_A,
      'dist/core-CCCC.js': CORE_MISMATCHED,
      'dist/index.js': 'import("./core-AAAA.js");',
      'dist/solid.js': 'import("./core-AAAA.js");',
      'dist/kai.es.js': 'import("./core-CCCC.js");',
    },
    expectActions: 0,
    expectProblemsInclude: ['exported-name mismatch'],
  },
  {
    name: 'DEFECT GUARD: stale marker refuses to collapse rather than guess',
    files: {
      'dist/core-AAAA.js': CORE_A,
      'dist/core-DDDD.js': CORE_STALE_MARKER,
      'dist/index.js': 'import("./core-AAAA.js");',
      'dist/kai.es.js': 'import("./core-DDDD.js");',
    },
    expectActions: 0,
    expectProblemsInclude: ['marker "createHighlighterCore" not found'],
  },
  {
    name: 'DEFECT GUARD: a `default` export refuses to collapse (export * cannot forward it)',
    files: {
      'dist/core-AAAA.js': CORE_HAS_DEFAULT_A,
      'dist/core-BBBB.js': CORE_HAS_DEFAULT_B,
      'dist/index.js': 'import("./core-AAAA.js");',
      'dist/solid.js': 'import("./core-AAAA.js");',
      'dist/kai.es.js': 'import("./core-BBBB.js");',
    },
    expectActions: 0,
    expectProblemsInclude: ['export a "default" binding'],
  },
  {
    name: 'DEFECT GUARD: same names, sizes >5% apart refuses to collapse',
    files: {
      'dist/core-AAAA.js': CORE_SIZE_SMALL,
      'dist/core-BBBB.js': CORE_SIZE_LARGE,
      'dist/index.js': 'import("./core-AAAA.js");',
      'dist/solid.js': 'import("./core-AAAA.js");',
      'dist/kai.es.js': 'import("./core-BBBB.js");',
    },
    expectActions: 0,
    expectProblemsInclude: ['size mismatch'],
  },
];

if (SELF_TEST) {
  let failed = 0;
  for (const c of SELF_TEST_CASES) {
    const root = writeFixture(c.files);
    const { actions, problems } = planDedupe(join(root, 'dist'));
    let ok = true;
    if (Array.isArray(c.expectActions)) {
      ok =
        actions.length === c.expectActions.length &&
        c.expectActions.every((exp, i) => actions[i]?.file === exp.file && actions[i]?.keep === exp.keep);
    } else {
      ok = actions.length === c.expectActions;
    }
    if (c.expectProblems !== undefined) ok = ok && problems.length === c.expectProblems;
    if (c.expectProblemsInclude) {
      ok = ok && c.expectProblemsInclude.every((s) => problems.some((p) => p.includes(s)));
    }
    if (!ok) failed++;
    console.log(
      `${ok ? '✓' : '✗'} ${c.name} (actions=${actions.length}, problems=${problems.length})`,
    );
  }
  if (failed > 0) {
    console.error(`\n✗ dedupe-shiki-chunks self-test: ${failed}/${SELF_TEST_CASES.length} case(s) failed.`);
    process.exit(1);
  }
  console.log(`\n✓ dedupe-shiki-chunks self-test: ${SELF_TEST_CASES.length}/${SELF_TEST_CASES.length} cases behave as specified.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// the real run
// ---------------------------------------------------------------------------
const dist = join(PKG_ROOT, 'dist');
const { actions, problems } = planDedupe(dist);

if (problems.length > 0) {
  for (const p of problems) console.error(`✗ dedupe-shiki-chunks: ${p}`);
  process.exit(1);
}

if (actions.length === 0) {
  console.log('✓ dedupe-shiki-chunks — no near-duplicate shiki chunk families found (nothing to collapse)');
  process.exit(0);
}

applyDedupe(dist, actions);
const savedBytes = actions.reduce((n, a) => n + a.savedBytes, 0);
for (const a of actions) {
  console.log(
    `  · ${relative(PKG_ROOT, join(dist, a.file))} → re-export shim of ${a.keep} ` +
      `(family: ${a.family}, was ${a.savedBytes} B)`,
  );
}
console.log(`✓ dedupe-shiki-chunks — collapsed ${actions.length} near-duplicate chunk(s), ~${savedBytes} B raw saved`);
