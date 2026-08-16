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
// `--fix` rewrites every stale pin to the current version, so a MANUAL cleanup
// is one command rather than a hunt.
//
// WHO UPDATES THE PINS ON A RELEASE, AND WHY IT IS NOT `--fix`
// The version this compares against is the one release-please rewrites, so
// every release moves one side and not the other: the release commit itself was
// red on `8d56f1d7` (0.25.0 -> 0.25.1) with the publish going out anyway. The
// pins are therefore updated BY THE BUMP, via release-please `extra-files` in
// release-please-config.json, so the release commit is green by construction.
//
// Running `--fix` from a release job was the obvious alternative and is the
// more dangerous one. `--fix` rewrites every pin it considers stale, so its
// blast radius is "whatever the scan matched"; a NEW historical narrative
// written without a waiver would be silently rewritten into a falsehood by an
// unattended job. release-please only ever touches a line a human annotated
// with `x-release-please-start-version`/`-end`, so an un-annotated line -- the
// exact shape a historical record has -- CANNOT be rewritten by the release. A
// pin somebody forgets to annotate is simply left stale, which turns the
// RELEASE PR red on this very guard, before anything publishes. That is the
// failure direction worth having.
//
// `--check-release-wiring` is what keeps that true: it asserts every live pin
// is actually reachable by the bump, so "forgot to annotate" fails on the PR
// that adds the pin rather than on the next release.
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
//   node packages/ui/scripts/lint-cdn-pins.mjs --check-release-wiring
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
const CHECK_RELEASE_WIRING = argv.includes('--check-release-wiring');

// The package whose version every pin must equal. Named once: the manifest path,
// the release-please `packages` key and the `extra-files` base all derive from it.
const UI_PKG_DIR = 'packages/ui';
const RELEASE_CONFIG = 'release-please-config.json';

// The published Critical advisory this guard was written for. Kept so a pin
// inside the range gets a LOUDER message than ordinary staleness -- an old pin
// is a docs bug, a pin in here is a live vulnerability being handed to readers.
const ADVISORY = { firstAffected: '0.14.1', lastAffected: '0.24.0', patched: '0.25.0' };

// Scanned: everything first-party a reader could copy a URL out of, plus the
// repo-root `scripts/` shared build tooling.
//
// `scripts` is here because leaving it out was a silent SIDE EFFECT, not a
// decision. `scripts/pack-listing.mjs` moved up from packages/create-kai when
// packages/ui's guards started sharing it, and its `lint-cdn-pins: historical`
// waiver -- on the line narrating the 0.24.0 publish that the module exists
// because of -- went from governing to governing nothing, because the scan could
// no longer reach the file. An orphaned waiver is worse than no waiver: it reads
// like the line is accounted for.
//
// NOT scanned: `docs/` at the repo root, which is the handoff/spec/research
// archive. Those files date-stamp what was true when they were written, and
// rewriting them would corrupt a record rather than fix a link. That exclusion
// is deliberate and about ARCHIVAL content; root `scripts/` is live maintained
// source and is not the same case.
const SCAN_ROOTS = ['apps', 'packages', 'examples', 'scripts'];
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

// ---------------------------------------------------------------------------
// release-please's generic updater, as this guard models it.
//
// These four regexes are COPIED VERBATIM from release-please's
// src/updaters/generic.ts. They are restated here rather than imported because
// release-please is a GitHub Action, not a dependency of this repo -- there is
// no module to import. That makes them a coupling to an external tool, so they
// are quoted exactly and pinned to a named source rather than paraphrased.
//
// THE ONE BEHAVIOUR EVERYTHING BELOW DEPENDS ON: the substitution is
// `line.replace(VERSION_REGEX, version)` with NO global flag, so release-please
// rewrites only the FIRST semver-looking token on a covered line. A line
// carrying both a movable pin and a frozen version -- an advisory floor, say --
// is therefore order-sensitive, and silently rewrites the wrong one if the
// frozen version happens to come first. `--check-release-wiring` refuses that
// shape rather than trusting whoever wrote the sentence to keep the order.
const RP_INLINE = /x-release-please-(?:major|minor|patch|version-date|version|date)/;
const RP_BLOCK_START = /x-release-please-start-(?:major|minor|patch|version-date|version|date)/;
const RP_BLOCK_END = /x-release-please-end/;
const RP_VERSION = /(\d+)\.(\d+)\.(\d+)(-([\w.]+))?(\+([-\w.]+))?/;

/**
 * Per line (1-based index into the returned array is line - 1): would
 * release-please rewrite a version on this line? Mirrors the generic updater --
 * a block opened by `x-release-please-start-*` covers every line until
 * `x-release-please-end`, and an inline annotation covers its own line.
 */
function releaseCoveredLines(text) {
  const lines = text.split('\n');
  const covered = new Array(lines.length).fill(false);
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (RP_BLOCK_START.test(line)) {
      inBlock = true;
      continue; // the marker line itself carries no pin worth rewriting
    }
    if (RP_BLOCK_END.test(line)) {
      inBlock = false;
      continue;
    }
    covered[i] = inBlock || RP_INLINE.test(line);
  }
  return covered;
}

/** Repo-relative paths release-please would rewrite for the kit package. */
function extraFilePaths(config) {
  const entries = config?.packages?.[UI_PKG_DIR]?.['extra-files'] ?? [];
  const out = [];
  for (const entry of entries) {
    const p = typeof entry === 'string' ? entry : entry?.path;
    if (typeof p !== 'string' || p.length === 0) continue;
    // release-please's Strategy#addPath: a leading `/` is repo-root-relative,
    // anything else is relative to the package directory.
    out.push(p.startsWith('/') ? p.replace(/^\/+/, '') : `${UI_PKG_DIR}/${p}`);
  }
  return out;
}

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
    // Column of the VERSION itself (not the `@kitn.ai/ui@` prefix) within its
    // line, so the wiring check can ask whether release-please's first-match-only
    // substitution would land on this pin or on some other version beside it.
    const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
    const col = m.index + '@kitn.ai/ui@'.length - lineStart;
    out.push({
      version: m[1],
      at: m.index,
      col,
      line,
      src: here.trim(),
      waived,
      stale: m[1] !== current,
      vulnerable: inAdvisory(m[1]),
    });
  }
  return out;
}

/**
 * Would release-please's first-match-only substitution land on THIS pin?
 * `lineText` is the raw line; `col` the column the pin's version starts at.
 */
function pinIsFirstVersionOnLine(lineText, col) {
  const m = RP_VERSION.exec(lineText);
  return m !== null && m.index === col;
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

// Does release-please reach this line? Each case is (text, 1-based line, expected).
// These encode the external tool's behaviour, so they are the cases to re-check
// if release-please ever changes its updater.
const COVERAGE_SELF_TEST_CASES = [
  { name: 'an MDX block marker pair covers the line between them', line: 2, expect: true,
    text: '{/* x-release-please-start-version */}\nPin `@kitn.ai/ui@0.25.0/dist/kai.es.js`.\n{/* x-release-please-end */}' },
  { name: 'an HTML-comment block does the same in plain markdown (the npm README)', line: 2, expect: true,
    text: '<!-- x-release-please-start-version -->\nPin `@kitn.ai/ui@0.25.0/dist/kai.es.js`.\n<!-- x-release-please-end -->' },
  { name: 'an inline annotation covers its own line', line: 1, expect: true,
    text: 'Pin `@kitn.ai/ui@0.25.0/dist/kai.es.js`. <!-- x-release-please-version -->' },
  { name: 'the line AFTER `-end` is not covered', line: 4, expect: false,
    text: '<!-- x-release-please-start-version -->\nPin `@kitn.ai/ui@0.25.0`.\n<!-- x-release-please-end -->\nHistorically `@kitn.ai/ui@0.24.0`.' },
  { name: 'a marker line is a marker, not content', line: 1, expect: false,
    text: '<!-- x-release-please-start-version -->\nPin `@kitn.ai/ui@0.25.0`.\n<!-- x-release-please-end -->' },
  { name: 'an un-annotated pin is reached by nothing -- the defect this wiring closes', line: 1, expect: false,
    text: 'Pin `@kitn.ai/ui@0.25.0/dist/kai.es.js`.' },
  { name: 'prose mentioning the tool without the annotation does not count', line: 1, expect: false,
    text: 'We could use release-please extra-files here. `@kitn.ai/ui@0.25.0`' },
];

// release-please rewrites only the FIRST semver on a covered line. A line
// holding a movable pin and a frozen one is a silent-corruption shape.
const ORDER_SELF_TEST_CASES = [
  { name: 'the pin is the only version on the line', ok: true,
    text: 'Pin an exact version: `@kitn.ai/ui@0.25.0/dist/kai.es.js`.' },
  { name: 'a FROZEN advisory floor before the pin would be rewritten instead of it', ok: false,
    text: 'Pin `0.14.1` or newer, e.g. `@kitn.ai/ui@0.25.0/dist/kai.es.js`.' },
  { name: 'two pins on one line: the second is unreachable, only the first moves', ok: false,
    text: '`@kitn.ai/ui@0.25.0/dist/kai.es.js` or `@kitn.ai/ui@0.25.0/dist/elements/autoloader.js`',
    which: 1 },
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

  // -- the release-wiring analyzer, proven the same way --
  for (const c of COVERAGE_SELF_TEST_CASES) {
    const got = releaseCoveredLines(c.text)[c.line - 1];
    const ok = got === c.expect;
    if (!ok) failed++;
    console.log(
      `${ok ? '✓' : '✗'} [coverage] ${c.name} (expected ${c.expect ? 'covered' : 'not covered'}, got ${got ? 'covered' : 'not covered'})`,
    );
  }
  for (const c of ORDER_SELF_TEST_CASES) {
    const pins = analyze(c.text, CURRENT);
    const pin = pins[c.which ?? 0];
    const lineText = c.text.split('\n')[pin.line - 1];
    const got = pinIsFirstVersionOnLine(lineText, pin.col);
    const ok = got === c.ok;
    if (!ok) failed++;
    console.log(
      `${ok ? '✓' : '✗'} [order] ${c.name} (expected ${c.ok ? 'reachable' : 'NOT reachable'}, got ${got ? 'reachable' : 'NOT reachable'})`,
    );
  }

  if (failed > 0) {
    console.error(`\n✗ lint-cdn-pins self-test: ${failed} case(s) failed.`);
    process.exit(1);
  }
  const total =
    SELF_TEST_CASES.length + 1 + COVERAGE_SELF_TEST_CASES.length + ORDER_SELF_TEST_CASES.length;
  console.log(`\n✓ lint-cdn-pins self-test: ${total} cases behave as specified.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// the real run
// ---------------------------------------------------------------------------
const MANIFEST = join(REPO_ROOT, UI_PKG_DIR, 'package.json');
if (!existsSync(MANIFEST)) {
  console.error(`✗ lint-cdn-pins: no ${UI_PKG_DIR}/package.json under ${REPO_ROOT}. This script is misrooted.`);
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

// The SECOND vacuity tripwire, and the one the waiver mechanism makes reachable.
// The check above counts every pin including waived ones, so a tree in which
// every remaining pin carries `lint-cdn-pins: historical` would satisfy it while
// this guard compared NOTHING against the manifest -- green, and proving nothing.
// That is not hypothetical: four waivers were added at once for the create-kai
// incident narratives, and a docs rewrite that dropped the live install snippets
// would leave only those. A waiver says "this line is exempt", never "there is
// nothing left to check".
const live = all.filter((f) => !f.waived);
if (live.length === 0) {
  console.error(
    `✗ lint-cdn-pins: found ${all.length} pin(s), and EVERY ONE is waived as historical.\n` +
      `  Nothing was compared against ${UI_PKG_DIR}/package.json, so this run proves nothing.\n` +
      `  A waiver exempts one line; it cannot be the state of the whole tree. Either a live\n` +
      `  CDN pin was deleted from the docs, or a waiver was applied to a pin that is real.`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// --check-release-wiring: is every live pin reachable BY THE VERSION BUMP?
//
// The guard compares pins to a version release-please rewrites, so without this
// every release moves one side and leaves the other stale -- which is exactly
// how the release commit for 0.25.1 shipped red. Being green today says nothing
// about being green after the next bump; this is the part that does.
// ---------------------------------------------------------------------------
if (CHECK_RELEASE_WIRING) {
  const configPath = join(REPO_ROOT, RELEASE_CONFIG);
  if (!existsSync(configPath)) {
    console.error(`✗ lint-cdn-pins --check-release-wiring: no ${RELEASE_CONFIG} under ${REPO_ROOT}.`);
    process.exit(1);
  }
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error(`✗ lint-cdn-pins --check-release-wiring: ${RELEASE_CONFIG} is not valid JSON (${err.message}).`);
    process.exit(1);
  }
  if (!config?.packages?.[UI_PKG_DIR]) {
    console.error(
      `✗ lint-cdn-pins --check-release-wiring: ${RELEASE_CONFIG} has no \`packages["${UI_PKG_DIR}"]\` entry.\n` +
        `  The pins track that package's version, so there is nothing for them to be wired to.`,
    );
    process.exit(1);
  }

  const configured = extraFilePaths(config);
  const configuredSet = new Set(configured);
  const problems = [];

  // A path in the config that is not on disk updates nothing, silently.
  for (const rel of configured) {
    if (!existsSync(join(REPO_ROOT, rel))) {
      problems.push(
        `${rel}\n      listed in ${RELEASE_CONFIG} \`extra-files\` but NOT ON DISK. release-please\n` +
          `      would update nothing for it. Fix the path or drop the entry.`,
      );
    }
  }

  // Cache each scanned file's coverage map once.
  const coverage = new Map();
  const coveredLines = (f) => {
    if (!coverage.has(f.path)) coverage.set(f.path, releaseCoveredLines(readFileSync(f.path, 'utf8')));
    return coverage.get(f.path);
  };

  for (const f of live) {
    const isListed = configuredSet.has(f.file);
    const covered = coveredLines(f)[f.line - 1] === true;
    if (!isListed) {
      problems.push(
        `${f.file}:${f.line}  @${f.version}\n` +
          `      This file holds a live pin but is NOT in ${RELEASE_CONFIG} \`extra-files\`.\n` +
          `      A release bumps the version and leaves this pin behind, turning this guard\n` +
          `      red on the release commit. Add "/${f.file}" to \`packages["${UI_PKG_DIR}"].extra-files\`.`,
      );
    }
    if (!covered) {
      problems.push(
        `${f.file}:${f.line}  @${f.version}\n` +
          `      Live pin with no release-please annotation, so the bump cannot reach it.\n` +
          `      Wrap the line:  x-release-please-start-version  /  x-release-please-end\n` +
          `      (\`{/* ... */}\` in MDX, \`<!-- ... -->\` in markdown), or waive the line if it\n` +
          `      narrates a past release:  lint-cdn-pins: historical -- <reason>`,
      );
    }
    if (covered) {
      const lineText = readFileSync(f.path, 'utf8').split('\n')[f.line - 1] ?? '';
      if (!pinIsFirstVersionOnLine(lineText, f.col)) {
        problems.push(
          `${f.file}:${f.line}  @${f.version}\n` +
            `      Another version comes FIRST on this annotated line, and release-please\n` +
            `      rewrites only the first one -- so the bump would silently change that other\n` +
            `      version instead of this pin. Put the pin on a line of its own.\n` +
            `      ${lineText.trim().slice(0, 100)}`,
        );
      }
    }
  }

  // A waived line inside an annotated block is the inverse defect: release-please
  // would rewrite a record the waiver exists to freeze.
  for (const f of all.filter((x) => x.waived)) {
    if (coveredLines(f)[f.line - 1] === true) {
      problems.push(
        `${f.file}:${f.line}  @${f.version}\n` +
          `      This pin is WAIVED as historical yet sits inside a release-please annotation.\n` +
          `      The release would rewrite it, turning a true record into a falsehood. The two\n` +
          `      markings contradict each other -- remove one.`,
      );
    }
  }

  if (problems.length > 0) {
    console.error(
      `✗ lint-cdn-pins --check-release-wiring: ${problems.length} pin(s) are not wired to the version bump.\n`,
    );
    for (const p of problems) console.error(`  ${p}\n`);
    console.error(
      `  Every live pin must be rewritten BY the release, or the release commit is red on\n` +
        `  lint-cdn-pins and the publish goes out over a failing required check.`,
    );
    process.exit(1);
  }

  console.log(
    `✓ lint-cdn-pins --check-release-wiring: ${live.length} live pin(s) across ` +
      `${configured.length} \`extra-files\` entr${configured.length === 1 ? 'y' : 'ies'} are reachable by the bump` +
      `${all.length - live.length ? `; ${all.length - live.length} historical pin(s) correctly left alone` : ''}.`,
  );
  process.exit(0);
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
