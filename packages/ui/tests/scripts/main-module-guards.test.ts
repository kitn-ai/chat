import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every "am I the entry point?" guard in this REPO must still be TRUE when the
 * checkout sits on a path that percent-encodes.
 *
 * THE FAILURE THIS EXISTS FOR IS SILENT, WHICH IS WHY IT IS A TEST AND NOT A NOTE.
 * `import.meta.url` is a URL and percent-encodes; `process.argv[1]` is a path and
 * does not. A guard hand-built as `` import.meta.url === `file://${process.argv[1]}` ``
 * therefore compares `file:///My%20Repo/x.mjs` against `file:///My Repo/x.mjs` and is
 * false — so the guarded body never runs, the script exits 0, and nothing is printed.
 * Measured on `packages/ui` copied under `/private/tmp/kitn spaced repro`, three
 * scripts deep:
 *
 *   node scripts/gen-card-validation-schemas.mjs --check   -> exit 0, no output,
 *       with card-validate-schemas.ts DELIBERATELY CORRUPTED. The same command on an
 *       unspaced copy of the same tree exits 1 and names the staleness. That is
 *       `npm run verify:card-validation`, a guard, proving nothing.
 *   node scripts/gen-llms.mjs                              -> exit 0, llms.txt and
 *       llms-full.txt stay deleted.
 *   node scripts/gen-element-api.mjs                       -> exit 0 and prints
 *       "✓ dist/custom-elements.json — 80 elements", while element-meta.json,
 *       icon-names.json, element-types.d.ts, the React wrappers, llms.txt/llms-full.txt
 *       and docs/web-components.md are all skipped. Unspaced, the identical command
 *       prints eight ✓ lines. That is `npm run build:api`.
 *
 * WHY BEHAVIOURAL AND NOT A GREP. Banning the string `file://${` would be cheaper and
 * would have caught these three, but it checks spelling, not behaviour: it passes any
 * new hand-rolled form that is wrong in a way nobody has written yet, and it cannot
 * tell a guard that runs from a guard that is skipped — which is the entire defect.
 * This evaluates the REAL guard expressions, lifted out of the REAL sources, in a REAL
 * process whose entry path percent-encodes.
 *
 * WHY THE GUARD LIST IS EXTRACTED AND NOT RESTATED. Naming the scripts here would make
 * the fourth one — added next month, copied from one of these three — invisible. The
 * walk finds every `.mjs`/`.js` in the repo and the extractor finds every `if (…)`
 * whose condition mentions both `import.meta.url` and `process.argv[1]`, so a new
 * script is covered the day it lands. `covers every script that looks like it has a
 * guard` below is what keeps the extractor honest: if it silently stops matching, that
 * assertion goes red rather than this file passing over an empty list.
 *
 * WHY THE WALK IS ANCHORED AT THE REPO ROOT AND NOT AT `packages/ui`. It used to be
 * anchored at the package, which made the check's NAME broader than its POPULATION: a
 * guard in `.github/scripts/`, `apps/docs/scripts/`, `examples/` or at the repo root was
 * never evaluated, so this file could stay green while the exact defect it exists for
 * shipped one directory over. That is the same class of hole as the bug itself — a check
 * that passes because it is not looking. The anchor is asserted against a repo-root
 * marker file below, so moving this test file goes red loudly instead of silently
 * re-narrowing the net, and `walks past packages/ui` pins the widening itself.
 *
 * The fix, and the idiom already in `scripts/run-storybook-tests.mjs`:
 *
 *   import { pathToFileURL } from 'node:url';
 *   if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
 *
 * `pathToFileURL` is the idiom to REACH FOR, not the only spelling that is correct.
 * `examples/internal/openrouter-spike/harness/reasoning-coverage.mjs` compares
 * `resolve(process.argv[1])` against `resolve(fileURLToPath(import.meta.url))`, which is
 * equally space-safe because `fileURLToPath` DECODES. This file tests behaviour, so that
 * guard passes on its merits; the fixture preamble below therefore has to put `resolve`
 * and `fileURLToPath` in scope alongside `pathToFileURL`, or a correct guard would blow
 * up as a ReferenceError and read as a failure.
 */

/**
 * `packages/ui/tests/scripts/` → the repo root. Verified against a marker file rather
 * than trusted, because a wrong `..` count here silently changes what is scanned.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const REPO_ROOT_MARKER = 'pnpm-workspace.yaml';

/** Build output, dependencies, and report dirs: not sources we own. */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'storybook-static',
  'coverage',
  'test-results',
  'playwright-report',
]);

/**
 * Dot-directories are skipped wholesale: `.git`, `.nx` and `.claude` (which holds
 * throwaway worktrees — FULL COPIES of this repo, so descending would rescan everything
 * once per worktree). `.github` is the exception because CI scripts live there and are
 * exactly the kind of "runs on its own, prints nothing when skipped" code this guards.
 * `visits .github` below is what keeps this allowance from being quietly dropped.
 */
const ALLOWED_DOT_DIRS = new Set(['.github']);

const visitedDirs: string[] = [];

function walk(dir: string, out: string[] = []): string[] {
  visitedDirs.push(dir);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && !ALLOWED_DOT_DIRS.has(entry.name)) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(mjs|cjs|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Pull the condition text out of every `if (…)` that mentions both tokens.
 *
 * The paren matcher is naive about parens inside string literals. That is a deliberate
 * limit, not an oversight: none of the guards in this package contain one, and if a
 * future guard does, the extracted text is malformed and the fixture below fails to
 * PARSE — a loud SyntaxError, not a quiet skip. The failure mode of the shortcut is the
 * opposite of the failure mode this file exists to catch.
 */
function extractGuardConditions(source: string): string[] {
  const found: string[] = [];
  const ifRe = /\bif\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = ifRe.exec(source)) !== null) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let end = -1;
    for (let i = open; i < source.length; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')' && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end === -1) continue;
    const condition = source.slice(open + 1, end);
    if (condition.includes('import.meta.url') && condition.includes('process.argv[1]')) {
      found.push(condition.trim());
    }
  }
  return found;
}

const sources = walk(repoRoot).map((file) => ({
  file,
  rel: relative(repoRoot, file),
  text: readFileSync(file, 'utf8'),
}));

const guards = sources.flatMap((source) =>
  extractGuardConditions(source.text).map((condition, index) => ({
    rel: source.rel,
    index,
    condition,
  })),
);

/** Files that mention both tokens anywhere — the population the extractor must cover. */
const looksGuarded = sources
  .filter((s) => s.text.includes('import.meta.url') && s.text.includes('process.argv[1]'))
  .map((s) => s.rel)
  .sort();

describe('main-module guards survive a path that percent-encodes', () => {
  it('is anchored at the repo root', () => {
    // A wrong `..` count in `repoRoot` scans the wrong tree while every other assertion
    // in this file stays green, so pin it to something only the repo root has.
    expect(
      existsSync(join(repoRoot, REPO_ROOT_MARKER)),
      `repoRoot resolved to ${repoRoot}, which has no ${REPO_ROOT_MARKER}. ` +
        'This test moved; fix the `..` count rather than the marker.',
    ).toBe(true);
  });

  it('walks past packages/ui, into every workspace that can hold a script', () => {
    // THE HOLE THIS CLOSES. The walk used to start at `packages/ui`, so a guard in
    // `apps/`, `examples/`, `.github/scripts/` or at the repo root was never evaluated
    // and this file was green on a population narrower than its name. Assert the SHAPE
    // of what got scanned, not a file count, so it survives files coming and going.
    const topLevel = new Set(sources.map((s) => s.rel.split('/')[0]));
    expect([...topLevel].sort()).toEqual(
      expect.arrayContaining(['apps', 'examples', 'packages']),
    );
  });

  it('visits .github, which the dot-directory skip would otherwise hide', () => {
    // CI scripts live here and are precisely the "exits 0 having printed nothing" shape
    // this file exists for. The walk skips dot-dirs wholesale (`.git`, `.nx`, `.claude`
    // — the last holds full repo copies), so `.github` needs an explicit allowance, and
    // an allowance nobody asserts is one a tidy-up deletes.
    const rels = visitedDirs.map((d) => relative(repoRoot, d));
    expect(rels).toContain('.github');
    expect(rels).not.toContain('.git');
  });

  it('covers every script that looks like it has a guard', () => {
    // Non-vacuity, in the two directions it can fail. A refactor that breaks the
    // extractor, or a walk that stops finding scripts, must go red here instead of
    // letting the real assertion below pass over an empty list.
    expect(looksGuarded.length).toBeGreaterThan(0);
    expect([...new Set(guards.map((g) => g.rel))].sort()).toEqual(looksGuarded);
  });

  it('every guard is true when its script IS the entry point', () => {
    // realpathSync on BOTH the tmp root and the created dir, on purpose. macOS
    // `os.tmpdir()` is `/var/folders/…` and `/var` is a symlink to `/private/var`.
    // Node realpaths the entry module for `import.meta.url` but leaves
    // `process.argv[1]` as given, so an unresolved tmp path makes even a CORRECT
    // pathToFileURL guard compare `/private/var/…` against `/var/…` and fail. That
    // would make this test red for a reason that has nothing to do with encoding, and
    // the obvious "fix" would be to loosen the comparison. Resolve it once, here, so
    // the only difference left between the two sides is the percent-encoding.
    //
    // The name carries a space (encodes to %20) and a '#' (encodes to %23, and is the
    // character that also truncates a hand-built URL at the fragment).
    const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'kai guard #probe-')));
    expect(dir).toMatch(/[ #]/);

    const fixture = join(dir, 'entry.mjs');
    writeFileSync(
      fixture,
      [
        // Everything a correct guard is allowed to be spelled with. `pathToFileURL` is
        // the house idiom; `resolve(process.argv[1]) === resolve(fileURLToPath(...))` is
        // the equally-safe form used in examples/internal/openrouter-spike. A guard that
        // reaches for a helper missing here dies as a ReferenceError, which would read as
        // "this guard is broken" when it is this preamble that is incomplete.
        "import { pathToFileURL, fileURLToPath } from 'node:url';",
        "import { resolve } from 'node:path';",
        'void pathToFileURL;',
        'void fileURLToPath;',
        'void resolve;',
        ...guards.map(
          (g) =>
            `console.log(${JSON.stringify(`${g.rel}#${g.index}`)} + '\\t' + Boolean(${g.condition}));`,
        ),
        '',
      ].join('\n'),
      'utf8',
    );

    const stdout = execFileSync(process.execPath, [fixture], { encoding: 'utf8' });
    const results = new Map(
      stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('\t') as [string, string]),
    );

    // Every guard reported, and every one of them true.
    expect([...results.keys()].sort()).toEqual(guards.map((g) => `${g.rel}#${g.index}`).sort());

    const skipped = guards
      .filter((g) => results.get(`${g.rel}#${g.index}`) !== 'true')
      .map((g) => `${g.rel}: ${g.condition}`);
    expect(
      skipped,
      'These guards are FALSE on a path containing a space, so the script exits 0 having ' +
        'done nothing. Use `import.meta.url === pathToFileURL(process.argv[1]).href`.',
    ).toEqual([]);
  });
});
