#!/usr/bin/env node
/**
 * Proves that every file excluded from the fifth typecheck pass
 * (tsconfig.tests.json) is still excluded for the reason written next to it.
 *
 * WHY THIS EXISTS. `exclude` is a list of files the pass does not read, so the
 * pass is green whether they are broken or perfect: it cannot tell you when an
 * entry's reason expires. That is not hypothetical. `vitest.config.ts` was
 * quarantined for a TS2769 that meant the CI chromium hardening never reached
 * the browser; the flags were then moved onto the provider and the error went
 * away, and the pass stayed green from both sides of that fix, because the file
 * was excluded by name either way. The exclusion list is selected for exactly
 * the files that already had errors — the files most likely to have more — so an
 * entry outliving its reason is the expected failure, not bad luck.
 *
 * WHAT IT CHECKS. Each entry records the diagnostics it was quarantined FOR
 * (`expect: { count, codes }`). This script re-includes every quarantined file,
 * compiles the same program the pass would have compiled, and asserts each one
 * still produces exactly those diagnostics. Fix the underlying error and this
 * goes RED — the file compiles clean, its IOU is paid, and the entry has to come
 * out of `exclude`. Change the error and it also goes red, because the reason
 * text no longer describes what is there.
 *
 * It also checks the bookkeeping, which is where entries rot quietly:
 *   • every `exclude` entry is either declared structural or has a quarantine
 *     entry — no silent additions;
 *   • no `exclude` entry is one `resolved` claims is fixed — that combination reads
 *     as checked and is not;
 *   • every quarantine entry is actually in `exclude` — no dead metadata;
 *   • every quarantined file exists on disk;
 *   • every entry carries a date, a reason, and an expectation.
 *
 * WHEN THE LIST IS EMPTY (it is, as of 2026-08-12) the re-inclusion check has nothing
 * to re-include, and a check with nothing to do is a check that proves nothing — it
 * would pass in ~0ms over any tree, and the rot would surface only when someone next
 * filed an entry. So the empty case runs the same compile over the pass AS SHIPPED and
 * fails on any error, which keeps the machinery exercised and is the pass's only run
 * on a fresh tree (see the note about ordering below). It says which mode it took.
 *
 * Run: node scripts/verify-quarantine.mjs   (also runs as part of `npm run typecheck`)
 *
 * IT RUNS FIRST IN THAT CHAIN, before the five tsc passes, and that is deliberate
 * rather than tidy. The chain is `&&`-joined, and the fourth pass (tsconfig.mcp.json)
 * is RED on any unbuilt tree — one TS6142 for the .tsx the no-jsx MCP pass cannot
 * load, documented in that config — so everything after it is skipped on a fresh
 * clone or worktree. A rot detector that only runs once someone has built is a rot
 * detector that does not run when it is most needed. It costs ~5s, reads no build
 * output, and compiles from source through the TypeScript API, so first is free.
 *
 * PROVING IT STILL DETECTS
 * -----------------------
 * Everything above is a claim about what this script NOTICES, and on a tree with an
 * empty quarantine list — which is the tree today — not one of those claims is
 * exercised by running it. The empty-list branch compiles the pass and finds it
 * clean; the entire re-inclusion half, the part that catches an expired IOU, never
 * executes. That is the shape this repo keeps paying for: a check whose interesting
 * half only runs on inputs nobody currently has.
 *
 *   node scripts/verify-quarantine.mjs                       # this package
 *   node scripts/verify-quarantine.mjs --self-test           # prove it still detects
 *   node scripts/verify-quarantine.mjs --package-root <dir>  # any tree, e.g. a planted defect
 *
 * `--self-test` builds throwaway packages with a real tsconfig.tests.json and real
 * (tiny) TypeScript files, and drives the SAME code path over them: an entry that
 * has started compiling clean, an entry whose errors changed, every bookkeeping
 * rule, and a healthy quarantined entry that must stay silent.
 */
import ts from 'typescript';
import path from 'node:path';
import { existsSync, statSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const argOf = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
};
const SELF_TEST = argv.includes('--self-test');
const PKG_DIR = path.resolve(
  argOf('--package-root') ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
);

/**
 * The whole check over ONE package directory. Returns its failures and notes
 * rather than exiting, so `--self-test` can drive the same code path over
 * fixtures — a self-test against a reimplementation would prove nothing.
 */
function checkQuarantine(pkgDir) {
const configPath = path.join(pkgDir, 'tsconfig.tests.json');

const failures = [];
const notes = [];
const fail = (msg) => failures.push(msg);

const read = ts.readConfigFile(configPath, ts.sys.readFile);
if (read.error) {
  return { failures: [ts.flattenDiagnosticMessageText(read.error.messageText, '\n')], notes, configPath };
}
const config = read.config;

const structural = config.structuralExcludes ?? {};
const entries = config.quarantine?.entries ?? {};
const resolved = config.resolved ?? {};
const excluded = config.exclude ?? [];

/**
 * Compile the pass with `exclude` replaced by `excludeList`, and return its
 * diagnostics grouped by package-relative path (node_modules dropped —
 * skipLibCheck is on, so anything from there is noise this script cannot act on).
 *
 * Both branches below go through here on purpose. The re-inclusion check and the
 * empty-list check are then the SAME code path with a different exclude list, so
 * the machinery cannot be working for one and quietly broken for the other.
 *
 * @param {string[]} excludeList
 * @returns {{ byFile: Map<string, number[]>, fileCount: number }}
 */
function compileWith(excludeList) {
  const probe = { ...config, exclude: excludeList };
  const parsed = ts.parseJsonConfigFileContent(probe, ts.sys, pkgDir, undefined, configPath);
  if (parsed.errors.length) {
    for (const d of parsed.errors) fail(`tsconfig: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
  }
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  /** @type {Map<string, number[]>} relative file path -> error codes */
  const byFile = new Map();
  for (const d of ts.getPreEmitDiagnostics(program)) {
    if (!d.file) continue;
    const rel = path.relative(pkgDir, d.file.fileName);
    if (rel.includes('node_modules')) continue;
    if (!byFile.has(rel)) byFile.set(rel, []);
    byFile.get(rel).push(d.code);
  }
  const fileCount = program
    .getSourceFiles()
    .map((f) => path.relative(pkgDir, f.fileName))
    .filter((f) => !f.includes('node_modules') && !f.startsWith('src/')).length;
  return { byFile, fileCount };
}

// ---------------------------------------------------------------- bookkeeping
for (const e of excluded) {
  if (e in resolved && !(e in entries)) {
    fail(
      `exclude has "${e}", but "resolved" says it is FIXED. A resolved entry that stays excluded is ` +
        `the worst of both: it reads as checked and is not. Remove it from "exclude".`,
    );
    continue;
  }
  if (!(e in structural) && !(e in entries)) {
    fail(
      `exclude has "${e}" with no reason. Add it to "structuralExcludes" (a whole tree another ` +
        `pass owns) or to "quarantine.entries" (a file with errors), with a reason.`,
    );
  }
}
for (const [file, meta] of Object.entries(entries)) {
  if (!excluded.includes(file)) {
    fail(`quarantine entry "${file}" is not in "exclude" — it is checked already. Move it to "resolved".`);
  }
  const abs = path.join(pkgDir, file);
  // The glob test goes FIRST, and that ordering is load-bearing. It used to sit in
  // the `else` of the existence check, where it was all but dead: a glob like
  // `sub/*.ts` is not a path that exists, so it took the "does not exist on disk.
  // Delete the entry." branch and the person reading it was told the wrong thing
  // about the wrong problem. Found by the self-test below, which expected the
  // documented message and got the other one.
  if (/[*?]/.test(file) || (existsSync(abs) && statSync(abs).isDirectory())) {
    // A directory or glob has no error signature to match against, so it would
    // sail through the re-inclusion check below by never matching a diagnostic
    // path — passing while proving nothing. Quarantine files one at a time; a
    // whole tree this pass does not own belongs in `structuralExcludes`.
    fail(`quarantine entry "${file}" is a directory or glob. Quarantine individual FILES, each with its own error expectation, or declare the tree in "structuralExcludes".`);
  } else if (!existsSync(abs)) {
    fail(`quarantine entry "${file}" does not exist on disk. Delete the entry.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta?.since ?? '')) fail(`quarantine entry "${file}" needs a "since" date (YYYY-MM-DD).`);
  if (!meta?.reason) fail(`quarantine entry "${file}" needs a "reason".`);
  if (!Array.isArray(meta?.expect?.codes) || meta.expect.codes.length === 0) {
    fail(`quarantine entry "${file}" needs "expect.codes" — the TS error codes it is quarantined for.`);
  }
  if (!Number.isInteger(meta?.expect?.count) || meta.expect.count < 1) {
    fail(`quarantine entry "${file}" needs "expect.count" — how many errors it produces.`);
  }
}

const quarantined = Object.keys(entries).filter((f) => {
  const abs = path.join(pkgDir, f);
  return existsSync(abs) && statSync(abs).isFile();
});

// ------------------------------------------------------- the discriminating bit
// Compile the pass's program with the quarantined files put BACK in, then read
// the diagnostics off each one. A quarantined file with nothing to say is an
// expired IOU.
if (quarantined.length === 0) {
  // NOTHING IS OWED — and that is exactly when this script is most likely to become
  // a check that proves nothing. With an empty list every line below is dead, so it
  // would pass in ~0ms whatever state the tree is in, and the next person to file an
  // entry would be the one who discovers the re-inclusion machinery rotted while
  // nobody was looking. So run the SAME machinery over the pass exactly as shipped
  // and assert the result is clean.
  //
  // This is not a redundant `tsc -p tsconfig.tests.json`. That command is LAST in
  // the `&&`-joined typecheck chain, behind tsconfig.mcp.json, which is red on any
  // unbuilt tree — so on a fresh clone or worktree the fifth pass never runs and
  // this is the only place it happens at all. Same reason this script goes first.
  const { byFile, fileCount } = compileWith(excluded);
  notes.push(
    `quarantine list is EMPTY — nothing owed, so the re-inclusion check had nothing to re-include.`,
  );
  notes.push(
    `Compiled the pass as shipped instead: ${fileCount} files outside src/, ${byFile.size} with errors.`,
  );
  for (const [file, codes] of byFile) {
    fail(
      `"${file}" does not compile under the pass (${codes.length}x ${[...new Set(codes.map((c) => `TS${c}`))].sort().join(', ')}). ` +
        `Fix it. Quarantining it is the fallback, not the first move, and it costs a dated entry in tsconfig.tests.json.`,
    );
  }
} else {
  const { byFile } = compileWith(excluded.filter((e) => !(e in entries)));

  for (const file of quarantined) {
    const got = byFile.get(file) ?? [];
    const meta = entries[file];
    // A malformed entry has ALREADY been reported by the bookkeeping above, and
    // reading `meta.expect.codes` off it threw a TypeError that took the whole run
    // down — losing those reports and printing a stack trace in place of four
    // actionable messages. Found by the self-test case for an entry with no
    // metadata at all.
    if (!Array.isArray(meta?.expect?.codes) || !Number.isInteger(meta?.expect?.count)) continue;
    const wantCodes = [...new Set(meta.expect.codes)].sort();
    const gotCodes = [...new Set(got.map((c) => `TS${c}`))].sort();

    if (got.length === 0) {
      fail(
        `"${file}" is quarantined but compiles CLEAN. Its reason has expired — remove it from ` +
          `"exclude", move the entry to "resolved" with what fixed it, and let the pass check it.\n` +
          `      quarantined ${meta.since} for: ${meta.expect.count}x ${meta.expect.codes.join(', ')}`,
      );
      continue;
    }
    if (got.length !== meta.expect.count || String(gotCodes) !== String(wantCodes)) {
      fail(
        `"${file}" no longer produces the errors it was quarantined for, so its reason no longer ` +
          `describes it. Re-read the entry and update it (or fix the file and un-quarantine it).\n` +
          `      expected ${meta.expect.count}x [${wantCodes.join(', ')}]\n` +
          `      actual   ${got.length}x [${gotCodes.join(', ')}]`,
      );
      continue;
    }
    const age = Math.floor((Date.now() - Date.parse(meta.since)) / 86400000);
    notes.push(`ok  ${file} — ${got.length}x ${gotCodes.join(', ')}, owed since ${meta.since} (${age}d)`);
  }

  // Re-including the quarantined files can also break files that are NOT
  // quarantined. That is not a failure of this check (the pass covers those
  // files today and they are green), but it is what un-quarantining would cost,
  // so say it rather than swallow it.
  const collateral = [...byFile.keys()].filter((f) => !quarantined.includes(f));
  for (const f of collateral) notes.push(`note ${f} errors only when the quarantined files are re-included`);
}

  return { failures, notes, configPath, quarantinedCount: quarantined.length };
}

// ---------------------------------------------------------------------------
// self-test: real tsconfigs, real (tiny) TypeScript, driven through the same
// checkQuarantine above. The re-inclusion half is the reason this exists — on
// the tree as it stands the list is empty, so that half never runs at all.
// ---------------------------------------------------------------------------

/** A file with exactly one diagnostic, TS2322, so an expectation can be exact. */
const BROKEN_TS = 'export const n: number = "not a number";\n';
const CLEAN_TS = 'export const ok: number = 1;\n';

const TSCONFIG = (over = {}) => ({
  compilerOptions: {
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: 'ESNext',
    module: 'ESNext',
    moduleResolution: 'Bundler',
  },
  include: ['*.ts'],
  exclude: [],
  ...over,
});

function fixturePkg(tsconfig, files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'verify-quarantine-selftest-'));
  const all = { 'clean.ts': CLEAN_TS, ...files };
  for (const [rel, content] of Object.entries(all)) {
    if (content === null) continue;
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  writeFileSync(path.join(root, 'tsconfig.tests.json'), JSON.stringify(tsconfig, null, 2));
  return root;
}

const ENTRY = (over = {}) => ({
  since: '2026-01-01',
  reason: 'a real reason, written down',
  expect: { count: 1, codes: ['TS2322'] },
  ...over,
});

const SELF_TEST_CASES = [
  {
    name: 'empty list, and the pass as shipped compiles clean',
    root: () => fixturePkg(TSCONFIG()),
    expect: [],
  },
  {
    name: 'empty list, but a file IN the pass does not compile',
    // The empty-list branch is not a no-op: it compiles the pass as shipped, which
    // on a fresh clone is the ONLY place the fifth pass runs at all.
    root: () => fixturePkg(TSCONFIG(), { 'broken.ts': BROKEN_TS }),
    expect: ['does not compile under the pass', 'TS2322'],
  },
  {
    name: 'a quarantined entry that still produces exactly its expected errors is silent',
    root: () =>
      fixturePkg(
        TSCONFIG({ exclude: ['broken.ts'], quarantine: { entries: { 'broken.ts': ENTRY() } } }),
        { 'broken.ts': BROKEN_TS },
      ),
    expect: [],
  },
  {
    name: 'EXPIRED IOU: a quarantined entry that now compiles CLEAN',
    // The case the whole re-inclusion half exists for, and the one that never runs
    // on a tree with an empty list.
    root: () =>
      fixturePkg(
        TSCONFIG({ exclude: ['fixed.ts'], quarantine: { entries: { 'fixed.ts': ENTRY() } } }),
        { 'fixed.ts': CLEAN_TS },
      ),
    expect: ['compiles CLEAN', 'Its reason has expired'],
  },
  {
    name: 'an entry whose errors no longer match what it was quarantined for',
    root: () =>
      fixturePkg(
        TSCONFIG({
          exclude: ['broken.ts'],
          quarantine: { entries: { 'broken.ts': ENTRY({ expect: { count: 2, codes: ['TS2322'] } }) } },
        }),
        { 'broken.ts': BROKEN_TS },
      ),
    expect: ['no longer produces the errors it was quarantined for', 'expected 2x', 'actual   1x'],
  },
  {
    name: 'an exclude entry with no reason at all',
    root: () => fixturePkg(TSCONFIG({ exclude: ['clean.ts'] })),
    expect: ['with no reason'],
  },
  {
    name: 'an exclude entry that "resolved" claims is already fixed',
    root: () =>
      fixturePkg(TSCONFIG({ exclude: ['clean.ts'], resolved: { 'clean.ts': 'fixed in #123' } })),
    expect: ['says it is FIXED'],
  },
  {
    name: 'a quarantine entry that is not excluded at all',
    root: () =>
      fixturePkg(TSCONFIG({ quarantine: { entries: { 'broken.ts': ENTRY() } } }), { 'broken.ts': BROKEN_TS }),
    expect: ['is not in "exclude"'],
  },
  {
    name: 'a quarantine entry for a file that is gone',
    root: () =>
      fixturePkg(TSCONFIG({ exclude: ['ghost.ts'], quarantine: { entries: { 'ghost.ts': ENTRY() } } })),
    expect: ['does not exist on disk'],
  },
  {
    name: 'a quarantine entry that is a glob rather than a file',
    // A glob matches no diagnostic path, so it would sail through the re-inclusion
    // check forever while proving nothing.
    root: () =>
      fixturePkg(TSCONFIG({ exclude: ['sub/*.ts'], quarantine: { entries: { 'sub/*.ts': ENTRY() } } }), {
        'sub/thing.ts': CLEAN_TS,
      }),
    expect: ['is a directory or glob'],
  },
  {
    name: 'an entry missing its date, reason and expectation',
    root: () =>
      fixturePkg(
        TSCONFIG({ exclude: ['broken.ts'], quarantine: { entries: { 'broken.ts': {} } } }),
        { 'broken.ts': BROKEN_TS },
      ),
    expect: ['needs a "since" date', 'needs a "reason"', 'needs "expect.codes"', 'needs "expect.count"'],
  },
  {
    name: 'a structural exclude is declared, so it is not a silent addition',
    root: () =>
      fixturePkg(TSCONFIG({ exclude: ['sub'], structuralExcludes: { sub: 'owned by another pass' } }), {
        'sub/thing.ts': CLEAN_TS,
      }),
    expect: [],
  },
];

if (SELF_TEST) {
  let failed = 0;
  for (const c of SELF_TEST_CASES) {
    const { failures } = checkQuarantine(c.root());
    const text = failures.join('\n');
    const missingExpected = c.expect.filter((s) => !text.includes(s));
    const cleanMismatch = c.expect.length === 0 && failures.length > 0;
    const ok = missingExpected.length === 0 && !cleanMismatch;
    if (!ok) failed++;
    console.log(
      `${ok ? '✓' : '✗'} ${c.name} (expected ${c.expect.length === 0 ? 'clean' : c.expect.map((s) => `"${s}"`).join(' + ')}, got ${failures.length === 0 ? 'clean' : `${failures.length} failure(s)`})`,
    );
    if (missingExpected.length > 0) console.log(`    missing: ${missingExpected.map((s) => `"${s}"`).join(', ')}`);
    if (cleanMismatch) console.log(`    unexpected: ${text.split('\n')[0]}`);
  }
  if (failed > 0) {
    console.error(`\n✗ verify-quarantine self-test: ${failed}/${SELF_TEST_CASES.length} case(s) failed.`);
    process.exit(1);
  }
  console.log(
    `\n✓ verify-quarantine self-test: ${SELF_TEST_CASES.length}/${SELF_TEST_CASES.length} cases behave as specified.`,
  );
  process.exit(0);
}

// ------------------------------------------------------------------- report
const { failures, notes, configPath, quarantinedCount } = checkQuarantine(PKG_DIR);
for (const n of notes) console.log(n);
if (failures.length) {
  console.error(`\nquarantine check FAILED (${failures.length}):\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n  ${configPath}`);
  process.exit(1);
}
console.log(
  quarantinedCount === 0
    ? '\nquarantine check passed — no entries owed, and the pass compiles clean without them.'
    : quarantinedCount === 1
      ? '\nquarantine check passed — 1 entry, still earning its place.'
      : `\nquarantine check passed — ${quarantinedCount} entries, each still earning its place.`,
);
