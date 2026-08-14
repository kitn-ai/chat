// Regression guard for the WebGL shader path in the audio visualizer
// (components/audio-visualizer/{shader-canvas,wave.glsl,aurora.glsl,
// variant-wave,variant-aurora,variant-custom}). `vite.config.ts` sets
// `treeshake: false` on the register-all bundle by design, so if
// `SHADER_VARIANTS`'s dynamic `import()` calls in
// components/audio-visualizer/index.tsx ever become static imports, the
// WebGL runtime plus the GLSL strings (roughly 25 to 30 KB, and GLSL barely
// compresses) would silently ship to every consumer, including one who only
// uses <kai-chat>. This asserts the shader path stays out of that bundle so
// that regression can never silently ship again.
//
// dist/kai.es.js (the `@kitn.ai/ui/elements` entry) is a thin stub: it
// dynamically imports a hashed dist/register-impl-<hash>.js chunk, and THAT
// file -- not kai.es.js itself -- is where every kai-* element's code
// actually lives, because treeshake:false keeps it all in one place. Since
// kai.es.js unconditionally imports register-impl on load, register-impl's
// weight ships to every consumer of the register-all bundle regardless of
// which element they use. Checking kai.es.js alone would miss a leak
// entirely (verified empirically: a static `import './variant-aurora'`
// added to index.tsx left kai.es.js's 23,964 bytes untouched and only grew
// register-impl-<hash>.js), so both files are checked here.
//
// DIST is anchored to THIS FILE, not to the cwd. `npm run build` sets the cwd to the
// package, but CLAUDE.md tells everyone to run from the REPO ROOT, and this guard
// degrades QUIETLY in the wrong direction when the cwd is wrong: `findRegisterImpl`
// catches the `readdirSync` failure and returns null, i.e. a wrong cwd looks like
// "found nothing to check" rather than "cannot check". The kai.es.js read then bails
// with "run the lib build first" against a tree that just built green. A leak detector
// whose miss-mode is silence has to be pinned to the package it inspects.
//
// TWO WAYS THIS CHECK CAN COVER NOTHING WHILE EXITING GREEN, both of them now
// fatal and both of them exercised by `--self-test`:
//
//   NO CHUNK. `findRegisterImpl()` returning null means the file holding every
//   element's code was not found, so the scan below would run over kai.es.js
//   alone -- the file the header above records as unable to show a leak at all.
//   "Found nothing to check" is not a pass.
//
//   STALE MARKERS. The markers are string literals from the shader source. Rename
//   `auroraWarp` in aurora.glsl.ts and this file goes on searching for a string
//   that can no longer appear anywhere: permanently green, permanently blind. So
//   each marker must still be FOUND somewhere in dist/ (in the lazy chunks, which
//   is where they belong) -- a positive control on the search terms themselves.
//
// RUNNING IT:
//   node packages/ui/scripts/verify-shader-lazy.mjs                      # the real dist/
//   node packages/ui/scripts/verify-shader-lazy.mjs --self-test          # prove it still detects
//   node packages/ui/scripts/verify-shader-lazy.mjs --package-root <dir> # any tree, e.g. a planted leak
import { readdirSync, readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
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

// Distinctive strings that only exist in the shader path, verified absent
// from dist/kai.es.js + dist/register-impl-<hash>.js and present in the lazy
// chunk(s) as of this writing:
//   - 'mainImage(gl_FragColor' is shader-canvas.tsx's `main()` wrapper,
//     shared by every shader variant (wave, aurora, custom).
//   - 'auroraWarp' is a GLSL function name unique to aurora.glsl.ts.
//   - 'randFibo' is a GLSL function name unique to wave.glsl.ts.
const SHADER_MARKERS = ['mainImage(gl_FragColor', 'auroraWarp', 'randFibo'];

function findRegisterImpl(dist) {
  let entries;
  try {
    entries = readdirSync(dist);
  } catch {
    return null;
  }
  const match = entries.find((f) => /^register-impl-.*\.js$/.test(f));
  return match ? join(dist, match) : null;
}

/** Every .js file under dist/, so the marker staleness control can look for the
 *  lazy chunks wherever rollup decided to put them. */
function distJsFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) distJsFiles(full, out);
    else if (e.isFile() && e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * Everything wrong with ONE package tree, as a list of messages. A pure function
 * of the tree so `--self-test` can drive it over fixtures; the process exits are
 * all in the caller.
 *
 * Returns `{ problems, registerImplPath }`. `problems` empty is the pass.
 */
function checkTree(root) {
  const dist = join(root, 'dist');
  const kaiEs = join(dist, 'kai.es.js');
  const registerImplPath = findRegisterImpl(dist);

  let kaiEsCode;
  try {
    kaiEsCode = readFileSync(kaiEs, 'utf8');
  } catch {
    return { problems: [`${kaiEs} not found — run the lib build first.`], registerImplPath };
  }

  // The silent-miss case. kai.es.js alone provably CANNOT show this leak (see the
  // header: a planted static import left it byte-identical), so scanning without
  // the register-impl chunk is scanning nothing.
  if (!registerImplPath) {
    return {
      problems: [
        `no dist/register-impl-*.js chunk found — run the lib build first.\n` +
          `  ${kaiEs} dynamically imports this chunk; it must exist alongside it.\n` +
          `  Every element's code lives in THAT file, so without it this guard would be\n` +
          `  searching kai.es.js alone, where a leak is invisible. Not a pass.`,
      ],
      registerImplPath,
    };
  }

  const problems = [];
  const registerImplCode = readFileSync(registerImplPath, 'utf8');
  const code = kaiEsCode + registerImplCode;

  const leaked = SHADER_MARKERS.filter((m) => code.includes(m));
  if (leaked.length > 0) {
    problems.push(
      `the shader path leaked into the register-all bundle\n` +
        `  (${kaiEs} + ${registerImplPath}).\n` +
        `  Found: ${leaked.join(', ')}\n\n` +
        `  The register-all bundle disables tree-shaking, so a static import of\n` +
        `  variant-wave / variant-aurora / variant-custom / shader-canvas ships to\n` +
        `  every consumer. Keep SHADER_VARIANTS in\n` +
        `  components/audio-visualizer/index.tsx as dynamic import() calls.`,
    );
  }

  // The positive control on the search terms. A marker present in NO emitted chunk
  // is a string this guard can never find, which makes its absence from the
  // register-all bundle worth nothing.
  const lazyChunks = distJsFiles(dist).filter((f) => f !== kaiEs && f !== registerImplPath);
  const lazyCode = lazyChunks.map((f) => readFileSync(f, 'utf8')).join('\n');
  const stale = SHADER_MARKERS.filter((m) => !lazyCode.includes(m) && !code.includes(m));
  if (stale.length > 0) {
    problems.push(
      `marker(s) not found ANYWHERE under ${dist}: ${stale.join(', ')}\n` +
        `  These are the strings this guard searches for. If the shader source renamed\n` +
        `  them, the search matches nothing by construction and this check is green and\n` +
        `  blind. Re-derive SHADER_MARKERS from components/audio-visualizer/*.glsl.ts and\n` +
        `  shader-canvas.tsx (they are found in the lazy variant-*/create-tween chunks).`,
    );
  }

  return { problems, registerImplPath, lazyChunkCount: lazyChunks.length };
}

// ---------------------------------------------------------------------------
// self-test: synthesize dist trees, plant a leak in each spot it can appear, and
// require the two silent-miss shapes to be fatal. Without this, "the bundle does
// not contain the shader path" is unfalsifiable — a claim about a string search
// nobody has watched find anything.
// ---------------------------------------------------------------------------
const LAZY_CHUNK = `const frag = "vec3 auroraWarp(vec2 p){return vec3(0.0);}\\nfloat randFibo(float x){return x;}\\nvoid main(){ mainImage(gl_FragColor, gl_FragCoord.xy); }";\nexport { frag };\n`;

/** The healthy tree, with `over` merged on top (a `null` value deletes a file). */
const fixtureFiles = (over = {}) => ({
  'dist/kai.es.js': `export const elementsReady = import("./register-impl-abc123.js");\n`,
  'dist/register-impl-abc123.js': `customElements.define("kai-chat", C);\nconst v = () => import("./variant-aurora-x1.js");\n`,
  'dist/variant-aurora-x1.js': LAZY_CHUNK,
  ...over,
});

function writeFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'verify-shader-lazy-selftest-'));
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
    name: 'a healthy tree — shader markers only in the lazy chunk — draws no findings',
    files: fixtureFiles(),
    expect: [],
  },
  {
    name: 'DEFECT: a GLSL marker in the hashed register-impl chunk (where a static import lands it)',
    files: fixtureFiles({
      'dist/register-impl-abc123.js':
        `customElements.define("kai-chat", C);\nconst frag = "vec3 auroraWarp(vec2 p){return vec3(0.0);}";\n`,
    }),
    expect: ['leaked into the register-all bundle', 'auroraWarp'],
  },
  {
    name: 'DEFECT: a marker in kai.es.js itself',
    files: fixtureFiles({
      'dist/kai.es.js':
        `export const elementsReady = import("./register-impl-abc123.js");\nconst m = "void main(){ mainImage(gl_FragColor, gl_FragCoord.xy); }";\n`,
    }),
    expect: ['leaked into the register-all bundle', 'mainImage(gl_FragColor'],
  },
  {
    name: 'SILENT MISS: findRegisterImpl() finds no chunk — a hard failure, not "nothing to check"',
    files: fixtureFiles({ 'dist/register-impl-abc123.js': null }),
    expect: ['no dist/register-impl-*.js chunk found', 'Not a pass'],
    reject: ['leaked into the register-all bundle'],
  },
  {
    name: 'SILENT MISS: no dist/ at all — findRegisterImpl() swallows the readdir failure',
    files: { 'package.json': '{}' },
    expect: ['not found'],
  },
  {
    name: 'SILENT MISS: the markers match nothing anywhere — the search terms went stale',
    // The shader chunk is present but renamed its functions, i.e. exactly what a
    // rename in aurora.glsl.ts / wave.glsl.ts does to this guard.
    files: fixtureFiles({
      'dist/variant-aurora-x1.js': `const frag = "vec3 ribbonWarp(vec2 p){return vec3(0.0);}";\nexport { frag };\n`,
    }),
    expect: ['marker(s) not found ANYWHERE', 'auroraWarp', 'randFibo', 'mainImage(gl_FragColor'],
    reject: ['leaked into the register-all bundle'],
  },
  {
    name: 'a leak does not also read as a stale marker (the two are told apart)',
    // The lazy chunk still carries all three markers, so nothing is stale; the
    // register-impl chunk has ALSO picked one up, which is the leak and only that.
    files: fixtureFiles({
      'dist/register-impl-abc123.js':
        `customElements.define("kai-chat", C);\nconst frag = "float randFibo(float x){return x;}";\n`,
    }),
    expect: ['leaked into the register-all bundle', 'randFibo'],
    reject: ['marker(s) not found ANYWHERE'],
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
    console.error(`\n✗ verify-shader-lazy self-test: ${failed}/${SELF_TEST_CASES.length} case(s) failed.`);
    process.exit(1);
  }
  console.log(
    `\n✓ verify-shader-lazy self-test: ${SELF_TEST_CASES.length}/${SELF_TEST_CASES.length} cases behave as specified.`,
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// the real run
// ---------------------------------------------------------------------------
const { problems, registerImplPath, lazyChunkCount } = checkTree(PKG_ROOT);

if (problems.length > 0) {
  for (const p of problems) console.error(`✗ verify-shader-lazy: ${p}`);
  process.exit(1);
}

console.log(
  `✓ verify-shader-lazy — the register-all bundle (kai.es.js + ${relative(PKG_ROOT, registerImplPath)}) ` +
    `does not contain the shader path, and all ${SHADER_MARKERS.length} markers were found in the ` +
    `${lazyChunkCount} lazy chunk(s) alongside it`,
);
