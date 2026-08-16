// Every script that reads `npm pack --json` must read it through the ONE parser
// that knows both container shapes.
//
// WHY THIS EXISTS
// ---------------
// npm 12 moved the top level of `npm pack --json` from an array to an object
// keyed by package name. `JSON.parse(raw)[0]` is `undefined` under it. That took
// down a release: create-kai's `prepublishOnly` died on
// `TypeError: Cannot read properties of undefined (reading 'files')` AFTER
// @kitn.ai/ui had already published, leaving a broken create-kai on the registry
// whose own fix could not ship. #241 fixed that one site and wrote the shared
// parser (<repo>/scripts/pack-listing.mjs).
//
// It fixed ONE site. Three more were sitting in packages/ui/scripts the whole
// time -- verify-dts-consumer.mjs, verify-consumer-sideeffects.mjs and
// verify-pack-weight.mjs -- each with its own hand-rolled version of the same
// parse, none of them reached by the incident and so none of them noticed. The
// lesson is not "fix those three": it is that nothing related the four sites, so
// fixing one taught the others nothing. THAT is what this file is for.
//
// WHY A LINT AND NOT MORE TESTS. The parser is already graded against captured
// fixtures of both shapes (packages/create-kai/test/pack-listing.test.ts), and
// that grading is worth exactly as much as the number of call sites that route
// through it. A fifth script added next month with its own `JSON.parse(raw)[0]`
// inherits none of it, and every check stays green until an npm bump. This is
// the only check that fires on the WRITING of the defect rather than on running
// the one npm that reveals it.
//
// WHAT IT CHECKS. Any .mjs under <repo>/scripts or <repo>/packages that invokes
// `npm pack` with `--json` must (a) import the shared parser, and (b) contain
// none of the hand-parse signatures. Both halves earn their place: (a) alone
// passes a file that imports the parser and then indexes `[0]` anyway, and (b)
// alone passes a brand-new script that hand-parses in a spelling not listed here.
//
// Those two roots are where every build guard in this repo lives; apps/ and
// examples/ are out of scope and the failure message prints what was scanned, so
// a reader can see the boundary rather than assume it covers everything.
//
// WHAT IT DOES NOT CATCH -- read this before trusting it.
//
// This is a SYNTACTIC scanner over source text, not a type-checker and not a
// real dataflow analysis, so it cannot be complete and should not be described
// as if it were. The class it reliably catches is the one every instance of this
// defect has actually belonged to: a script that spawns `npm pack --json` and
// then reads the container itself, in one of the shapes below.
//
//   caught  the pack output bound to a name that reaches `JSON.parse`, no matter
//           how the entry is then extracted -- `[0]`, destructuring,
//           `Object.values`, a spelling nobody has written yet
//   caught  the pack output bound to a name that never reaches the parser
//   caught  the three specific hand-parse spellings, even where the binding
//           cannot be resolved
//   caught  a pack reader that does not import the parser at all
//
//   MISSED  aliasing: `const b = raw; JSON.parse(b)` -- the trace follows one
//           binding, not a chain
//   MISSED  the pack output crossing a function boundary or a module
//   MISSED  a regex literal containing `//` or `/*`, which can confuse the
//           comment stripper
//   MISSED  anything under apps/ or examples/, which are not scanned
//
// An earlier version of this file enumerated extraction spellings only, and a
// probe using array destructuring walked straight through it. That is why the
// primary rule now follows the VALUE and the spelling list is only a backstop --
// and why the misses above are listed rather than left to be discovered. Each
// caught row has a case in `--self-test`, including the probe that got through.
//
// A zero-match run is a HARD FAILURE. A scan that finds no pack readers looks
// identical to a clean tree from outside, and this repo has shipped that.
//
//   node scripts/lint-pack-json-parse.mjs --self-test   # prove it still detects
//   node scripts/lint-pack-json-parse.mjs               # scan the tree

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF_TEST = process.argv.includes('--self-test');

/**
 * `--repo-root <dir>` points the scan at a throwaway tree instead of this repo,
 * which is the seam tests/scripts/pack-parse-guard-wiring.test.ts uses to watch
 * the rules REJECT a planted defect. Same flag, same purpose, as lint-cdn-pins.
 * Without it the guard is only reachable by breaking a real script, which is how
 * a linter ends up in CI ungraded.
 */
const rootFlag = process.argv.indexOf('--repo-root');
const REPO_ROOT =
  rootFlag === -1 ? resolve(PKG_ROOT, '../..') : resolve(process.argv[rootFlag + 1]);

/** The module every pack reader must go through. */
const PARSER = 'scripts/pack-listing.mjs';

/**
 * Where a build script can live. The shared parser sits at the repo root
 * because it belongs to neither package; the readers live in each package.
 */
const SCAN_ROOTS = [join(REPO_ROOT, 'scripts'), join(REPO_ROOT, 'packages')];

/**
 * Files the scan must skip, and why each one would otherwise self-report.
 *
 * The parser is not a reader of its own output. This linter carries every
 * hand-parse spelling as a self-test fixture in string literals, so it matches
 * its own rules by construction -- what covers THIS file is `--self-test`, not
 * the scan.
 */
const EXEMPT = new Set([PARSER, 'packages/ui/scripts/lint-pack-json-parse.mjs']);

// --- the analyzer, pure over source text so the self-test can drive it -------

/**
 * Strip comments, keeping string literals intact.
 *
 * NOT cosmetic. The three sites this guard was written for now carry comments
 * QUOTING the code they replaced -- `JSON.parse(raw)[0]`, `raw.indexOf('[')` --
 * because a fix whose comment cannot name what it fixed is a worse fix. Scanning
 * raw text flagged all three the moment they were correct, which is the most
 * annoying possible failure mode: a guard that goes red on the explanation of
 * why it is green, and whose obvious workaround is to delete the explanation.
 *
 * Tracks quotes and escapes so a `//` inside a string is not read as a comment.
 * It does NOT understand regex literals, so a regex containing `//` or `/*`
 * could confuse it; no pack reader has one, and the self-test pins that a defect
 * sharing a line with a comment is still caught, which is the direction that
 * would hurt.
 */
function stripComments(source) {
  let out = '';
  let i = 0;
  /** @type {null | '"' | "'" | '`'} */
  let quote = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      if (ch === '\\') {
        out += ch + (next ?? '');
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Does this source spawn `npm pack ... --json`?
 *
 * Matched on the ARGV ARRAY rather than on a command string, because that is how
 * every caller here spells it (`execFileSync(npm, ['pack', '--json', ...])`) and
 * because it will not fire on prose. Innermost arrays only -- argv lists do not
 * nest, and not recursing keeps a `[['a']]` elsewhere in the file out of it.
 */
function isPackReader(source) {
  return [...source.matchAll(/\[[^[\]]*\]/g)].some(
    ([literal]) => /['"]pack['"]/.test(literal) && /['"]--json['"]/.test(literal),
  );
}

/** Goes through the shared parser. */
function importsParser(source) {
  return /from\s+['"][^'"]*pack-listing\.mjs['"]/.test(source);
}

/**
 * The hand-parse signatures, each one observed in this repo rather than
 * imagined. Naming them individually is what lets the failure say which spelling
 * it found instead of "something is wrong in here".
 */
const HAND_PARSE = [
  {
    // `raw.slice(raw.indexOf('['))` -- verify-pack-weight.mjs's variant, and the
    // worst: under the keyed shape the first literal `[` opens the `files` array,
    // so this yields a SyntaxError pointing into npm's output rather than the
    // legible `undefined.files` the other two give you.
    name: "slicing to the first literal '['",
    re: /\.indexOf\(\s*['"]\[['"]\s*\)/,
  },
  {
    // `JSON.parse(raw)[0]`
    name: 'indexing [0] straight off JSON.parse',
    re: /JSON\.parse\((?:[^()]|\([^()]*\))*\)\s*\[\s*0\s*\]/,
  },
  {
    // `packed[0].filename` -- the parse and the index split across two statements.
    name: 'reading a packed-entry field off [0]',
    re: /\[\s*0\s*\]\s*(?:\?\.|\.)\s*(?:filename|files|entryCount|unpackedSize|shasum|integrity)\b/,
  },
];

/**
 * FOLLOW THE VALUE, not the spelling.
 *
 * The rules above enumerate ways of picking the first entry out, and an
 * enumeration is never finished: `const [entry] = JSON.parse(raw)` destructures
 * instead of indexing and matches none of them. It got past an earlier version
 * of this file, and chasing it with a fourth regex would just move the boundary
 * one spelling further out.
 *
 * So the primary rule ignores how the entry is extracted and asks what happens
 * to the pack OUTPUT: the variable it is bound to must reach the shared parser,
 * and must not reach `JSON.parse`. Every extraction spelling — indexing,
 * destructuring, `Object.values`, one this file has never seen — needs a parse
 * first, so all of them fail the second half.
 *
 * @returns {{ routed: boolean, problems: string[] }}
 */
function tracePackOutput(source) {
  const problems = [];
  let routed = 0;

  for (const match of source.matchAll(/\[[^[\]]*\]/g)) {
    const literal = match[0];
    if (!/['"]pack['"]/.test(literal) || !/['"]--json['"]/.test(literal)) continue;

    // The statement the invocation sits in, back to the previous `;`. That is
    // enough to see both `readPackX(run(...))` and `const raw = execFileSync(...)`.
    const stmt = source.slice(source.lastIndexOf(';', match.index) + 1, match.index);

    // Consumed inline: `readPackedFilename(run('npm', ['pack', ...]), ...)`.
    if (/readPack\w*\s*\(/.test(stmt)) {
      routed += 1;
      continue;
    }

    // Otherwise it is bound to a name and read later. First assignment in the
    // statement, so `const raw = ...` and a bare `raw = ...` both land.
    const bound = /([A-Za-z_$][\w$]*)\s*=[^=]/.exec(stmt);
    if (!bound) {
      problems.push(
        'the result of `npm pack --json` is neither passed straight to the shared ' +
          'parser nor bound to a variable, so this guard cannot see what reads it',
      );
      continue;
    }

    const name = bound[1];
    // `$` is legal in a JS identifier and is a regex metacharacter, so a binding
    // called `$raw` would compile to a pattern that can never match and quietly
    // flag a clean file.
    const escaped = name.replace(/[$]/g, '\\$');
    const reaches = (fn) => new RegExp(`${fn}\\s*\\(\\s*${escaped}\\b`).test(source);

    if (reaches('JSON\\.parse')) {
      problems.push(
        `hand-parses the pack listing: \`JSON.parse(${name})\` on the output of ` +
          '`npm pack --json`, whatever is done with the result afterwards',
      );
    }
    if (!/readPack\w*\s*\(/.test(source) || !reaches('readPack\\w*')) {
      problems.push(
        `the output of \`npm pack --json\` is bound to \`${name}\`, which is never ` +
          'passed to the shared parser',
      );
    } else {
      routed += 1;
    }
  }

  return { routed: routed > 0, problems };
}

/** @returns {string[]} one message per problem; empty means clean. */
function analyze(raw) {
  const source = stripComments(raw);
  if (!isPackReader(source)) return [];
  const problems = [];
  if (!importsParser(source)) {
    problems.push(
      `reads \`npm pack --json\` but does not import the shared parser (${PARSER})`,
    );
  }
  problems.push(...tracePackOutput(source).problems);
  // Secondary net. Subsumed by the trace above in every case seen so far, but
  // kept because it needs no dataflow at all: it still fires in a file where the
  // binding could not be resolved, and it names the exact spelling.
  for (const { name, re } of HAND_PARSE) {
    if (re.test(source)) problems.push(`hand-parses the pack listing by ${name}`);
  }
  return [...new Set(problems)];
}

// --- self-test ---------------------------------------------------------------

const PACKS = `execFileSync('npm', ['pack', '--json', '--pack-destination', tmp], opts)`;
const IMPORT = `import { readPackedFilename } from '../../scripts/pack-listing.mjs';`;

const SELF_TEST_CASES = [
  {
    name: 'packs and reads [0].filename',
    source: `${PACKS}\nconst t = join(tmp, packed[0].filename);`,
    expect: 'flagged',
  },
  {
    name: "packs and slices to the first '['",
    source: `${PACKS}\nconst r = JSON.parse(raw.slice(raw.indexOf('[')));`,
    expect: 'flagged',
  },
  {
    name: 'packs and indexes JSON.parse directly',
    source: `${PACKS}\nconst r = JSON.parse(raw)[0];`,
    expect: 'flagged',
  },
  {
    name: 'packs and goes through the shared parser',
    source: `${IMPORT}\nconst { filename } = readPackedFilename(${PACKS}, { npmVersion });`,
    expect: 'clean',
  },
  {
    // THE CASE THAT MAKES BOTH HALVES NECESSARY. An import is not use: this file
    // would satisfy an import-only rule while shipping the exact defect.
    name: 'imports the parser but indexes [0] anyway',
    source: `${IMPORT}\nconst packed = JSON.parse(${PACKS});\nconst t = packed[0].filename;`,
    expect: 'flagged',
  },
  {
    // Scope control: the anti-patterns are only defects in a pack reader. A file
    // that never packs may index [0] off anything it likes.
    name: 'never packs, so [0].files is none of our business',
    source: `const meta = JSON.parse(readFileSync(p))[0];\nconst f = groups[0].files;`,
    expect: 'clean',
  },
  {
    // The three fixed sites all describe the code they replaced. Prose naming a
    // defect is not the defect.
    name: 'a comment quoting the old broken code is not a defect',
    source:
      `${IMPORT}\n` +
      `// what stood here was \`JSON.parse(raw.slice(raw.indexOf('[')))[0]\`, and\n` +
      `/* packed[0].filename was the other spelling */\n` +
      `const { filename } = readPackedFilename(${PACKS}, { npmVersion });`,
    expect: 'clean',
  },
  {
    // THE DIRECTION THAT WOULD HURT. Stripping comments must not become a way to
    // lose real code: a defect sharing a line with a comment is still a defect.
    name: 'a defect on the same line as a comment is still caught',
    source: `${PACKS}\nconst t = packed[0].filename; // normalised, honest\n`,
    expect: 'flagged',
  },
  {
    // A `//` inside a string is not a comment; eating from there would silently
    // truncate the rest of the file and take real defects with it.
    name: 'a // inside a string does not blind the rest of the file',
    source: `${PACKS}\nconst u = 'https://registry.npmjs.org';\nconst t = packed[0].filename;`,
    expect: 'flagged',
  },
  {
    // THE BYPASS THAT GOT THROUGH. Verbatim from the probe that beat the earlier
    // spelling-list version of this file: the parser is imported but unused, and
    // the entry is DESTRUCTURED rather than indexed, so none of the three
    // spelling regexes fire. Pinned here so the boundary is a test and not a
    // paragraph.
    name: 'destructuring the first entry instead of indexing it',
    source:
      `${IMPORT}\nconst raw = ${PACKS};\n` +
      `const [entry] = JSON.parse(raw);\nconsole.log(entry.filename);`,
    expect: 'flagged',
  },
  {
    // The same evasion one step further out: no destructuring either, just a
    // parse and a property read. The trace does not care what comes after.
    name: 'Object.values off the parsed output',
    source:
      `${IMPORT}\nconst raw = ${PACKS};\n` +
      `const e = Object.values(JSON.parse(raw))[0] ?? JSON.parse(raw);\nconsole.log(e.filename);`,
    expect: 'flagged',
  },
  {
    // The idiom verify-pack-weight.mjs uses: bind, then hand to the parser in a
    // later statement. Must stay clean, or the trace is just a stricter way of
    // rejecting everything.
    name: 'bound to a variable and parsed later, which is the real idiom',
    source:
      `${IMPORT}\nconst raw = ${PACKS};\n` +
      `const { entry } = readPackEntry(raw, { npmVersion });\nconsole.log(entry.filename);`,
    expect: 'clean',
  },
  {
    // `$` is a legal identifier character and a regex metacharacter. Unescaped,
    // the reachability probe compiles to a pattern matching nothing and reports
    // a correct file as broken.
    name: 'a $-prefixed binding name does not break the reachability probe',
    source:
      `${IMPORT}\nconst $raw = ${PACKS};\n` +
      `const { entry } = readPackEntry($raw, { npmVersion });\nconsole.log(entry.filename);`,
    expect: 'clean',
  },
];

if (SELF_TEST) {
  let failed = 0;
  for (const c of SELF_TEST_CASES) {
    const got = analyze(c.source).length > 0 ? 'flagged' : 'clean';
    if (got !== c.expect) {
      failed += 1;
      console.error(`  ✗ ${c.name}: expected ${c.expect}, got ${got}`);
    }
  }
  if (failed > 0) {
    console.error(
      `\n✗ lint-pack-json-parse self-test: ${failed}/${SELF_TEST_CASES.length} case(s) failed.`,
    );
    process.exit(1);
  }
  console.log(
    `✓ lint-pack-json-parse self-test: ${SELF_TEST_CASES.length}/${SELF_TEST_CASES.length} cases behave as specified.`,
  );
  process.exit(0);
}

// --- the scan ----------------------------------------------------------------

/**
 * Every .mjs below `dir`, not just the ones under a `scripts/` directory — a
 * pack reader is defined by what it does, not by where someone filed it.
 */
function collect(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (name.endsWith('.mjs')) out.push(full);
  }
  return out;
}

const candidates = SCAN_ROOTS.flatMap((root) => collect(root));

const readers = [];
const failures = [];

for (const file of candidates) {
  const rel = relative(REPO_ROOT, file);
  if (EXEMPT.has(rel)) continue;
  const source = readFileSync(file, 'utf8');
  if (!isPackReader(stripComments(source))) continue;
  readers.push(rel);
  for (const problem of analyze(source)) failures.push(`${rel}\n      ${problem}`);
}

// A scan that matched nothing proves nothing, and is indistinguishable from a
// clean tree in CI. There are pack readers in this repo; if this finds none, the
// detection broke or the scripts moved.
if (readers.length === 0) {
  console.error(
    '\n✗ lint-pack-json-parse: found no scripts invoking `npm pack --json` at all.\n' +
      `  Scanned: ${SCAN_ROOTS.map((r) => relative(REPO_ROOT, r)).join(', ')}\n` +
      '  Either the detection in isPackReader() has broken, or the guards moved.\n' +
      '  This is a failure and not a pass: a scan that matches nothing cannot fail.\n',
  );
  process.exit(1);
}

if (failures.length > 0) {
  console.error('\n✗ lint-pack-json-parse:\n');
  for (const f of failures) console.error(`  - ${f}\n`);
  console.error(
    `  npm 12 made the top level of \`npm pack --json\` an object keyed by package\n` +
      `  name; on npm <= 11 it is an array. \`[0]\` is \`undefined\` under the former and\n` +
      `  this exact defect broke a release mid-publish.\n\n` +
      `  Use the shared parser, which handles both and is graded against captured\n` +
      `  fixtures of each (packages/create-kai/test/pack-listing.test.ts):\n\n` +
      `      import { readPackEntry, readPackListing, readPackedFilename } from '<...>/${PARSER}';\n\n` +
      `      readPackedFilename(raw, { npmVersion })  ->  { filename, shape }\n` +
      `      readPackListing(raw, { npmVersion })     ->  { paths, shape }\n` +
      `      readPackEntry(raw, { npmVersion })       ->  { entry, shape }\n`,
  );
  process.exit(1);
}

console.log(
  `✓ pack-json parse: ${readers.length} script(s) read \`npm pack --json\`, all through ${PARSER} ` +
    `(${readers.join(', ')}).`,
);
