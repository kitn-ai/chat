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
 */
import ts from 'typescript';
import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(pkgDir, 'tsconfig.tests.json');

const failures = [];
const notes = [];
const fail = (msg) => failures.push(msg);

const read = ts.readConfigFile(configPath, ts.sys.readFile);
if (read.error) {
  console.error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
  process.exit(1);
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
  if (!existsSync(abs)) {
    fail(`quarantine entry "${file}" does not exist on disk. Delete the entry.`);
  } else if (statSync(abs).isDirectory() || /[*?]/.test(file)) {
    // A directory or glob has no error signature to match against, so it would
    // sail through the re-inclusion check below by never matching a diagnostic
    // path — passing while proving nothing. Quarantine files one at a time; a
    // whole tree this pass does not own belongs in `structuralExcludes`.
    fail(`quarantine entry "${file}" is a directory or glob. Quarantine individual FILES, each with its own error expectation, or declare the tree in "structuralExcludes".`);
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

// ------------------------------------------------------------------- report
for (const n of notes) console.log(n);
if (failures.length) {
  console.error(`\nquarantine check FAILED (${failures.length}):\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n  ${configPath}`);
  process.exit(1);
}
console.log(
  quarantined.length === 0
    ? '\nquarantine check passed — no entries owed, and the pass compiles clean without them.'
    : quarantined.length === 1
      ? '\nquarantine check passed — 1 entry, still earning its place.'
      : `\nquarantine check passed — ${quarantined.length} entries, each still earning its place.`,
);
