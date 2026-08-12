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
 *   • every quarantine entry is actually in `exclude` — no dead metadata;
 *   • every quarantined file exists on disk;
 *   • every entry carries a date, a reason, and an expectation.
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
const excluded = config.exclude ?? [];

// ---------------------------------------------------------------- bookkeeping
for (const e of excluded) {
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
  notes.push('No quarantined files. Nothing to re-check — this passes vacuously, as it should.');
} else {
  const probe = { ...config, exclude: excluded.filter((e) => !(e in entries)) };
  const parsed = ts.parseJsonConfigFileContent(probe, ts.sys, pkgDir, undefined, configPath);
  if (parsed.errors.length) {
    for (const d of parsed.errors) fail(`tsconfig: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
  }
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const diagnostics = ts.getPreEmitDiagnostics(program);

  /** @type {Map<string, number[]>} relative file path -> error codes */
  const byFile = new Map();
  for (const d of diagnostics) {
    if (!d.file) continue;
    const rel = path.relative(pkgDir, d.file.fileName);
    if (!byFile.has(rel)) byFile.set(rel, []);
    byFile.get(rel).push(d.code);
  }

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
  const collateral = [...byFile.keys()].filter((f) => !quarantined.includes(f) && !f.includes('node_modules'));
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
  quarantined.length === 1
    ? '\nquarantine check passed — 1 entry, still earning its place.'
    : `\nquarantine check passed — ${quarantined.length} entries, each still earning its place.`,
);
