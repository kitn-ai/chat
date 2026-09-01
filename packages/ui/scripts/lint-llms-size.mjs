// Size budget for llms-full.txt.
//
// WHY A CEILING AT ALL
// llms-full.txt is the whole-API reference an AI coding agent ingests, and it
// only stays useful while it stays SMALL ENOUGH TO USE. Two costs grow with the
// byte count, and both degrade quietly: grep precision (more near-duplicate
// rows means more false hits per query) and whole-file ingestion cost (agents
// that cannot or do not navigate pay for every byte on every read). The file is
// generated, so it grows as a SIDE EFFECT of unrelated work — a new element, a
// fatter doc comment, a new generated section — and nothing else in the tree
// prices that growth. This guard makes growth a conscious act: the author who
// moves the number is the one who read this comment.
//
// THE CEILING, AND THE BASELINE IT WAS SET FROM
// 2026-08-25 baseline: 294,399 bytes measured (84 elements, 122 state/wire
// exports, after the index-pointer regeneration + the #320 dist/llms removal).
// The ceiling is that plus ~14% headroom — enough for normal drift (a handful of new elements, doc
// polish), not enough for a new embedded corpus to ride in unnoticed.
//
// Raise it ONLY with a note in the style of verify-pack-weight.mjs: what grew,
// why the growth is genuinely needed, and why trimming or restructuring
// (pointers from llms.txt into external artifacts, thinner tables, moving
// detail behind the Custom Elements Manifest) was not the better fix.
//
// 2026-08-31 raise: 328 → 344 KiB. Measured 341,927 bytes at 96 elements /
// 123 state/wire exports. What grew: blocks-and-parts phase 1 — SEVEN new
// public elements (kai-panel, kai-panel-header, kai-tab-bar, kai-tab-bar-item,
// kai-view-stack, kai-view, kai-row: ~5 KB of generated element reference) plus
// the new "Icon roster" section (owner-ruled P-8: the 77 curated names were
// enumerated NOWHERE an agent could see, so unknown names got guessed and
// painted as literal text — spike finding F-7; ~2.7 KB, indexed from llms.txt
// per FULL_ONLY_SECTIONS). Neither is trimmable without unshipping the thing:
// the elements are real public API and the roster's whole value is being the
// complete list inline. New headroom is ~2 KiB — deliberately tight, the next
// batch of elements pays its own toll here again.
const MAX_LLMS_FULL_BYTES = 344 * 1024; // 352,256

// THE FLOOR IS A TRUNCATION TRIPWIRE, NOT A TARGET. This repo has already
// shipped the failure it guards: running gen-llms.mjs standalone silently
// rewrote llms-full.txt with LESS data (every slot's inject/replace collapsed
// to `—`), and the oversized diff was the only tell. A ceiling-only check
// passes an empty file. Loose on purpose — a legitimate restructure can shrink
// the file a lot; losing more than half of it cannot be legitimate drift.
const MIN_LLMS_FULL_BYTES = 128 * 1024;
//
// RUNNING IT, without a build — it reads the COMMITTED artifact only:
//
//   node packages/ui/scripts/lint-llms-size.mjs
//   node packages/ui/scripts/lint-llms-size.mjs --self-test   # prove it still detects
//
// (--file / --max-bytes / --min-bytes exist so the wiring test and the
// self-test can point the real code path at fixtures.)
import { statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Anchored to THIS FILE, not the cwd: CLAUDE.md tells everyone to run from the
// repo root while `pnpm --filter` sets the cwd to the package.
const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};
const SELF_TEST = argv.includes('--self-test');
const FILE = resolve(argOf('--file') ?? join(PKG_ROOT, 'llms-full.txt'));
const MAX = Number(argOf('--max-bytes') ?? MAX_LLMS_FULL_BYTES);
const MIN = Number(argOf('--min-bytes') ?? MIN_LLMS_FULL_BYTES);

const kib = (n) => `${(n / 1024).toFixed(1)} KiB`;

/**
 * The one verdict, pure so the self-test exercises the real logic:
 * `{ ok, reason }` for a measured size against the ceiling and the floor.
 * `size === null` means the file could not be measured at all — a missing
 * artifact must be a FAILURE, not a skip, or a deleted file reads as thin.
 */
export function verdict(size, max, min) {
  if (size === null) return { ok: false, reason: 'missing' };
  if (size > max) return { ok: false, reason: 'over-ceiling' };
  if (size < min) return { ok: false, reason: 'under-floor' };
  return { ok: true, reason: 'within-budget' };
}

const measure = (path) => {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// self-test: proves the check still DETECTS, against real files on disk so the
// measurement path is exercised too. Without this, "within budget" is
// unfalsifiable — a broken stat that returned 0 would read as a thin file, and
// a broken comparison would pass any size forever.
// ---------------------------------------------------------------------------
if (SELF_TEST) {
  const dir = mkdtempSync(join(tmpdir(), 'llms-size-'));
  const oversized = join(dir, 'oversized.txt');
  writeFileSync(oversized, 'x'.repeat(2048));
  const fits = join(dir, 'fits.txt');
  writeFileSync(fits, 'x'.repeat(1024));
  const thin = join(dir, 'thin.txt');
  writeFileSync(thin, 'x');

  const CASES = [
    { name: 'a file over the ceiling FAILS', path: oversized, max: 1500, min: 10, expect: 'over-ceiling' },
    { name: 'a file within budget passes', path: fits, max: 1500, min: 10, expect: 'within-budget' },
    { name: 'a file exactly at the ceiling passes (the ceiling is inclusive)', path: fits, max: 1024, min: 10, expect: 'within-budget' },
    { name: 'a truncated file FAILS the floor (the gen-llms standalone collapse)', path: thin, max: 1500, min: 10, expect: 'under-floor' },
    { name: 'a MISSING artifact is a failure, not a skip', path: join(dir, 'nope.txt'), max: 1500, min: 10, expect: 'missing' },
  ];

  let failed = 0;
  for (const c of CASES) {
    const got = verdict(measure(c.path), c.max, c.min).reason;
    const ok = got === c.expect;
    if (!ok) failed += 1;
    console.log(`${ok ? '✓' : '✗'} ${c.name} (expected ${c.expect}, got ${got})`);
  }
  if (failed > 0) {
    console.error(`\n✗ lint-llms-size self-test: ${failed} case(s) failed — the check cannot be trusted to detect.`);
    process.exit(1);
  }
  console.log(`\n✓ lint-llms-size self-test: ${CASES.length} cases behave as specified.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// the real run
// ---------------------------------------------------------------------------
if (!Number.isFinite(MAX) || !Number.isFinite(MIN) || MAX <= MIN) {
  console.error(`✗ lint-llms-size: nonsense budget (max ${MAX}, min ${MIN}).`);
  process.exit(1);
}

const size = measure(FILE);
const { ok, reason } = verdict(size, MAX, MIN);

if (ok) {
  console.log(
    `✓ llms-full.txt size: ${size.toLocaleString()} bytes (${kib(size)}), ` +
      `ceiling ${MAX.toLocaleString()} (${kib(MAX)}) — ${kib(MAX - size)} of headroom left.`,
  );
  process.exit(0);
}

if (reason === 'missing') {
  console.error(
    `✗ lint-llms-size: ${FILE} does not exist.\n` +
      `  llms-full.txt is a COMMITTED artifact, so a missing file is a broken checkout or a\n` +
      `  deleted artifact, not a thin one. Regenerate it: npm run build:api (in packages/ui).`,
  );
  process.exit(1);
}

if (reason === 'under-floor') {
  console.error(
    `✗ lint-llms-size: llms-full.txt is ${size.toLocaleString()} bytes, under the ${kib(MIN)} floor.\n` +
      `  The floor is a truncation tripwire: this repo has already shipped a generator run that\n` +
      `  silently rewrote the file with LESS data (see the note in scripts/lint-llms-size.mjs and\n` +
      `  CLAUDE.md on gen-llms.mjs standalone). Regenerate with npm run build:api and diff the\n` +
      `  result. If the file legitimately shrank this far, lower MIN_LLMS_FULL_BYTES with a note\n` +
      `  saying what was removed.`,
  );
  process.exit(1);
}

console.error(
  `✗ lint-llms-size: llms-full.txt is ${size.toLocaleString()} bytes (${kib(size)}), over the\n` +
    `  ${MAX.toLocaleString()}-byte ceiling (${kib(MAX)}) by ${(size - MAX).toLocaleString()} bytes.\n\n` +
    `  The file is generated, so it grew as a side effect of something — a new element, fatter\n` +
    `  doc comments, a new section. Growth here is paid for on every agent read: grep precision\n` +
    `  and whole-file ingestion cost both degrade with size. Your options, in order:\n\n` +
    `    1. TRIM — find what grew (git diff packages/ui/llms-full.txt, or compare section sizes)\n` +
    `       and tighten the source it is generated from.\n` +
    `    2. RESTRUCTURE — keep llms-full.txt navigable and move bulk behind a pointer: llms.txt\n` +
    `       indexes every major section (tests/scripts/llms-index-coverage.test.ts), and detail\n` +
    `       can live in the Custom Elements Manifest or the docs site instead of inline.\n` +
    `    3. RAISE THE CEILING — only if the growth is genuinely needed: bump\n` +
    `       MAX_LLMS_FULL_BYTES in scripts/lint-llms-size.mjs WITH A NOTE (date, measured size,\n` +
    `       what grew, why trimming lost), in the style of verify-pack-weight.mjs.`,
);
process.exit(1);
