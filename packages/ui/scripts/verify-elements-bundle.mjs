// Build-time guard for the coarse register-all bundle (dist/kai.es.js, the
// `@kitn.ai/ui/elements` entry).
//
// dist/kai.es.js is a small facade; the ~650KB of `customElements.define` calls
// live in a SEPARATELY HASHED chunk it loads with a dynamic import (currently
// dist/register-impl-<hash>.js). Two independent things have to hold for a
// consumer to get any elements at all:
//
//   1. OUR build must keep the reference. (Rollup strips register-impl to an
//      empty module unless vite.config.ts sets `treeshake: false` for this entry.)
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
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = 'dist/kai.es.js';
const NEEDLE = 'register-impl';

// A chunk carrying this many kai-* tag literals is a registration chunk: its
// side effects are load-bearing and it MUST be covered by `sideEffects`.
const REGISTRATION_TAG_FLOOR = 5;

const fail = (msg) => {
  console.error(`✗ verify-elements-bundle: ${msg}`);
  process.exit(1);
};

let code;
try {
  code = readFileSync(resolve(ROOT, BUNDLE), 'utf8');
} catch {
  fail(`${BUNDLE} not found — run the lib build first.`);
}

if (!code.includes(NEEDLE)) {
  fail(
    `${BUNDLE} does NOT reference "${NEEDLE}".\n` +
      `  The register-all bundle is missing element registration — it was likely\n` +
      `  tree-shaken away. Consumers of @kitn.ai/ui/elements would get nothing\n` +
      `  registered. See src/elements/register.ts (keep elementsReady exported) and\n` +
      `  vite.config.ts (build.rollupOptions.treeshake: false for this entry).`,
  );
}

// --- (2) every registration chunk kai.es.js pulls in must be sideEffects-covered ---

const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
const sideEffects = pkg.sideEffects;
if (!Array.isArray(sideEffects)) {
  fail('package.json "sideEffects" is not an array — this guard assumes the glob-list form.');
}

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

const matchers = sideEffects.map(globToRegExp);
const isCovered = (relPath) => matchers.some((re) => re.test(relPath));

const manifest = JSON.parse(readFileSync(resolve(ROOT, 'src/elements/element-manifest.json'), 'utf8'));
const TAGS = Object.keys(manifest.tags);
if (TAGS.length === 0) fail('src/elements/element-manifest.json lists no tags.');

// Every relative dynamic import kai.es.js makes. The registration chunk is one
// of them; the rest are the lazily loaded Shiki grammars (zero kai-* tags).
const specifiers = [...code.matchAll(/import\(\s*["'](\.\/[^"']+\.js)["']\s*\)/g)].map((m) => m[1]);

const registrationChunks = [];
for (const spec of specifiers) {
  const rel = posix.join('dist', spec.replace(/^\.\//, ''));
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) fail(`${BUNDLE} imports ${spec}, but ${rel} was not emitted.`);
  const chunk = readFileSync(abs, 'utf8');
  const hits = TAGS.filter((tag) => chunk.includes(tag)).length;
  if (hits >= REGISTRATION_TAG_FLOOR) registrationChunks.push({ rel, hits });
}

if (registrationChunks.length === 0) {
  fail(
    `${BUNDLE} loads no chunk carrying element registrations.\n` +
      `  Every chunk it dynamically imports has fewer than ${REGISTRATION_TAG_FLOOR} kai-* tags,\n` +
      `  so nothing in this bundle can define a custom element.`,
  );
}

const uncovered = registrationChunks.filter((c) => !isCovered(c.rel));
if (uncovered.length > 0) {
  fail(
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

console.log(
  `✓ verify-elements-bundle — ${BUNDLE} references ${NEEDLE}; ` +
    `${registrationChunks.length} registration chunk(s) covered by "sideEffects" ` +
    `(${registrationChunks.map((c) => c.rel).join(', ')})`,
);
