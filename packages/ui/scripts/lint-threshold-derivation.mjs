// Derivation guard for NUMERIC THRESHOLDS written into plans and specs.
//
// WHY IT EXISTS
// A plan for a freshness guard carried a `< 6000` byte budget. Nothing produced
// that number: it was invented while the prose was being drafted, and it read
// like a measurement because it had a digit in it. It survived into the brief,
// and the only reason it did not survive into the tree is that the implementer
// declined to weaken an assertion to satisfy it. A threshold with no derivation
// is a guess wearing a number, and the guess is the more persuasive of the two
// because everything downstream treats it as evidence.
//
// This is the same failure the repo already knows in another form: CLAUDE.md
// bans "any number a script can produce" from itself, because a stale figure
// survived a whole change of axis. That rule governs a file nobody re-reads.
// This one governs the documents where the numbers are BORN.
//
// THE INVARIANT
// A line in a NEW plan or spec that states a numeric threshold must say where
// the number comes from: the command that produces it, an explicit statement
// that it is a ratchet rather than a target, or a written waiver. Any of the
// three is enough. None of them is not.
//
// WHAT IT ASSERTS
// Every non-fenced line carrying a comparison against a number, or a
// budget/ceiling/limit phrase with one, carries ONE of:
//   - a backticked producing command on the same line -- `nx build ui`,
//     `verify:pack`, anything with a word in backticks. The bar is deliberately
//     low: naming the thing that prints the number is the whole ask.
//   - the literal phrase `ratchet, not a target` -- the honest label for a
//     number that means "no worse than today" and was never derived from
//     anything else.
//   - `lint-thresholds: waive -- <reason, >= 15 chars>`, a parsed directive for
//     the same reason `lint-silent-drops` gives: the invented budget was
//     ALREADY surrounded by prose justifying it, so a rule honouring prose
//     would have passed the exact line it was written for.
//
// SCOPE, and why the cutoff
// `docs/superpowers/plans/*.md` and `docs/superpowers/specs/*.md` whose
// `YYYY-MM-DD-` filename prefix is >= the cutoff below. Derived from the
// filenames, never a hand-list. The historical plans are a record and are left
// alone -- rewriting them to satisfy a linter is the failure mode `lint-cdn-pins`
// documents at length. The cost, stated: on the day this landed the scope was
// EMPTY, and it stays empty until the next plan is written. That is deliberate,
// and it is why the anti-vacuity work lives in `--self-test` rather than in a
// findings count.
//
// AN EMPTY SCOPE IS A PASS HERE, and it is loud about it -- the run prints the
// file count and the cutoff, so "0 findings" can never be read as "the plans
// were checked". A MISSING plans/ or specs/ directory is a HARD FAILURE: that
// is the tree having moved under this script, which would silence it forever.
//
// A file in those directories with NO date prefix is also a hard failure. The
// scope is derived from filenames, so a file this cannot date is a hole in a
// derived list, and this repo's most expensive recurring defect is a silent
// skip. The fix is to rename the file to the convention every other file in
// those directories already follows.
//
// WHY NOT PARSE THE FENCES TOO
// Commands legitimately contain numbers -- ports, versions, shard counts, `-j4`
// -- and a guard that fired on those would be noise, and a noisy guard gets
// disabled. Fenced blocks are skipped whole. The target is prose and tables,
// which is where a budget is ASSERTED rather than executed.
//
// Usage:
//   node packages/ui/scripts/lint-threshold-derivation.mjs
//   node packages/ui/scripts/lint-threshold-derivation.mjs --list
//   node packages/ui/scripts/lint-threshold-derivation.mjs --self-test
import { readFileSync, readdirSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

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

const SCAN_DIRS = ['docs/superpowers/plans', 'docs/superpowers/specs'];
// The day this guard landed. Documents written before it are a record, not a
// backlog. Not a measurement -- a boundary, and the one number here that no
// script can produce.
const CUTOFF = argOf('--cutoff') ?? '2026-08-19';

const DATED = /^(\d{4}-\d{2}-\d{2})-/;

// A comparison against a number, in either direction and either notation.
const COMPARISON = /(?:[<>]=?|[≤≥])\s*~?\s*\d/;
// A budget phrase with a number IN THE BUDGET POSITION, in BOTH orders --
// "under 6000 bytes" and "the 12.5 MiB ceiling" are the same claim, and only
// having the first cost this guard a self-test case. `\b` on every word so
// `unlimited` and `delimiter` do not read as `limit`. The trailing form takes
// only the NOUNS: a number followed by "under" is ordinary English.
//
// ADJACENCY IS THE WHOLE PRECISION STORY, and it was learned the expensive way.
// Both patterns used to allow up to 40 arbitrary non-period characters between
// the budget word and the digit, which is not "near" -- it is most of a
// sentence. On this guard's FIRST LIVE FIRING it turned required CI red on
//
//   Owner-approved 2026-08-19. Question under test: after iteration 1's fixes
//
// matching `under test: after iteration 1`: a budget word and a digit with 23
// characters of unrelated prose in between, and no threshold anywhere on the
// line. A guard that cries wolf on its debut is worse than no guard, because the
// next red gets waived on sight.
//
// So only whitespace and a CLOSED SET of qualifiers may sit between the word and
// the number ("under the 12.5", "a maximum of 10", "under roughly 200 KB"), and
// on the trailing side the number may be followed by at most one unit word
// ("12.5 MiB ceiling", "3 second budget"). Prose cannot sneak through a closed
// list, which is the property the character budget never had.
const BUDGET_QUALIFIER = '(?:\\s+(?:the|a|an|of|about|roughly|approximately|around|some|just|only|say|to)\\b)*';
const BUDGET_BEFORE = new RegExp(
  '\\b(?:budget|ceiling|cap|quota|threshold|limit|at most|no more than|fewer than|less than|' +
    'greater than|under|below|beneath|over|above|beyond|within|max|maximum|min|minimum)\\b' +
    BUDGET_QUALIFIER +
    '\\s*(?:~|≈)?\\s*\\d',
  'i',
);
const BUDGET_AFTER = /\d[\d.,]*\s*(?:[A-Za-z%]+\s+)?(?:budget|ceiling|cap|quota|threshold|limit)\b/i;

const BACKTICK_COMMAND = /`[^`]*\w[^`]*`/;
const RATCHET = /ratchet, not a target/;
const WAIVER = /lint-thresholds:\s*waive\s*--\s*(.{15,})/;

/** Every threshold line in one document's text that lacks a derivation. */
export function analyze(text) {
  const lines = text.split('\n');
  const out = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (t.startsWith('```') || t.startsWith('~~~')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const isThreshold = COMPARISON.test(line) || BUDGET_BEFORE.test(line) || BUDGET_AFTER.test(line);
    if (!isThreshold) continue;
    if (BACKTICK_COMMAND.test(line) || RATCHET.test(line) || WAIVER.test(line)) continue;
    out.push({ line: i + 1, text: t });
  }
  return out;
}

/** The dated files in scope, and the undated ones this cannot place. */
export function filesInScope(rootDir, dirs, cutoff) {
  const inScope = [];
  const undated = [];
  const missing = [];
  for (const dir of dirs) {
    const full = join(rootDir, dir);
    if (!existsSync(full)) {
      missing.push(dir);
      continue;
    }
    for (const name of readdirSync(full).sort()) {
      if (!name.endsWith('.md')) continue;
      const m = DATED.exec(name);
      if (!m) {
        undated.push(join(full, name));
        continue;
      }
      if (m[1] >= cutoff) inScope.push(join(full, name));
    }
  }
  return { inScope, undated, missing };
}

// ---------------------------------------------------------------------------
// self-test: this guard's scope is empty on the day it lands, so the ONLY thing
// standing between it and permanent vacuity is this.
// ---------------------------------------------------------------------------
const CASES = [
  { name: 'a bare byte budget in prose -- THE DEFECT THIS IS BUILT FROM', expect: true,
    text: 'The generated file must stay under 6000 bytes, so the check is cheap.' },
  { name: 'a bare comparison operator', expect: true,
    text: 'Reject any run where the artifact is < 6000 bytes.' },
  { name: 'a ceiling with no producer', expect: true,
    text: 'Total unpacked size must stay below the 12.5 MiB ceiling.' },
  { name: 'a noun AFTER the number ("the 12.5 MiB ceiling")', expect: true,
    text: 'Hold it to the 12.5 MiB ceiling agreed in review.' },
  { name: '"at most N" with nothing behind it', expect: true,
    text: 'The scan should take at most 3 seconds on a quiet box.' },
  { name: 'a table row asserting a budget', expect: true,
    text: '| pack weight | no more than 12.5 MiB | the tarball a consumer downloads |' },
  { name: 'THE FIX: a backticked producing command on the same line', expect: false,
    text: 'Total unpacked size must stay under the ceiling `verify:pack` prints on every run.' },
  { name: 'THE FIX: labelled as a ratchet', expect: false,
    text: 'Hold the count at >= 36 -- a ratchet, not a target.' },
  { name: 'THE FIX: an explicit waiver', expect: false,
    text: 'Budget 3 rounds. lint-thresholds: waive -- a scheduling choice, not a measurement' },
  { name: 'a waiver with too short a reason does not count', expect: true,
    text: 'Budget 3 rounds. lint-thresholds: waive -- small' },
  { name: 'a number inside a fenced block is a command, not a claim', expect: false,
    text: '```bash\nnx build ui --parallel=3 && node --max-old-space-size=4096 x.mjs\n```' },
  { name: 'a threshold inside a fence is skipped too, and that is the stated cost', expect: false,
    text: '```\nassert(size < 6000)\n```' },
  { name: 'prose with no number at all', expect: false,
    text: 'The generator writes into the source tree, so a cache restore does not put it back.' },
  { name: 'a date is not a threshold', expect: false,
    text: 'Recorded 2026-08-18 after the third run.' },
  { name: 'a version is not a threshold', expect: false,
    text: 'The release job pins npm@12.0.2 for trusted publishing.' },
  { name: '"unlimited" must not read as "limit"', expect: false,
    text: 'The transport is unlimited in the 2 directions it multiplexes.' },
  { name: 'a section reference is not a threshold', expect: false,
    text: 'See docs/coupling-map.md 4 for the derived lists.' },
  // -- THE FALSE POSITIVE THIS GUARD'S FIRST LIVE FIRING PRODUCED --
  // A budget WORD and a digit in the same sentence, with neither related to the
  // other. These are the regression cases: a guard that is loud about nothing
  // gets its next real finding waived on sight.
  { name: 'the exact line that turned CI red: "under test" + a later digit', expect: false,
    text: "Owner-approved 2026-08-19. Question under test: after iteration 1's fixes, can an outsider" },
  { name: 'its minimal reduction, so the case survives the doc being edited', expect: false,
    text: 'Question under test: after iteration 1 fixes' },
  { name: '"under review" with a numbered iteration later in the line', expect: false,
    text: 'The work is under review; iteration 2 lands Friday.' },
  // -- and the other direction: adjacency must not have cost real detection --
  { name: 'STILL FIRES: a bare byte budget, the number adjacent', expect: true,
    text: 'The generated file must stay under 6000 bytes.' },
  { name: 'STILL FIRES: an article between the word and the number', expect: true,
    text: 'Total unpacked size must stay under the 12.5 MiB ceiling.' },
  { name: 'STILL FIRES: a hedge between the word and the number', expect: true,
    text: 'Keep it under roughly 200 KB.' },
  { name: 'STILL FIRES: "a maximum of 10"', expect: true,
    text: 'A maximum of 10 retries before it gives up.' },
];

// Imported for its analyzers (a test, or a probe) rather than invoked? Then
// nothing below this line should happen. Without this the module's top level IS
// the program: `await import(...)` runs the real lint and then `process.exit()`s
// out of the IMPORTER, and an importer whose own argv happens to carry
// `--self-test` gets the self-test instead. Same mechanism and same reasoning as
// lint-gate-parity.mjs; this file shipped without it and a verifier caught it.
const IS_MAIN = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (SELF_TEST && IS_MAIN) {
  let failed = 0;
  const report = (ok, name, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` ${detail}` : ''}`);
  };

  for (const c of CASES) {
    const got = analyze(c.text).length > 0;
    report(got === c.expect, c.name, `(expected ${c.expect ? 'a finding' : 'clean'}, got ${got ? 'a finding' : 'clean'})`);
  }

  // -- scoping, on a real temp tree --
  const tmp = mkdtempSync(join(tmpdir(), 'threshold-derivation-'));
  try {
    const plans = join(tmp, 'docs/superpowers/plans');
    const specs = join(tmp, 'docs/superpowers/specs');
    for (const d of [plans, specs]) mkdirSync(d, { recursive: true });
    const bare = 'The artifact must stay under 6000 bytes.\n';
    writeFileSync(join(plans, '2026-08-20-new-plan.md'), bare);
    writeFileSync(join(plans, '2026-08-18-old-plan.md'), bare);
    writeFileSync(join(specs, '2026-08-19-cutoff-day.md'), bare);

    const scope = filesInScope(tmp, SCAN_DIRS, '2026-08-19');
    const names = scope.inScope.map((f) => f.split('/').pop()).sort();
    report(
      JSON.stringify(names) === JSON.stringify(['2026-08-19-cutoff-day.md', '2026-08-20-new-plan.md']),
      'the cutoff is inclusive, and an earlier plan is out of scope',
      `(${names.join(', ')})`,
    );
    report(scope.missing.length === 0, 'both directories present -> no missing-dir failure');
    report(scope.undated.length === 0, 'no undated file -> no undated failure');

    writeFileSync(join(plans, 'README.md'), bare);
    report(filesInScope(tmp, SCAN_DIRS, '2026-08-19').undated.length === 1, 'an UNDATED file in scope is reported, never silently skipped');

    rmSync(specs, { recursive: true, force: true });
    report(filesInScope(tmp, SCAN_DIRS, '2026-08-19').missing.length === 1, 'a MISSING scan directory is reported (the tree moved)');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  if (failed > 0) {
    console.error(`\n✗ lint-threshold-derivation self-test: ${failed} case(s) failed.`);
    process.exit(1);
  }
  console.log(`\n✓ lint-threshold-derivation self-test: ${CASES.length + 5} cases behave as specified.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// the real run
// ---------------------------------------------------------------------------
if (!IS_MAIN) {
  // Imported as a library. `analyze` and `filesInScope` above are the exports;
  // there is nothing to run and, crucially, nothing to `process.exit()` out of
  // a caller.
} else {
const { inScope, undated, missing } = filesInScope(REPO_ROOT, SCAN_DIRS, CUTOFF);

if (missing.length > 0) {
  console.error(
    `\n✗ lint-threshold-derivation: ${missing.join(' and ')} does not exist under ${REPO_ROOT}.\n` +
      `  The scope is derived from those directories, so a missing one silences this guard\n` +
      `  completely rather than making it pass. The tree moved, or this script is misrooted.`,
  );
  process.exit(1);
}

if (undated.length > 0) {
  console.error(
    `\n✗ lint-threshold-derivation: ${undated.length} file(s) in the scan directories have no\n` +
      `  \`YYYY-MM-DD-\` prefix, so this guard cannot tell whether they are in scope:\n`,
  );
  for (const f of undated) console.error(`  - ${relative(REPO_ROOT, f)}`);
  console.error(
    `\n  Scope derived from filenames means a file it cannot date is a HOLE in a derived list,\n` +
      `  and a silent skip is this repo's most expensive recurring defect. Rename the file to\n` +
      `  the convention every other document in those directories already follows.`,
  );
  process.exit(1);
}

if (LIST) {
  for (const f of inScope) console.log(relative(REPO_ROOT, f));
  console.log(`\n${inScope.length} file(s) in scope (cutoff ${CUTOFF}).`);
  process.exit(0);
}

console.log(`  · ${inScope.length} files in scope (cutoff ${CUTOFF})`);

const findings = inScope.flatMap((f) =>
  analyze(readFileSync(f, 'utf8')).map((x) => ({ ...x, file: relative(REPO_ROOT, f) })),
);

if (findings.length === 0) {
  console.log(
    inScope.length === 0
      ? `✓ lint-threshold-derivation: nothing in scope yet -- every plan and spec predates the cutoff.`
      : `✓ lint-threshold-derivation: every threshold in ${inScope.length} document(s) names where its number comes from.`,
  );
  process.exit(0);
}

console.error(`\n✗ lint-threshold-derivation: ${findings.length} threshold(s) with no derivation.\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}\n    ${f.text.slice(0, 160)}\n`);
}
console.error(
  `  A numeric threshold with nothing behind it is a guess wearing a number, and everything\n` +
    `  downstream treats it as a measurement. A \`< 6000\` byte budget invented while drafting a\n` +
    `  plan reached an implementer's brief and was only stopped by that implementer refusing to\n` +
    `  weaken an assertion to meet it.\n\n` +
    `  Give the line ONE of:\n` +
    `    - the command that produces the number, in backticks\n` +
    `    - the phrase \`ratchet, not a target\` if it means "no worse than today"\n` +
    `    - lint-thresholds: waive -- <why this number needs no derivation, 15+ chars>`,
);
process.exit(1);
}
