// Reintroduction guard: an OBJECT URL staged onto an attachment's `url`.
//
// THE DEFECT, in one line: `url: URL.createObjectURL(file)`.
//
// An object URL resolves only inside the browser tab that minted it. Staged
// onto an `AttachmentData.url` it renders a flawless thumbnail and is
// meaningless to every provider, because `url` is precisely the field the wire
// has to encode. PR #186 shipped exactly that -- a user turn carrying only an
// attachment reached the model as nothing at all. `toOpenAIMessages` /
// `toAnthropicMessages` now REFUSE a `blob:` URL with a written reason
// (`src/wire/files.ts`), so the failure is loud rather than silent; this guard
// is what stops the source of it growing back. The correct pattern is
// `readAsDataUrl` in `src/elements/default-input.tsx`: a `data:` URI, for EVERY
// file, not just images -- a document with no `url` at all is unencodable for
// the same reason a blob: URL is.
//
// A ZERO-MATCH RUN IS A PASS. Stated up front because the sibling guard in this
// directory does the opposite and the two are different kinds of check.
// `lint-silent-drops` scans for dispatch sites it KNOWS exist, so finding none
// means it is broken. This one scans for a forbidden pattern, so finding none is
// the healthy steady state -- and it is the state the tree is in the moment this
// lands. Copying the zero-match-fails behaviour across would make this fail
// permanently the instant it succeeded.
//
// What DOES make it fail vacuously is scanning nothing, so that is the tripwire
// that survives: zero FILES walked is fatal, and `--self-test` asserts the
// analyzer still detects on known-bad and known-good inputs.
//
// THE ANCHOR, and why it is this and not the shape around it.
// `lint-silent-drops` records that `url: cond ? x : undefined` was considered as
// a rule and REJECTED, because the ternary shape is everywhere and could not pay
// for its false positives. So this anchors nowhere near the ternary. It anchors
// on ONE WRONG FUNCTION FEEDING ONE FIELD: a `createObjectURL` call whose value
// flows into a property named `url`. That is narrow enough to have measured 3
// matches / 3 true positives / 100% precision against pre-fix origin/main, and
// it structurally cannot reach the legitimate uses:
//
//   LEGITIMATE, and deliberately not matched -- minting an object URL to render
//   bytes IN-TAB, with revokeObjectURL cleanup, never staged onto a message:
//     const url = URL.createObjectURL(blob);          // components/image.tsx
//     objectUrl = URL.createObjectURL(blob);          // components/voice-output.tsx
//     new Audio(URL.createObjectURL(await res.blob()))
//   Each binds a VARIABLE (or feeds an argument). None is a `url:` property.
//
//   THE DEFECT, matched:
//     url: URL.createObjectURL(f)
//     url: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined
//     attachment.url = URL.createObjectURL(f)
//
// HOW THE DECISION IS MADE. A real TS parse, then two AST shapes: a property
// assignment whose name is `url` (bare or quoted), and an assignment to a `.url`
// member, in either case with a `createObjectURL` call somewhere in the value.
// Because the value side is a SUBTREE search, the ternary, an `await`, and any
// wrapping all fall out for free without the rule ever mentioning them.
//
// Working on the AST is also what keeps this off prose: this file,
// `default-input.tsx` and `scaffold.ts` all TALK about `URL.createObjectURL` at
// length, and a comment is not a node while a string containing code is a string
// literal, not a call. A guard that fires on prose about itself gets switched
// off within the day.
//
// KNOWN LIMITATION, stated rather than hidden: the flow analysis is one hop.
// `const u = URL.createObjectURL(f); return { url: u };` is NOT caught. Closing
// that needs real alias tracking, which buys false positives back; the measured
// defect is direct, and one honest hop beats a rule nobody trusts.
//
// It also sees CODE only. The third instance fixed alongside this guard was a
// docs props table reading "Object URL or CDN URL", which is prose recommending
// the defect and which no AST rule can reach. Prose stays a review problem.
//
// SCOPE: all first-party source under apps/ and packages/, including tests, and
// including the code inside markdown fences and .astro/.vue/.svelte script
// blocks. See SCAN_ROOTS below for why it is not narrowed to docs/examples.
//
// RUNNING IT, without a build. Parses source, reads no dist/:
//
//   node packages/ui/scripts/lint-attachment-object-urls.mjs
//   node packages/ui/scripts/lint-attachment-object-urls.mjs --self-test
//   node packages/ui/scripts/lint-attachment-object-urls.mjs --list-files
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

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
const LIST_FILES = argv.includes('--list-files');

// Everything first-party, NOT just docs/examples/stories.
//
// The narrower scope was considered. It was rejected because the anchor is
// precise enough that widening costs nothing -- the kit's own legitimate object
// URLs live in `packages/ui/src/components/` and are excluded structurally, by
// being variable bindings, not by being out of scope. Narrowing to docs would
// have bought no precision and left the kit itself free to regress, which is
// where #186 actually happened. Tests are included for the same reason: a test
// staging a blob: URL onto an attachment is asserting the wrong contract.
const SCAN_ROOTS = ['apps', 'packages'];
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '.astro', '.nx', '.cache',
  'coverage', 'storybook-static', '.turbo', '.output', '.vercel', '.wrangler',
]);
// Gitignored COPIES of built kit output, not source. `apps/docs/public/kitn/` is
// written by the docs site's prebuild (copy-kit-assets.mjs) and is gitignored, so
// whether it exists depends on whether anyone has run a build -- which made the
// scanned-file count differ between a fresh checkout and a built one. Left in, a
// finding could also be reported against a bundle nobody can edit, whose source
// this scan already covers.
const SKIP_PATHS = ['apps/docs/public/kitn'];
const CODE_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const FENCE_EXT = new Set(['.md', '.mdx']);
const MARKUP_EXT = new Set(['.astro', '.vue', '.svelte']);

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
    } else if (e.isFile()) {
      const ext = extname(e.name);
      if (CODE_EXT.has(ext) || FENCE_EXT.has(ext) || MARKUP_EXT.has(ext)) out.push(full);
    }
  }
  return out;
}

// Detection is STRUCTURAL, on a real parse. A first cut of this script worked on
// blanked text and regex windows instead, and the self-test plus a coverage
// check caught it red-handed: on a .tsx file the raw scanner has no JSX text
// context, so an apostrophe in prose ("don't") opens a string literal and a
// stray backtick opens a template that swallows lines -- which silently blanked
// a REAL defect out of the input and reported the tree clean. A guard that
// mis-lexes its own input is the failure mode this repo keeps paying for, so the
// text-window approach was abandoned rather than patched.
//
// `ts.createSourceFile` is error-tolerant and never throws, so a fenced snippet
// or an .astro script block parses fine even when it is not a whole program.
const parse = (path, text) =>
  ts.createSourceFile(path, text, ts.ScriptTarget.Latest, /* setParentNodes */ true, ts.ScriptKind.TSX);

/** Does this subtree call `createObjectURL`? Covers `URL.createObjectURL(f)`,
 *  a destructured `createObjectURL(f)`, and any wrapping (`await`, a ternary
 *  arm, a template) because it is a subtree search rather than a shape match. */
function callsCreateObjectURL(node) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const name = ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : ts.isIdentifier(callee)
          ? callee.text
          : undefined;
      if (name === 'createObjectURL') {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** Is this the name `url`, written bare or quoted? `{ url: ... }` and
 *  `{ 'url': ... }` are the same sink and both must count. */
const isUrlName = (name) =>
  !!name &&
  ((ts.isIdentifier(name) && name.text === 'url') ||
    (ts.isStringLiteral(name) && name.text === 'url') ||
    (ts.isComputedPropertyName(name) &&
      ts.isStringLiteral(name.expression) &&
      name.expression.text === 'url'));

/** Findings in one parsed region: a `url` PROPERTY (or `.url` member) whose
 *  value comes from `createObjectURL`.
 *
 *  Only these two forms. A `const url = URL.createObjectURL(blob)` variable is
 *  NOT a property assignment and so is never reached -- which is exactly how
 *  components/image.tsx and components/voice-output.tsx stay clean without
 *  needing an exemption list. */
function findInSource(sf) {
  const hits = [];
  const visit = (node) => {
    // { url: <expr> }
    if (ts.isPropertyAssignment(node) && isUrlName(node.name) && callsCreateObjectURL(node.initializer)) {
      hits.push(node.name.getStart(sf));
    }
    // something.url = <expr>
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.name.text === 'url' &&
      callsCreateObjectURL(node.right)
    ) {
      hits.push(node.left.getStart(sf));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

/** Regions of a file that are actually code, as [start, end) offsets into the
 *  ORIGINAL text so line numbers survive. Markdown contributes its fenced
 *  blocks; markup files contribute their script blocks; code files are all
 *  code. Everything outside a region is prose and is never analyzed. */
function codeRegions(text, ext) {
  if (CODE_EXT.has(ext)) return [[0, text.length]];
  const regions = [];
  if (FENCE_EXT.has(ext)) {
    // ```lang ... ``` -- language tag captured so a ```bash block is skipped.
    const fence = /^([ \t]*)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)^[ \t]*\2[ \t]*$/gm;
    let m;
    while ((m = fence.exec(text)) !== null) {
      const lang = (m[3].trim().split(/[\s{,]/)[0] || '').toLowerCase();
      const OK = ['', 'js', 'jsx', 'ts', 'tsx', 'javascript', 'typescript', 'mjs', 'json5'];
      if (!OK.includes(lang)) continue;
      const bodyStart = m.index + m[0].indexOf('\n', m[0].indexOf(m[2])) + 1;
      regions.push([bodyStart, bodyStart + m[4].length]);
    }
    return regions;
  }
  if (MARKUP_EXT.has(ext)) {
    if (ext === '.astro') {
      const fm = /^---\n([\s\S]*?)\n---/.exec(text);
      if (fm) regions.push([fm.index + 4, fm.index + 4 + fm[1].length]);
    }
    const script = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = script.exec(text)) !== null) {
      const bodyStart = m.index + m[0].indexOf('>') + 1;
      regions.push([bodyStart, bodyStart + m[1].length]);
    }
    return regions;
  }
  return regions;
}

/** Offsets into the ORIGINAL file text, so a finding inside a markdown fence
 *  still reports the line a reader would open. */
function analyze(text, regions, path = 'input.tsx') {
  const out = [];
  for (const [start, end] of regions) {
    const sf = parse(path, text.slice(start, end));
    for (const pos of findInSource(sf)) out.push({ at: start + pos });
  }
  return out.sort((a, b) => a.at - b.at);
}

const lineOf = (text, at) => text.slice(0, at).split('\n').length;
const lineTextOf = (text, at) => {
  const start = text.lastIndexOf('\n', at) + 1;
  const end = text.indexOf('\n', at);
  return text.slice(start, end === -1 ? text.length : end).trim();
};

function scanFile(path) {
  const text = readFileSync(path, 'utf8');
  const regions = codeRegions(text, extname(path));
  if (regions.length === 0) return [];
  return analyze(text, regions, path).map((f) => ({
    file: relative(REPO_ROOT, path),
    line: lineOf(text, f.at),
    src: lineTextOf(text, f.at),
  }));
}

// ---------------------------------------------------------------------------
// self-test: proves the analyzer still DETECTS, and still lets the legitimate
// in-tab uses through. Without this, "0 findings" is unfalsifiable.
// ---------------------------------------------------------------------------
const SELF_TEST_CASES = [
  { name: 'url: URL.createObjectURL(f) -- the bare defect', expect: true,
    code: `const a = { id: '1', type: 'file', url: URL.createObjectURL(f) };` },
  { name: 'the exact shape that shipped (image-only ternary)', expect: true,
    code: `const a = { filename: f.name, mediaType: f.type || undefined,
      url: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined };` },
  { name: 'member assignment attachment.url = ...', expect: true,
    code: `attachment.url = URL.createObjectURL(f);` },
  { name: 'quoted key', expect: true, code: `const a = { 'url': URL.createObjectURL(f) };` },
  { name: 'url: after another key on a previous line', expect: true,
    code: `const a = {\n  mediaType: f.type,\n  url: URL.createObjectURL(f),\n};` },
  // -- the legitimate in-tab uses, which must stay clean --
  { name: 'LEGIT const url = ... feeding an <img> (components/image.tsx)', expect: false,
    code: `const url = URL.createObjectURL(blob); setObjectUrl(url); onCleanup(() => URL.revokeObjectURL(url));` },
  { name: 'LEGIT objectUrl = ... feeding audio.src (components/voice-output.tsx)', expect: false,
    code: `objectUrl = URL.createObjectURL(blob); audio.src = objectUrl;` },
  { name: 'LEGIT new Audio(URL.createObjectURL(...)) (text-to-speech recipe)', expect: false,
    code: `const audio = new Audio(URL.createObjectURL(await res.blob()));` },
  { name: 'LEGIT reassignment of a module-scope object URL', expect: false,
    code: `currentAudio = new Audio(URL.createObjectURL(await res.blob()));` },
  { name: 'a different field is not this rule', expect: false,
    code: `const a = { src: URL.createObjectURL(blob) };` },
  { name: 'a test shim assigning URL.createObjectURL itself', expect: false,
    code: `globalThis.URL.createObjectURL ??= () => 'blob:kai-test';` },
  { name: 'a vi.fn() mock keyed by the function name', expect: false,
    code: `const stub = { createObjectURL: vi.fn(() => 'blob:fake') };` },
  // -- the fix itself, and prose about the rule --
  { name: 'THE FIX: url: await readAsDataUrl(f)', expect: false,
    code: `const a = { url: await readAsDataUrl(f) };` },
  { name: 'a comment warning against it does not fire', expect: false,
    code: `// A data: URI, NOT URL.createObjectURL -- an object URL resolves only in-tab.\nconst a = { url: await readAsDataUrl(f) };` },
  { name: 'a string literal quoting the bad code does not fire', expect: false,
    code: "const emitted = ['  url: URL.createObjectURL(file),'];" },
  // -- regressions from the first cut of this script, kept so they stay dead --
  { name: "JSX prose with an apostrophe does not blank the defect away", expect: true,
    code: `export const S = () => <p>you don't say</p>;
      const a = { url: URL.createObjectURL(f) };` },
  { name: 'a backtick in JSX prose does not swallow the defect', expect: true,
    code: 'export const S = () => <p>use the `url` field</p>;\n' +
      'const a = { url: URL.createObjectURL(f) };' },
  { name: 'destructured createObjectURL(f) still counts', expect: true,
    code: `const { createObjectURL } = URL; const a = { url: createObjectURL(f) };` },
];

if (SELF_TEST) {
  let failed = 0;
  for (const c of SELF_TEST_CASES) {
    const got = analyze(c.code, [[0, c.code.length]]).length > 0;
    const ok = got === c.expect;
    if (!ok) failed++;
    console.log(
      `${ok ? '✓' : '✗'} ${c.name} (expected ${c.expect ? 'a finding' : 'clean'}, got ${got ? 'a finding' : 'clean'})`,
    );
  }
  if (failed > 0) {
    console.error(`\n✗ lint-attachment-object-urls self-test: ${failed}/${SELF_TEST_CASES.length} case(s) failed.`);
    process.exit(1);
  }
  console.log(
    `\n✓ lint-attachment-object-urls self-test: ${SELF_TEST_CASES.length}/${SELF_TEST_CASES.length} cases behave as specified.`,
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// the real run
// ---------------------------------------------------------------------------
const roots = SCAN_ROOTS.map((r) => join(REPO_ROOT, r)).filter(
  (d) => existsSync(d) && statSync(d).isDirectory(),
);
if (roots.length === 0) {
  console.error(
    `✗ lint-attachment-object-urls: none of ${SCAN_ROOTS.join(', ')} exist under ${REPO_ROOT}.\n` +
      `  Nothing could be scanned, which is this script being misrooted, not the tree being clean.`,
  );
  process.exit(1);
}

const files = roots.flatMap((r) => walk(r, [])).sort();

// The one fatal vacuity case. Zero FINDINGS is the healthy steady state and
// passes; zero FILES means the walk is broken and would pass everything.
if (files.length === 0) {
  console.error(
    `✗ lint-attachment-object-urls: walked ${roots.length} root(s) and matched NO source file.\n` +
      `  A zero-FILE run is this script being broken. (Zero FINDINGS, by contrast, is a pass.)`,
  );
  process.exit(1);
}

if (LIST_FILES) {
  for (const f of files) console.log(relative(REPO_ROOT, f));
  console.error(`\n${files.length} file(s) in scope.`);
  process.exit(0);
}

const findings = files.flatMap(scanFile);

if (findings.length === 0) {
  console.log(
    `✓ lint-attachment-object-urls: ${files.length} source file(s) across ${SCAN_ROOTS.join(', ')}; ` +
      `no object URL is staged onto an attachment's \`url\`.`,
  );
  process.exit(0);
}

console.error(
  `✗ lint-attachment-object-urls: ${findings.length} object URL(s) staged onto an attachment \`url\` field.\n`,
);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}`);
  console.error(`    ${f.src}`);
  console.error('');
}
console.error(
  `  An object URL resolves ONLY inside the tab that minted it. On an attachment's\n` +
    `  \`url\` -- the field the wire encodes -- it renders a perfect thumbnail and is\n` +
    `  meaningless to every provider; toOpenAIMessages / toAnthropicMessages refuse it.\n\n` +
    `  Stage a \`data:\` URI instead, for EVERY file rather than only images:\n` +
    `    const url = await new Promise((resolve, reject) => {\n` +
    `      const reader = new FileReader();\n` +
    `      reader.onload = () => resolve(String(reader.result));\n` +
    `      reader.onerror = () => reject(reader.error);\n` +
    `      reader.readAsDataURL(file);\n` +
    `    });\n` +
    `  The reference implementation is \`readAsDataUrl\` in src/elements/default-input.tsx.\n\n` +
    `  Minting an object URL to render bytes IN-TAB (an <img>, an <audio>) with\n` +
    `  revokeObjectURL cleanup is CORRECT and is not what this matched -- bind it to a\n` +
    `  variable rather than to an attachment's \`url\`.`,
);
process.exit(1);
