// Staleness guard for HAND-TYPED CDN VERSION PINS of @kitn.ai/ui.
//
// THE DEFECT THIS IS BUILT FROM
// The docs tell people to pin an exact version for CDN use. That advice is
// correct -- a pinned URL is immutable, cacheable and SRI-able -- but every pin
// in the docs was a literal somebody typed once. The kit kept releasing; the
// literals did not move. When a Critical advisory landed against every version
// from 0.14.1 to 0.24.0, four copy-pasteable URLs across the docs and the npm
// README were still handing readers 0.20.1 and 0.16.0, both inside that range.
//
// The npm README is the worst of the four, and it is worth naming why: npm
// prints a deprecation warning on `npm install` of a deprecated version, and all
// 17 affected versions are deprecated. A CDN FETCH PRINTS NOTHING. So the one
// distribution channel with no safety net was the one carrying the stalest pin,
// on the page a prospective user sees first.
//
// THE INVARIANT
// A `@kitn.ai/ui@<version>` literal anywhere in first-party docs, examples or
// source must equal the version in packages/ui/package.json. Not "satisfies a
// range containing it" -- EQUAL.
//
// WHY EQUALITY, AND WHY NOT A RANGE
// A range check here would be a check that cannot fail. `^0.25.0` always
// includes 0.25.0, so "does the documented range admit the current version"
// is true by construction and would go green forever while the docs rotted.
// The two sides of THIS comparison are independent: a string a human typed into
// prose, and the manifest release-please rewrites. They drift apart on their
// own, every single release, which is exactly the failure being guarded.
//
// WHY NOT DERIVE THE PIN AT DOCS BUILD TIME INSTEAD
// Considered first, and rejected as the primary mechanism, for two reasons.
// (1) It cannot reach packages/ui/README.md, which is rendered by the npm
// registry from the published tarball -- there is no build step in that path at
// all, and that file is the worst offender. (2) In the docs the pins live inside
// inline code spans and fenced blocks, where MDX treats content as literal by
// design; making them interpolate would mean lifting the URL out of code
// formatting. That trades a real docs regression for a partial fix. A guard
// covers every file type uniformly, including plain markdown the registry reads.
//
// `--fix` rewrites every stale pin to the current version, so the release-time
// update is one command rather than a hunt.
//
// WHY REGEX HERE, WHEN THE SIBLING GUARDS INSIST ON A REAL PARSE
// lint-attachment-object-urls records that a text-window scanner mis-lexed its
// own input and blanked a real defect away. That reasoning does not transfer,
// because this is not matching a CODE SHAPE. The token is a package specifier
// that appears in prose, in link text, in inline code and in fenced HTML with
// equal danger -- there is no syntax tree containing all four. The pattern is
// fully anchored on both ends (`@kitn.ai/ui@` then a semver), so there is no
// lexical state to get wrong: it either is that specifier or it is not.
//
// HISTORICAL RECORDS ARE WAIVED, NOT REWRITTEN
// Some in-scope files narrate real past releases ("the run that published
// @kitn.ai/ui@0.24.0 then died"). Rewriting those to the current version would
// falsify a record to satisfy a linter. They carry a parsed directive instead,
// on the line or the line above:
//
//   lint-cdn-pins: historical -- <reason, >= 15 chars>
//
// A directive and not prose, for the reason lint-silent-drops gives: the defect
// this guard is built from was ALREADY surrounded by prose explaining that the
// pin was deliberate, so a rule honouring comments would have passed it
// unchanged. The waiver covers only the line it sits on.
//
// A ZERO-MATCH RUN IS A HARD FAILURE, and this is deliberate. It is the opposite
// call from lint-attachment-object-urls, which scans for a FORBIDDEN pattern
// where finding none is the healthy steady state. This scans for pins the docs
// deliberately RECOMMEND and therefore knows exist; finding none means the walk
// broke, and a broken walk would pass every stale pin in the tree forever.
//
// RUNNING IT, without a build. Reads source and package.json only:
//
//   node packages/ui/scripts/lint-cdn-pins.mjs
//   node packages/ui/scripts/lint-cdn-pins.mjs --fix          # rewrite stale pins
//   node packages/ui/scripts/lint-cdn-pins.mjs --list         # every pin found
//   node packages/ui/scripts/lint-cdn-pins.mjs --self-test    # prove it still detects
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Anchored to THIS FILE, not the cwd: CLAUDE.md tells everyone to run from the
// repo root while `pnpm --filter` sets the cwd to the package.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};
const REPO_ROOT = resolve(argOf('--repo-root') ?? join(SCRIPT_DIR, '../../..'));
const SELF_TEST = argv.includes('--self-test');
const LIST = argv.includes('--list');
const FIX = argv.includes('--fix');

// The published Critical advisory this guard was written for. Kept so a pin
// inside the range gets a LOUDER message than ordinary staleness -- an old pin
// is a docs bug, a pin in here is a live vulnerability being handed to readers.
const ADVISORY = { firstAffected: '0.14.1', lastAffected: '0.24.0', patched: '0.25.0' };

// Scanned: everything first-party a reader could copy a URL out of.
// NOT scanned: `docs/` at the repo root, which is the handoff/spec/research
// archive. Those files date-stamp what was true when they were written, and
// rewriting them would corrupt a record rather than fix a link.
const SCAN_ROOTS = ['apps', 'packages', 'examples'];
const SCAN_FILES = ['README.md'];
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '.astro', '.nx', '.cache',
  'coverage', 'storybook-static', '.turbo', '.output', '.vercel', '.wrangler',
]);
// Gitignored COPIES of built kit output, not source (written by the docs site's
// prebuild). Whether they exist depends on whether anyone has run a build, which
// would make the file count differ between a fresh checkout and a built one.
const SKIP_PATHS = ['apps/docs/public/kitn'];
// THIS GUARD'S OWN TWO FILES, because their fixture corpora are deliberately
// full of stale pins -- the four literals that actually shipped, plus a
// prerelease and an ahead-of-manifest typo. Scanning itself, the guard reported
// 14 findings in its own fixture table and buried the 2 real ones. The
// alternative (a waiver comment on every fixture line) was rejected as noise on
// tables whose entire purpose is to BE counterexamples.
//
// This is a CORRECTNESS requirement and not just noise control: `--fix` rewrites
// what the scan reports, so without the exclusion a single `--fix` would rewrite
// every fixture to the current version and silently destroy the tests that prove
// this guard detects anything at all.
//
// Cost, stated rather than hidden: a genuine CDN pin written into either file is
// not checked by this guard.
const SKIP_FILES = [
  'packages/ui/scripts/lint-cdn-pins.mjs',
  'packages/ui/tests/scripts/cdn-pins-guard-wiring.test.ts',
];
const EXT = new Set([
  '.md', '.mdx', '.html', '.astro', '.txt',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte',
]);

// Anchored on both ends: the exact package name, then a semver. `@<version>`,
// `@<pinned>` and other honest placeholders do not match and are left alone.
const PIN = /@kitn\.ai\/ui@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/g;
const WAIVER = /lint-cdn-pins:\s*historical\s*--\s*(.{15,})/;

const semver = (v) => v.split('-')[0].split('.').map(Number);
const cmp = (a, b) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
};
const inAdvisory = (v) =>
  cmp(v, ADVISORY.firstAffected) >= 0 && cmp(v, ADVISORY.lastAffected) <= 0;

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (SKIP_PATHS.includes(relative(REPO_ROOT, full))) continue;
      walk(full, out);
    } else if (e.isFile() && EXT.has(extname(e.name))) {
      if (SKIP_FILES.includes(relative(REPO_ROOT, full))) continue;
      out.push(full);
    }
  }
  return out;
}

/** Every pin in one file's text, each tagged stale/waived, with the line a
 *  reader would open. Offsets are into the ORIGINAL text so lines survive. */
function analyze(text, current) {
  const lines = text.split('\n');
  const out = [];
  PIN.lastIndex = 0;
  let m;
  while ((m = PIN.exec(text)) !== null) {
    const line = text.slice(0, m.index).split('\n').length;
    // A waiver counts on the pin's own line or the line directly above it.
    const here = lines[line - 1] ?? '';
    const above = lines[line - 2] ?? '';
    const waived = WAIVER.test(here) || WAIVER.test(above);
    out.push({
      version: m[1],
      at: m.index,
      line,
      src: here.trim(),
      waived,
      stale: m[1] !== current,
      vulnerable: inAdvisory(m[1]),
    });
  }
  return out;
}

/** Rewrite every non-waived stale pin in `text` to `current`. */
function fixText(text, current) {
  const findings = analyze(text, current).filter((f) => f.stale && !f.waived);
  let out = text;
  // Right to left, so earlier offsets stay valid as lengths change.
  for (const f of findings.reverse()) {
    const start = f.at + '@kitn.ai/ui@'.length;
    out = out.slice(0, start) + current + out.slice(start + f.version.length);
  }
  return { text: out, count: findings.length };
}

// ---------------------------------------------------------------------------
// self-test: proves the analyzer still DETECTS a stale pin and still lets a
// current one through. Without this, "0 findings" is unfalsifiable.
// ---------------------------------------------------------------------------
const SELF_TEST_CASES = [
  // -- the four literals that were actually live, all must be caught --
  { name: 'installation.mdx as it shipped (0.20.1, in the advisory range)', expect: true, vuln: true,
    text: 'Pin an exact version: `https://cdn.jsdelivr.net/npm/@kitn.ai/ui@0.20.1/dist/kai.es.js`.' },
  { name: 'loading.mdx as it shipped (0.20.1 autoloader)', expect: true, vuln: true,
    text: 'Pin an exact version: `https://cdn.jsdelivr.net/npm/@kitn.ai/ui@0.20.1/dist/elements/autoloader.js`.' },
  { name: 'getting-started.mdx as it shipped (bare specifier, no host)', expect: true, vuln: true,
    text: 'Pin an exact version in production (e.g. `@kitn.ai/ui@0.20.1/dist/...`).' },
  { name: 'README.md as it shipped (0.16.0, the npm landing page)', expect: true, vuln: true,
    text: '**For production, pin an exact version** (e.g. `@kitn.ai/ui@0.16.0/dist/kai.es.js`)' },
  // -- the fixed forms, which must be clean --
  { name: 'THE FIX: the current version in a jsDelivr URL', expect: false,
    text: 'Pin: `https://cdn.jsdelivr.net/npm/@kitn.ai/ui@0.25.0/dist/kai.es.js`.' },
  { name: 'THE FIX: the current version on unpkg', expect: false,
    text: "import 'https://unpkg.com/@kitn.ai/ui@0.25.0/dist/kai.es.js';" },
  // -- the staleness this exists to catch NEXT, not the one already fixed --
  { name: 'a pin one patch behind is stale even though it is NOT vulnerable', expect: true, vuln: false,
    text: 'import "https://cdn.jsdelivr.net/npm/@kitn.ai/ui@0.24.9/dist/kai.es.js";' },
  { name: 'a pin AHEAD of the manifest is stale too (a typo, or a bad merge)', expect: true, vuln: false,
    text: 'import "https://cdn.jsdelivr.net/npm/@kitn.ai/ui@0.26.0/dist/kai.es.js";' },
  // -- placeholders are honest and must not be rewritten into a false pin --
  { name: 'the MCP debug tool placeholder @<version>', expect: false,
    text: '<script type="module" src="https://cdn.jsdelivr.net/npm/@kitn.ai/ui@<version>/dist/elements/autoloader.js"></script>' },
  { name: 'the create-kai README placeholder @<pinned>', expect: false,
    text: 'npm pack @kitn.ai/ui@<pinned> && tar -xzf kitn.ai-ui-<pinned>.tgz' },
  { name: 'an unpinned CDN URL is a different question and not this rule', expect: false,
    text: "import 'https://cdn.jsdelivr.net/npm/@kitn.ai/ui/dist/kai.es.js';" },
  { name: 'a bare dependency range in a package.json is not a CDN pin', expect: false,
    text: '"@kitn.ai/ui": "^0.25.0"' },
  // -- the waiver, which must cover exactly its own line --
  { name: 'a historical narrative WITH a waiver on the same line', expect: false,
    text: '// published @kitn.ai/ui@0.24.0, then died. lint-cdn-pins: historical -- records a real past release' },
  { name: 'a waiver on the line directly above also covers the pin', expect: false,
    text: '// lint-cdn-pins: historical -- narrates the half-published release\n// the run that published @kitn.ai/ui@0.24.0 then died' },
  { name: 'a waiver does NOT reach two lines down', expect: true, vuln: true,
    text: '// lint-cdn-pins: historical -- covers only the next line\n// filler\n// @kitn.ai/ui@0.24.0' },
  { name: 'prose explaining the pin, WITHOUT the directive, still fires', expect: true, vuln: true,
    text: '// deliberately pinned for reproducibility, do not bump: @kitn.ai/ui@0.20.1' },
  { name: 'a waiver with too short a reason does not count', expect: true, vuln: true,
    text: '// @kitn.ai/ui@0.24.0 lint-cdn-pins: historical -- old' },
  // -- shapes that must not throw or over-match --
  { name: 'a prerelease pin is matched and compared', expect: true, vuln: false,
    text: 'https://cdn.jsdelivr.net/npm/@kitn.ai/ui@0.26.0-rc.1/dist/kai.es.js' },
  { name: 'a different package at the same version is not ours', expect: false,
    text: 'https://cdn.jsdelivr.net/npm/@kitn.ai/chat@0.20.1/dist/kitn-chat.es.js' },
  { name: 'two stale pins on one line are both found', expect: true, vuln: true,
    text: '`@kitn.ai/ui@0.20.1/dist/kai.es.js` or `@kitn.ai/ui@0.16.0/dist/kai.es.js`' },
];

if (SELF_TEST) {
  const CURRENT = '0.25.0'; // fixed, so the self-test does not move with the manifest
  let failed = 0;
  for (const c of SELF_TEST_CASES) {
    const hits = analyze(c.text, CURRENT).filter((f) => f.stale && !f.waived);
    const got = hits.length > 0;
    let ok = got === c.expect;
    let note = '';
    if (ok && c.expect && c.vuln !== undefined) {
      const anyVuln = hits.some((h) => h.vulnerable);
      if (anyVuln !== c.vuln) {
        ok = false;
        note = ` [advisory-range classification: expected ${c.vuln}, got ${anyVuln}]`;
      }
    }
    if (!ok) failed++;
    console.log(
      `${ok ? '✓' : '✗'} ${c.name} (expected ${c.expect ? 'a finding' : 'clean'}, got ${got ? 'a finding' : 'clean'})${note}`,
    );
  }
  // The --fix path is part of the contract, so it is asserted too.
  const before = 'see `@kitn.ai/ui@0.20.1/dist/kai.es.js` and `@kitn.ai/ui@0.16.0/dist/kai.es.js`';
  const { text: after, count } = fixText(before, CURRENT);
  const fixOk = count === 2 && after === 'see `@kitn.ai/ui@0.25.0/dist/kai.es.js` and `@kitn.ai/ui@0.25.0/dist/kai.es.js`';
  if (!fixOk) failed++;
  console.log(`${fixOk ? '✓' : '✗'} --fix rewrites every stale pin on a line (got ${count}: ${after})`);

  if (failed > 0) {
    console.error(`\n✗ lint-cdn-pins self-test: ${failed} case(s) failed.`);
    process.exit(1);
  }
  console.log(`\n✓ lint-cdn-pins self-test: ${SELF_TEST_CASES.length + 1} cases behave as specified.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// the real run
// ---------------------------------------------------------------------------
const MANIFEST = join(REPO_ROOT, 'packages/ui/package.json');
if (!existsSync(MANIFEST)) {
  console.error(`✗ lint-cdn-pins: no packages/ui/package.json under ${REPO_ROOT}. This script is misrooted.`);
  process.exit(1);
}
const CURRENT = JSON.parse(readFileSync(MANIFEST, 'utf8')).version;
if (!/^\d+\.\d+\.\d+/.test(CURRENT ?? '')) {
  console.error(`✗ lint-cdn-pins: packages/ui/package.json has no usable version (got ${CURRENT}).`);
  process.exit(1);
}

const roots = SCAN_ROOTS.map((r) => join(REPO_ROOT, r)).filter(
  (d) => existsSync(d) && statSync(d).isDirectory(),
);
if (roots.length === 0) {
  console.error(
    `✗ lint-cdn-pins: none of ${SCAN_ROOTS.join(', ')} exist under ${REPO_ROOT}.\n` +
      `  Nothing could be scanned, which is this script being misrooted, not the tree being clean.`,
  );
  process.exit(1);
}

const files = [
  ...roots.flatMap((r) => walk(r, [])),
  ...SCAN_FILES.map((f) => join(REPO_ROOT, f)).filter((f) => existsSync(f)),
].sort();

const all = files.flatMap((path) => {
  const text = readFileSync(path, 'utf8');
  if (!text.includes('@kitn.ai/ui@')) return [];
  return analyze(text, CURRENT).map((f) => ({ ...f, path, file: relative(REPO_ROOT, path) }));
});

if (LIST) {
  for (const f of all) {
    console.log(`${f.file}:${f.line}  @${f.version}${f.waived ? '  (waived)' : f.stale ? '  STALE' : ''}`);
  }
  console.error(`\n${all.length} pin(s) across ${files.length} file(s).`);
  process.exit(0);
}

// The vacuity tripwire. Unlike a forbidden-pattern guard, this one scans for
// something the docs deliberately recommend and therefore knows is there. Zero
// pins means the walk broke, and a broken walk passes every stale pin forever.
if (all.length === 0) {
  console.error(
    `✗ lint-cdn-pins: walked ${files.length} file(s) and found NO \`@kitn.ai/ui@<version>\` pin at all.\n` +
      `  The docs recommend pinning for CDN use, so at least one is expected. A zero-pin run\n` +
      `  is this script being broken -- which would pass every stale pin in the tree.\n` +
      `  If the pin advice was intentionally removed everywhere, update SCAN_ROOTS/EXT here.`,
  );
  process.exit(1);
}

const stale = all.filter((f) => f.stale && !f.waived);

if (FIX) {
  const byFile = new Map();
  for (const f of stale) byFile.set(f.path, f.file);
  let n = 0;
  for (const [path, file] of byFile) {
    const { text, count } = fixText(readFileSync(path, 'utf8'), CURRENT);
    writeFileSync(path, text);
    console.log(`  ${file}: ${count} pin(s) → ${CURRENT}`);
    n += count;
  }
  console.log(n === 0 ? `✓ lint-cdn-pins --fix: nothing to do.` : `\n✓ lint-cdn-pins --fix: ${n} pin(s) updated to ${CURRENT}.`);
  process.exit(0);
}

if (stale.length === 0) {
  const waived = all.filter((f) => f.waived).length;
  console.log(
    `✓ lint-cdn-pins: ${all.length} \`@kitn.ai/ui@<version>\` pin(s) across ${files.length} file(s); ` +
      `all at ${CURRENT}${waived ? ` (${waived} historical, waived)` : ''}.`,
  );
  process.exit(0);
}

const vulnerable = stale.filter((f) => f.vulnerable);
console.error(
  `✗ lint-cdn-pins: ${stale.length} CDN pin(s) do not match packages/ui/package.json (${CURRENT}).\n`,
);
for (const f of stale) {
  console.error(`  ${f.file}:${f.line}  pinned @${f.version}${f.vulnerable ? '  ← COVERED BY THE CRITICAL ADVISORY' : ''}`);
  console.error(`    ${f.src}`);
  console.error('');
}
if (vulnerable.length > 0) {
  console.error(
    `  ${vulnerable.length} of these pin a version in ${ADVISORY.firstAffected}–${ADVISORY.lastAffected}, every one of\n` +
      `  which is covered by a published CRITICAL advisory and deprecated on npm. These are\n` +
      `  copy-pasteable URLs: npm warns on installing a deprecated version, a CDN fetch does\n` +
      `  NOT, so a reader following the docs gets the vulnerable bundle with nothing to warn\n` +
      `  them. Fixed in ${ADVISORY.patched}.\n`,
  );
}
console.error(
  `  Pinning an exact version for CDN use is CORRECT -- immutable, cacheable, SRI-able. The\n` +
    `  bug is the pin being a literal nobody updates. Rewrite them all:\n\n` +
    `    node packages/ui/scripts/lint-cdn-pins.mjs --fix\n\n` +
    `  If a line narrates a real past release and must keep its version, waive that line:\n` +
    `    lint-cdn-pins: historical -- <why this version must stay, 15+ chars>`,
);
process.exit(1);
